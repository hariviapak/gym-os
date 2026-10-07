// "Terms Pending Signature" reminders + dashboard verification:
// - gym member without acceptance appears in the section (Gym T&C badge)
// - Send link opens wa.me with a fresh signing link on the CURRENT host
// - signing through the public link clears the row
// - swimming member shows the Swimming Rules badge
// - dashboard Needs Attention links the section
// Usage: node scripts/test-terms-reminders.mjs [baseUrl]
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const BASE = process.argv[2] || "http://localhost:3000";
const BASE_HOST = BASE.replace(/^https?:\/\//, "");
const EMAIL = "792fitness@gmail.com";
const PASSWORD = "Admin@792Fit";
const GYM_ID = "00000000-0000-0000-0000-000000000001";

const envKeys = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.split("=")[0], l.split("=").slice(1).join("=")])
);
const db = createClient(envKeys.NEXT_PUBLIC_SUPABASE_URL, envKeys.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const istDate = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86400000 + 5.5 * 3600000);
  return d.toISOString().slice(0, 10);
};
const TODAY = istDate();

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
};

await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });

// ---- setup: gym member + swimming member, neither has signed terms ----
const { data: pkgGym } = await db.from("packages").select("id").eq("gym_id", GYM_ID).eq("type", "membership").limit(1).maybeSingle();
const { data: swimPkgs } = await db.from("packages").select("id").eq("gym_id", GYM_ID).eq("service_type", "swimming").limit(1).maybeSingle();

const { data: orphans } = await db.from("members").select("id").eq("gym_id", GYM_ID).in("first_name", ["Gymterms", "Swimterms"]);
for (const o of orphans ?? []) await db.rpc("hard_delete_member", { p_member_id: o.id });

async function makeMember(first, pkgId) {
  const phone = String(1000000000 + Math.floor(Math.random() * 8999999999));
  const { data: m } = await db
    .from("members")
    .insert({ gym_id: GYM_ID, first_name: first, last_name: "Pending", phone, status: "active" })
    .select()
    .single();
  if (pkgId) {
    const r = await db.from("memberships").insert({
      gym_id: GYM_ID,
      member_id: m.id,
      package_id: pkgId,
      start_date: TODAY,
      end_date: istDate(30),
      status: "active",
      amount: 3000,
      gst_amount: 0,
      total_amount: 3000,
      amount_paid: 3000,
    });
    if (r.error) {
      console.error("membership insert failed:", JSON.stringify(r.error));
      process.exit(1);
    }
  }
  return m;
}

const gymMember = await makeMember("Gymterms", pkgGym?.id);
const swimMember = swimPkgs?.id ? await makeMember("Swimterms", swimPkgs.id) : null;
if (!swimMember) console.log("note: no swimming package seeded — swim badge check will be skipped");

const browser = await chromium.launch();

async function staffPage() {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([page.waitForNavigation(), page.click("form button")]);
  return page;
}

// ---- 1. reminders section shows both pending rows ----
{
  const page = await staffPage();
  await page.goto(`${BASE}/dashboard/reminders`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const section = page.locator("#terms");
  check("Terms Pending section renders", (await section.count()) === 1);
  const txt = (await section.textContent()) ?? "";
  check("gym member listed with Gym T&C badge", txt.includes("Gymterms Pending") && txt.includes("Gym T&C"));
  if (swimMember) check("swim member listed with Swimming Rules badge", txt.includes("Swimterms Pending") && txt.includes("Swimming Rules"));
  check("anchor id present (#terms)", (await page.locator("#terms").count()) === 1);

  // ---- 2. send link for the gym member ----
  const row = section.locator('div.flex.items-center.justify-between').filter({ hasText: "Gymterms Pending" }).first();
  await row.getByRole("button", { name: "Send link" }).click();
  await page.waitForURL(/(wa\.me|api\.whatsapp\.com)/, { timeout: 20000, waitUntil: "commit" });
  const waUrl = decodeURIComponent(page.url().replace(/\+/g, " "));
  const m = waUrl.match(/https?:\/\/[^/]+\/sign\/([a-f0-9]+)/);
  check("wa.me opens with signing link", !!m);
  const token = m?.[1] ?? "";
  check("link host is the CURRENT app host", waUrl.includes(`${BASE_HOST}/sign/`));
  check("message greets member", waUrl.includes("Hello Gymterms Pending"));

  // ---- 3. member signs via the public link ----
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mpage = await ctx.newPage();
  await mpage.goto(`${BASE}/sign/${token}`, { waitUntil: "networkidle" });
  const mtxt = await mpage.evaluate(() => document.body.innerText);
  check("sign page shows the terms doc", mtxt.includes("Gym Terms & Conditions"));
  await mpage.getByPlaceholder("Gymterms Pending").fill("Gymterms Pending");
  const box = await mpage.locator("canvas").boundingBox();
  await mpage.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
  await mpage.mouse.down();
  for (let i = 0; i <= 10; i++) {
    await mpage.mouse.move(box.x + box.width * (0.2 + 0.06 * i), box.y + box.height * (0.5 + (i % 2 ? 0.15 : -0.15)));
  }
  await mpage.mouse.up();
  await mpage.locator('input[type="checkbox"]').check();
  await mpage.getByRole("button", { name: "Submit Signature" }).click();
  await mpage.getByText("Signature Recorded!").waitFor({ timeout: 20000 });
  check("signed successfully from reminders link", true);
  await ctx.close();

  // ---- 4. row cleared after signing ----
  await page.goto(`${BASE}/dashboard/reminders`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const txt2 = (await page.locator("#terms").textContent().catch(() => "")) ?? "";
  check("gym member no longer pending", !txt2.includes("Gymterms Pending"));
  if (swimMember) check("swim member still pending (different doc)", txt2.includes("Swimterms Pending"));

  await page.close();
}

// ---- 5. dashboard Needs Attention links the section ----
{
  const page = await staffPage();
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const link = page.getByRole("link", { name: /Terms pending signature/ });
  const n = await link.count();
  check("dashboard shows Terms pending signature row", n >= 1);
  if (n >= 1) {
    const href = await link.first().getAttribute("href");
    check("dashboard row links to reminders#terms", (href ?? "").includes("/dashboard/reminders#terms"));
  }
  await page.close();
}

await browser.close();

// cleanup
await db.rpc("hard_delete_member", { p_member_id: gymMember.id });
if (swimMember) await db.rpc("hard_delete_member", { p_member_id: swimMember.id });
const left = (await db.from("members").select("id").eq("gym_id", GYM_ID).eq("first_name", "Gymterms")).data.length;
check("cleanup: test members removed", left === 0);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed ? "FAILURES: " + failed : "ALL PASS"}: ${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(failed ? 1 : 0);

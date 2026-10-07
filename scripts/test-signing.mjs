// Terms signing end-to-end: staff sends the WhatsApp link (URL must carry the
// CURRENT host — the old bug baked in a dead deployment domain), the member
// opens it unauthenticated, signs, and the acceptance is recorded.
// Usage: node scripts/test-signing.mjs [baseUrl]
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

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
};

await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });

// ---- setup ----
const { data: orphans } = await db.from("members").select("id").eq("gym_id", GYM_ID).eq("first_name", "Signing");
for (const o of orphans ?? []) await db.rpc("hard_delete_member", { p_member_id: o.id });

const phone = String(1000000000 + Math.floor(Math.random() * 8999999999));
const { data: member } = await db
  .from("members")
  .insert({ gym_id: GYM_ID, first_name: "Signing", last_name: "Tester", phone, status: "active" })
  .select()
  .single();

const browser = await chromium.launch();

// ---- staff side: generate + send link ----
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([page.waitForNavigation(), page.click("form button")]);

  await page.goto(`${BASE}/dashboard/members/${member.id}/sign-terms`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);

  const sendBtn = page.locator("button", { hasText: "Send " }).first();
  check("send-link button present", (await sendBtn.count()) === 1);

  // click → server action redirects to wa.me; capture the URL
  await sendBtn.click();
  await page.waitForURL(/(wa\.me|api\.whatsapp\.com)/, { timeout: 20000, waitUntil: "commit" });
  const waUrl = decodeURIComponent(page.url().replace(/\+/g, " "));
  const m = waUrl.match(/https?:\/\/[^/]+\/sign\/([a-f0-9]+)/);
  check("whatsapp message contains a signing link", !!m, waUrl.slice(0, 90) + "…");
  const token = m?.[1] ?? "";
  check("link uses the CURRENT host (not stale env domain)", waUrl.includes(`${BASE_HOST}/sign/`), BASE_HOST);

  // the greeting is addressed to the member by name
  check("message greets the member", waUrl.includes("Hello Signing Tester"));

  // ---- member side: clean, unauthenticated context ----
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mpage = await ctx.newPage();
  await mpage.goto(`${BASE}/sign/${token}`, { waitUntil: "networkidle" });

  const mtxt = await mpage.evaluate(() => document.body.innerText);
  check("sign page is public (no login wall)", !/login/i.test(await mpage.url()));
  check("terms title renders", mtxt.includes("Gym Terms & Conditions"), mtxt.slice(0, 80));
  check("member name shown", mtxt.includes("Signing Tester"));
  check("Invalid link NOT shown", !mtxt.includes("Invalid Link"));

  // fill name, draw signature, agree, submit
  await mpage.getByPlaceholder("Signing Tester").fill("Signing Tester");
  const canvas = mpage.locator("canvas");
  const box = await canvas.boundingBox();
  await mpage.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.5);
  await mpage.mouse.down();
  for (let i = 0; i <= 10; i++) {
    await mpage.mouse.move(box.x + box.width * (0.2 + 0.06 * i), box.y + box.height * (0.5 + (i % 2 ? 0.15 : -0.15)));
  }
  await mpage.mouse.up();
  const submit = mpage.getByRole("button", { name: "Submit Signature" });
  await mpage.locator('input[type="checkbox"]').check();
  check("submit enabled after name + signature + agree", await submit.isEnabled());
  await submit.click();
  await mpage.getByText("Signature Recorded!").waitFor({ timeout: 20000 });
  check("signature submitted successfully", true);

  // member-side download affordances
  check("pre-sign: Download Terms (PDF) button present",
    (await mpage.getByRole("button", { name: "Download Terms (PDF)" }).count()) === 1);

  // ---- DB truth ----
  const { data: acc } = await db.from("terms_acceptances").select("id, accepted_by_method, signed_name").eq("member_id", member.id).maybeSingle();
  check("acceptance recorded (magic_link)", acc?.accepted_by_method === "magic_link", JSON.stringify(acc?.accepted_by_method));
  const { data: evs } = await db.from("member_events").select("event_type").eq("member_id", member.id);
  check("member event written", (evs ?? []).some((e) => e.event_type === "terms_accepted"));
  const { data: tok } = await db.from("signing_tokens").select("used_at").eq("token", token).maybeSingle();
  check("token marked used", !!tok?.used_at);

  // ---- member signed-copy route ----
  const copyLink = mpage.getByRole("link", { name: "Download Signed Copy (PDF)" });
  check("success screen links the signed copy", (await copyLink.count()) === 1);
  await copyLink.click();
  await mpage.waitForURL(/\/sign\/.+\/copy/, { timeout: 20000 });
  await mpage.waitForLoadState("networkidle");
  const copyTxt = await mpage.evaluate(() => document.body.innerText);
  check("signed copy shows the document", /Gym Terms & Conditions/.test(copyTxt) && /member signature/i.test(copyTxt));
  check("signed copy shows the signature image", (await mpage.locator('img[alt="Signature"]').count()) === 1);
  check("signed copy has Download PDF button", (await mpage.getByRole("button", { name: "Download PDF" }).count()) === 1);

  // ---- staff side: signed-documents page ----
  const spage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await spage.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await spage.fill('input[name="email"]', EMAIL);
  await spage.fill('input[name="password"]', PASSWORD);
  await Promise.all([spage.waitForNavigation(), spage.click("form button")]);
  await spage.goto(`${BASE}/dashboard/members/${member.id}/signed-documents`, { waitUntil: "networkidle" });
  const sTxt = await spage.evaluate(() => document.body.innerText);
  check("staff signed-documents renders", /Gym Terms & Conditions/.test(sTxt) && /member signature/i.test(sTxt));
  check("staff page has Download PDF button", (await spage.getByRole("button", { name: "Download PDF" }).count()) === 1);
  await spage.close();

  // member profile now links the page
  const ppage = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await ppage.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await ppage.fill('input[name="email"]', EMAIL);
  await ppage.fill('input[name="password"]', PASSWORD);
  await Promise.all([ppage.waitForNavigation(), ppage.click("form button")]);
  await ppage.goto(`${BASE}/dashboard/members/${member.id}`, { waitUntil: "networkidle" });
  check("profile links View signed documents",
    (await ppage.getByRole("link", { name: "View signed documents →" }).count()) === 1);
  await ppage.close();

  // ---- reuse guard ----
  await mpage.goto(`${BASE}/sign/${token}`, { waitUntil: "networkidle" });
  const reuseTxt = await mpage.evaluate(() => document.body.innerText);
  check("reused link shows Already Signed", reuseTxt.includes("Already Signed"));
  await ctx.close();
  await page.close();
}

// cleanup
await db.rpc("hard_delete_member", { p_member_id: member.id });
const left = (await db.from("members").select("id").eq("id", member.id)).data.length;
check("cleanup: test data removed", left === 0);

await browser.close();

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed ? "FAILURES: " + failed : "ALL PASS"}: ${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(failed ? 1 : 0);

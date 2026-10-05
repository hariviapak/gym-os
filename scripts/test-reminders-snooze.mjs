// Reminders v2 verification: snooze (3/7/30) with reveal + wake, per-section
// resend gaps (dues 3d), send-count + contacted-by, long-expired collapse,
// and dashboard counts that exclude snoozed rows.
// Usage: node scripts/test-reminders-snooze.mjs [baseUrl]
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const BASE = process.argv[2] || "http://localhost:3000";
const EMAIL = "admin@792fitness.com";
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

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
};

await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
const { data: adminUser } = await db.from("users").select("id").eq("email", EMAIL).single();
const { data: pkg } = await db.from("packages").select("id").eq("gym_id", GYM_ID).eq("type", "membership").limit(1).maybeSingle();

// ---- setup ----
const TEST_FIRST_NAMES = ["Snoozetest", "Gaptest", "Longexpired", "Recentexpired"];
const { data: orphans } = await db.from("members").select("id").eq("gym_id", GYM_ID).in("first_name", TEST_FIRST_NAMES);
for (const o of orphans ?? []) await db.rpc("hard_delete_member", { p_member_id: o.id });

async function makeMember(first, { paymentStatus = "partial", endOffset = 10, startOffset = -20, contacts = [] } = {}) {
  const phone = String(1000000000 + Math.floor(Math.random() * 8999999999));
  const { data: m } = await db
    .from("members")
    .insert({ gym_id: GYM_ID, first_name: first, last_name: "Pending", phone, status: "active" })
    .select()
    .single();
  const ms = await db.from("memberships").insert({
    gym_id: GYM_ID,
    member_id: m.id,
    package_id: pkg.id,
    start_date: istDate(startOffset),
    end_date: istDate(endOffset),
    status: "active",
    payment_status: paymentStatus,
    amount: 3000,
    gst_amount: 0,
    total_amount: 3000,
    amount_paid: paymentStatus === "partial" ? 1000 : 3000,
  });
  if (ms.error) {
    console.error("membership insert failed:", JSON.stringify(ms.error));
    process.exit(1);
  }
  for (const daysAgo of contacts) {
    await db.from("member_events").insert({
      gym_id: GYM_ID,
      member_id: m.id,
      event_type: "contact",
      title: "WhatsApp message sent",
      created_by: adminUser.id,
      created_at: new Date(Date.now() - daysAgo * 86400000).toISOString(),
    });
  }
  return m;
}

const snoozeMember = await makeMember("Snoozetest", { contacts: [4, 0.05] }); // last contact minutes ago → count 2, hidden button
const gapMember = await makeMember("Gaptest", { contacts: [4] }); // last contact 4d ago → dues gap is 3d → button back
const longExpired = await makeMember("Longexpired", { paymentStatus: "paid", endOffset: -90, startOffset: -120 });
const recentExpired = await makeMember("Recentexpired", { paymentStatus: "paid", endOffset: -5 });
console.log("setup: Snoozetest + Gaptest (dues), Longexpired (-90d), Recentexpired (-5d)");

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await Promise.all([page.waitForNavigation(), page.click("form button")]);

// ---- 1. dues section: counts, contacted-by, gap behavior ----
await page.goto(`${BASE}/dashboard/reminders`, { waitUntil: "networkidle" });
const dues = page.locator("#dues");
const duesTxt = (await dues.innerText()) ?? "";
check("snoozetest row in Pending Dues", duesTxt.includes("Snoozetest Pending"));
check("send-count + contacted-by shown (2× · Gym Admin)", /2× · Gym Admin/.test(duesTxt));
const gapRow = dues.locator("div.flex.items-center.justify-between").filter({ hasText: "Gaptest Pending" }).first();
check("gap member (4d-old contact) has button back — 3d gap", /Gaptest Pending/.test(duesTxt) && (await gapRow.locator('button[title="Send WhatsApp"]').count()) === 1);

// ---- 2. long-expired collapse ----
const expiredSec = page.locator("#expired");
const expiredTxt = (await expiredSec.innerText()) ?? "";
check("recent expired visible", expiredTxt.includes("Recentexpired Pending"));
check("long expired collapsed behind link", !expiredTxt.includes("Longexpired Pending") && /expired 60\+ days ago · show/.test(expiredTxt));
await expiredSec.getByText(/expired 60\+ days ago · show/).click();
await page.waitForTimeout(300);
check("long expired reveals", ((await expiredSec.textContent()) ?? "").includes("Longexpired Pending"));

// ---- 3. dashboard count before snooze ----
await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
const countText = async () => {
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  const el = page.getByRole("link", { name: /Payments due/ });
  if ((await el.count()) === 0) return 0;
  const m = (((await el.first().textContent()) ?? "").trim()).match(/^(\d+)/);
  return m ? Number(m[1]) : 0;
};
const before = await countText();
check("dashboard shows Payments due count", before > 0, `${before} (includes Snoozetest)`);

// ---- 4. snooze the dues row (3 days) ----
await page.goto(`${BASE}/dashboard/reminders`, { waitUntil: "networkidle" });
const row = page.locator("#dues div.flex.items-center.justify-between").filter({ hasText: "Snoozetest Pending" }).first();
await row.locator('button[title="Snooze this reminder"]').click();
await page.getByRole("button", { name: "3 days", exact: true }).click();
await page.waitForFunction(
  () => {
    const t = document.querySelector("#dues")?.innerText ?? "";
    return !t.includes("Snoozetest Pending") && /snoozed · show/.test(t);
  },
  { timeout: 20000 }
);
const duesAfter = (await page.locator("#dues").innerText()) ?? "";
check("row hidden after snooze", !duesAfter.includes("Snoozetest Pending"));
check("snoozed reveal present", /snoozed · show/.test(duesAfter));

// ---- 5. dashboard count excludes the snoozed member ----
const after = await countText();
check("dashboard count drops while snoozed", after === before - 1, `${before} → ${after}`);

// ---- 6. reveal + wake ----
await page.goto(`${BASE}/dashboard/reminders`, { waitUntil: "networkidle" });
await page.locator("#dues").getByText(/snoozed · show/).click();
await page.waitForTimeout(300);
const revealed = ((await page.locator("#dues").innerText()) ?? "");
check("snoozed row revealed with back-on pill", /Snoozetest Pending/.test(revealed) && /back on/.test(revealed));
await page.locator("#dues").getByRole("button", { name: "Wake" }).click();
await page.waitForFunction(
  () => {
    const t = document.querySelector("#dues")?.innerText ?? "";
    return t.includes("Snoozetest Pending") && !/snoozed · show/.test(t);
  },
  { timeout: 20000 }
);
const duesWoken = ((await page.locator("#dues").innerText()) ?? "");
check("wake brings the row back", /Snoozetest Pending/.test(duesWoken) && !/snoozed · show/.test(duesWoken));

// ---- 7. dashboard count restored ----
const restored = await countText();
check("dashboard count restored after wake", restored === before, `${restored}`);

await browser.close();

// ---- cleanup ----
for (const m of [snoozeMember, gapMember, longExpired, recentExpired]) {
  await db.rpc("hard_delete_member", { p_member_id: m.id });
}
const ids = [snoozeMember, gapMember, longExpired, recentExpired].map((m) => m.id);
const leftSnoozes = ((await db.from("reminder_snoozes").select("id").in("member_id", ids)).data ?? []).length;
check("cleanup: test members + snoozes removed", leftSnoozes === 0);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed ? "FAILURES: " + failed : "ALL PASS"}: ${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(failed ? 1 : 0);

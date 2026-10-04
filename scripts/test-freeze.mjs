// Freeze lifecycle verification: request → approve (full-range extension) →
// early unfreeze (credit-back of unused days), plus the >7-day backdate guard.
// Usage: node scripts/test-freeze.mjs [baseUrl]
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
const TODAY = istDate();

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
};

// ---- setup: member with a 30-day membership ----
await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
const { data: pkg } = await db.from("packages").select("id").eq("gym_id", GYM_ID).eq("type", "membership").limit(1).maybeSingle();
// remove leftovers from failed runs
const { data: orphans } = await db.from("members").select("id").eq("gym_id", GYM_ID).eq("first_name", "Freeze");
for (const o of orphans ?? []) await db.rpc("hard_delete_member", { p_member_id: o.id });
const phone = String(1000000000 + Math.floor(Math.random() * 8999999999));
const ins = await db
  .from("members")
  .insert({ gym_id: GYM_ID, first_name: "Freeze", last_name: "Tester", phone, status: "active" })
  .select()
  .single();
if (!ins.data) {
  console.error("member insert failed:", JSON.stringify(ins.error));
  process.exit(1);
}
const member = ins.data;
const msRes = await db
  .from("memberships")
  .insert({
    gym_id: GYM_ID,
    member_id: member.id,
    package_id: pkg.id,
    start_date: TODAY,
    end_date: istDate(30),
    status: "active",
    amount: 3000,
    gst_amount: 0,
    total_amount: 3000,
    amount_paid: 3000,
  })
  .select()
  .single();
if (!msRes.data) {
  console.error("membership insert failed:", JSON.stringify(msRes.error));
  await db.rpc("hard_delete_member", { p_member_id: member.id });
  process.exit(1);
}
const membership = msRes.data;
console.log(`setup: member ${member.id} membership end ${istDate(30)}`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await Promise.all([page.waitForNavigation(), page.click("form button")]);

await page.goto(`${BASE}/dashboard/members/${member.id}`, { waitUntil: "networkidle" });

// 1. request a 5-day freeze (today → today+4)
await page.getByText("Request a freeze").click();
await page.waitForTimeout(300);
await page.locator('input[name="start_date"]').fill(TODAY);
await page.locator('input[name="end_date"]').fill(istDate(4));
// the freeze form's submit button — find by form containing start_date input
const form = page.locator('form:has(input[name="start_date"])');
await form.locator('button[type="submit"]').click();
await page.getByText("Freeze request:").first().waitFor({ timeout: 20000 });
const banner1 = (await page.locator("div#freeze").textContent()) ?? "";
check("freeze request banner appears", /Freeze request/.test(banner1));

let freeze = (await db.from("membership_freezes").select("*").eq("member_id", member.id).single()).data;
check("freeze row pending in DB", freeze?.status === "pending");
check("freeze dates stored", freeze?.start_date === TODAY && freeze?.end_date === istDate(4));
const events1 = (await db.from("member_events").select("event_type").eq("member_id", member.id)).data.map((e) => e.event_type);
check("freeze_requested event written", events1.includes("freeze_requested"));
const audits1 = (await db.from("audit_logs").select("action").eq("entity_type", "membership_freezes").eq("entity_id", member.id)).data.map((a) => a.action);
check("audit freeze.requested", audits1.includes("freeze.requested"));

// 2. approve → status active + membership extended by 5 days
await page.getByRole("button", { name: "Approve", exact: true }).click();
await page.waitForFunction(() => document.querySelector("#freeze")?.textContent.includes("Frozen"), { timeout: 20000 });
freeze = (await db.from("membership_freezes").select("*").eq("member_id", member.id).single()).data;
check("freeze active after approve", freeze?.status === "active");
const msAfterApprove = (await db.from("memberships").select("end_date").eq("id", membership.id).single()).data;
check("membership extended by full 5 days", msAfterApprove?.end_date === istDate(35), `${msAfterApprove?.end_date} (want ${istDate(35)})`);
const banner2 = (await page.locator("div#freeze").textContent()) ?? "";
check("frozen banner shows", /Frozen/.test(banner2));
const events2 = (await db.from("member_events").select("event_type").eq("member_id", member.id)).data.map((e) => e.event_type);
check("freeze_approved event written", events2.includes("freeze_approved"));

// 3. unfreeze after 1 day frozen → only 1 day kept, 4 credited back
await page.getByRole("button", { name: "Unfreeze" }).click();
await page.waitForFunction(() => !document.querySelector("#freeze")?.textContent.includes("Frozen:"), { timeout: 20000 });
await page.waitForTimeout(600);
freeze = (await db.from("membership_freezes").select("*").eq("member_id", member.id).single()).data;
check("freeze ended", freeze?.status === "ended");
check("freeze end clamped to today", freeze?.end_date === TODAY);
const msAfterEnd = (await db.from("memberships").select("end_date").eq("id", membership.id).single()).data;
check("net extension = 1 day (4 credited back)", msAfterEnd?.end_date === istDate(31), `${msAfterEnd?.end_date} (want ${istDate(31)})`);
const events3 = (await db.from("member_events").select("event_type, description").eq("member_id", member.id)).data;
const endedEv = events3.find((e) => e.event_type === "freeze_ended");
check("freeze_ended event + credit note", !!endedEv && /credited back/.test(endedEv.description ?? ""), endedEv?.description);
const audits3 = (await db.from("audit_logs").select("action, changes").eq("entity_type", "membership_freezes").eq("entity_id", freeze.id)).data;
check("audit freeze.ended with adjustment", audits3.some((a) => a.action === "freeze.ended"), JSON.stringify(audits3.map((a) => a.action)));

// 4. backdate guard: request a freeze starting 8+ days ago → server rejects
await page.goto(`${BASE}/dashboard/members/${member.id}`, { waitUntil: "networkidle" });
await page.getByText("Request a freeze").click();
await page.waitForTimeout(300);
// lift the client-side min so we exercise the SERVER's backdate guard
await page.evaluate(() => document.querySelector('input[name="start_date"]')?.removeAttribute("min"));
await page.locator('input[name="start_date"]').fill(istDate(-8));
await page.locator('input[name="end_date"]').fill(istDate(-4));
const form2 = page.locator('form:has(input[name="start_date"])');
await form2.locator('button[type="submit"]').click();
await page.getByText("Cannot backdate freeze more than 7 days").first().waitFor({ timeout: 20000 });
const bodyTxt = await page.locator("body").textContent();
check("backdate >7 days rejected", /Cannot backdate freeze more than 7 days/.test(bodyTxt ?? ""));
const freezesNow = (await db.from("membership_freezes").select("id").eq("member_id", member.id)).data.length;
check("no freeze row created for rejected backdate", freezesNow === 1, `${freezesNow} rows`);

// ---- 5. day passes/trials cannot be frozen ----
{
  const { data: dpPkg } = await db
    .from("packages")
    .select("id")
    .eq("gym_id", GYM_ID)
    .eq("type", "day_pass")
    .limit(1)
    .maybeSingle();
  if (dpPkg) {
    const dpPhone = String(1000000000 + Math.floor(Math.random() * 8999999999));
    const { data: dpMember } = await db
      .from("members")
      .insert({ gym_id: GYM_ID, first_name: "Daypass", last_name: "Nofreeze", phone: dpPhone, status: "active" })
      .select()
      .single();
    await db.from("memberships").insert({
      gym_id: GYM_ID,
      member_id: dpMember.id,
      package_id: dpPkg.id,
      start_date: TODAY,
      end_date: TODAY,
      status: "active",
      amount: 600,
      gst_amount: 0,
      total_amount: 600,
      amount_paid: 600,
    });
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await Promise.all([page.waitForNavigation(), page.click("form button")]);
    await page.goto(`${BASE}/dashboard/members/${dpMember.id}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(600);
    const body = await page.locator("body").innerText();
    check("day pass: Freeze link hidden", !/>\s*Freeze\s*</.test(body) && !body.includes("Request a freeze"));
    await page.close();
    await db.rpc("hard_delete_member", { p_member_id: dpMember.id });
  } else {
    console.log("  (no day_pass package seeded — skip)");
  }
}

await browser.close();

// cleanup
await db.rpc("hard_delete_member", { p_member_id: member.id });
const left = (await db.from("members").select("id").eq("id", member.id)).data.length;
check("cleanup: test member removed", left === 0);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed ? "FAILURES: " + failed : "ALL PASS"}: ${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(failed ? 1 : 0);

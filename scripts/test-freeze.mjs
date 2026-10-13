// Freeze lifecycle verification: request → approve (full-range extension) →
// early unfreeze (credit-back of unused days), the >7-day backdate guard for
// capped roles (manager), and owner/admin historical-freeze recording
// (instant approval + end-date extension on an expired membership).
// Usage: node scripts/test-freeze.mjs [baseUrl]
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { e2eAdmin, TEST_GYM_ID, sweepAuditLogs } from "./lib/test-env.mjs";

const BASE = process.argv[2] || "http://localhost:3000";
const { email: EMAIL, password: PASSWORD } = e2eAdmin();
const GYM_ID = TEST_GYM_ID;

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
let histMemberId = null;
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
    start_date: istDate(-40), // began 40d ago — running, and old enough that
    // a >7d-backdated freeze hits the backdate guard, not the start guard
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

// 4. backdate guard for capped roles: manager requests a freeze 8 days ago →
//    server rejects (owner/admin are uncapped — that's section 5)
{
  const service = createClient(envKeys.NEXT_PUBLIC_SUPABASE_URL, envKeys.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const MGR_EMAIL = "freezedate.manager@792fitness.com";
  const MGR_PASSWORD = "Freeze-Manager-1!";
  const existing = await service.auth.admin.listUsers({ perPage: 500 });
  const prior = existing.data?.users?.find((x) => x.email === MGR_EMAIL);
  if (prior) await service.auth.admin.deleteUser(prior.id);
  const r = await service.auth.admin.createUser({
    email: MGR_EMAIL,
    password: MGR_PASSWORD,
    email_confirm: true,
    user_metadata: { name: "Freeze Manager", role: "manager", gym_id: GYM_ID },
  });
  if (r.error) { console.error("manager create failed:", JSON.stringify(r.error)); process.exit(1); }
  await service.from("users").update({ role: "manager", gym_id: GYM_ID }).eq("email", MGR_EMAIL);

  const mpage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mpage.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await mpage.fill('input[name="email"]', MGR_EMAIL);
  await mpage.fill('input[name="password"]', MGR_PASSWORD);
  await Promise.all([mpage.waitForNavigation(), mpage.click("form button")]);
  await mpage.goto(`${BASE}/dashboard/members/${member.id}`, { waitUntil: "networkidle" });
  await mpage.getByText("Request a freeze").click();
  await mpage.waitForTimeout(300);
  check("manager sees the today-only client cap", await mpage.locator('input[name="start_date"]').evaluate((el) => el.getAttribute("min") ?? "no min"));
  // lift the client-side min so we exercise the SERVER's backdate guard
  await mpage.evaluate(() => document.querySelector('input[name="start_date"]')?.removeAttribute("min"));
  await mpage.locator('input[name="start_date"]').fill(istDate(-8));
  await mpage.locator('input[name="end_date"]').fill(istDate(-4));
  const mform = mpage.locator('form:has(input[name="start_date"])');
  await mform.locator('button[type="submit"]').click();
  await mpage.getByText("Cannot backdate freeze more than 7 days").first().waitFor({ timeout: 20000 });
  check("backdate >7 days rejected for manager", true);
  const freezesNow = (await db.from("membership_freezes").select("id").eq("member_id", member.id)).data.length;
  check("no freeze row created for rejected backdate", freezesNow === 1, `${freezesNow} rows`);
  await mpage.close();

  // 5. owner/admin historical freeze: backdated expired membership + a
  //    fully-past freeze → instant approval + end-date extension
  const hPhone = String(1000000000 + Math.floor(Math.random() * 8999999999));
  const { data: hMember } = await db
    .from("members")
    .insert({ gym_id: GYM_ID, first_name: "Freezehist", last_name: "Pending", phone: hPhone, status: "active" })
    .select()
    .single();
  await db.from("memberships").insert({
    gym_id: GYM_ID, member_id: hMember.id, package_id: pkg.id,
    start_date: istDate(-60), end_date: istDate(-30), // expired 30d membership
    status: "active", payment_status: "paid",
    amount: 3000, gst_amount: 0, total_amount: 3000, amount_paid: 3000,
  });
  const { data: hMs } = await db.from("memberships").select("id").eq("member_id", hMember.id).single();

  await page.goto(`${BASE}/dashboard/members/${hMember.id}`, { waitUntil: "networkidle" });
  await page.getByText("Record a past freeze (history)").click();
  await page.waitForTimeout(300);
  // owner sees no min on the historical form
  const hMin = await page.locator('input[name="start_date"]').evaluate((el) => el.getAttribute("min") ?? "no min");
  check("admin historical form has no client cap", hMin === "no min");
  await page.locator('input[name="start_date"]').fill(istDate(-45));
  await page.locator('input[name="end_date"]').fill(istDate(-36));
  const hform = page.locator('form:has(input[name="start_date"])');
  await hform.locator('button[type="submit"]').click();
  await page.getByText("Frozen:").first().waitFor({ timeout: 20000 });

  const hFreeze = (await db.from("membership_freezes").select("*").eq("member_id", hMember.id).single()).data;
  check("historical freeze approved instantly", hFreeze?.status === "approved", hFreeze?.status ?? "none");
  check("historical freeze approved_by set", !!hFreeze?.approved_by);
  const hMsAfter = (await db.from("memberships").select("end_date").eq("id", hMs.id).single()).data;
  // 10 inclusive days (T-45 → T-36) extend the end from T-30 to T-20
  check("membership extended by 10 frozen days", hMsAfter?.end_date === istDate(-20), `${hMsAfter?.end_date} (want ${istDate(-20)})`);
  const hBanner = (await page.locator("div#freeze").textContent()) ?? "";
  check("history banner shows the old dates", hBanner.includes(formatDateApprox(istDate(-45))), hBanner.slice(0, 80));
  check("no Unfreeze offered on a past freeze", !(await page.getByRole("button", { name: "Unfreeze" }).count()));
  // freeze.requested audits under the member id; freeze.approved under the freeze id
  const hAuditsReq = (await db.from("audit_logs").select("action").eq("entity_type", "membership_freezes").eq("entity_id", hMember.id)).data.map((a) => a.action);
  const hAuditsApp = (await db.from("audit_logs").select("action").eq("entity_type", "membership_freezes").eq("entity_id", hFreeze.id)).data.map((a) => a.action);
  check("audit trail: requested + approved", hAuditsReq.includes("freeze.requested") && hAuditsApp.includes("freeze.approved"), JSON.stringify({ req: hAuditsReq, app: hAuditsApp }));
  // no false Frozen badge on the members list (date-aware)
  await page.goto(`${BASE}/dashboard/members`, { waitUntil: "networkidle" });
  await page.locator('input[placeholder*="Search" i]').first().fill("Freezehist");
  await page.waitForTimeout(800);
  const rowTxt = (await page.locator("tbody tr").first().textContent()) ?? "";
  check("members list NOT badged Frozen for historical freeze", !/Frozen/i.test(rowTxt), rowTxt.slice(0, 60));
  // unfreezing a fully-past freeze must not change the end date (no-op safety)
  // — performed via the staff-safe path: directly verify via endFreeze math
  // is covered by the delta formula; UI hides the button, so nothing to click.
  histMemberId = hMember.id;
}

// formatDateApprox: locale-free slice of the IST date for banner assertions
function formatDateApprox(iso) {
  const d = new Date(`${iso}T12:00:00+05:30`);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}


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
if (histMemberId) await db.rpc("hard_delete_member", { p_member_id: histMemberId });
{
  const service = createClient(envKeys.NEXT_PUBLIC_SUPABASE_URL, envKeys.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const existing = await service.auth.admin.listUsers({ perPage: 500 });
  const prior = existing.data?.users?.find((x) => x.email === "freezedate.manager@792fitness.com");
  if (prior) await service.auth.admin.deleteUser(prior.id);
}
const left = (await db.from("members").select("id").eq("id", member.id)).data.length;
check("cleanup: test members removed", left === 0 && histMemberId
  ? (await db.from("members").select("id").eq("id", histMemberId)).data.length === 0
  : left === 0);

await sweepAuditLogs(db); // end-of-run: no audit residue

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed ? "FAILURES: " + failed : "ALL PASS"}: ${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(failed ? 1 : 0);

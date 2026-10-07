// Quick Pass alignment e2e test — drives the real /dashboard/quick-pass form
// through a browser session and verifies the guarded enrollment path:
//   (a) existing phone + no choice → submit blocked in the form (warning strip)
//   (b) new phone → member + membership (+payment/receipt) + audit row, cleaned up
//   (c) existing phone + "Create as new member" → separate member, cleaned up
// Usage: node scripts/test-quick-pass.mjs [baseUrl]
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const BASE = process.argv[2] || "http://localhost:3000";
const EMAIL = "792fitness@gmail.com";
const PASSWORD = "Admin@792Fit";
const GYM_ID = "00000000-0000-0000-0000-000000000001";

const env = readFileSync(".env.local", "utf8");
const sbUrl = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const sbKey = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();

const anon = createClient(sbUrl, sbKey);
const { data: auth } = await anon.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
if (!auth?.session?.access_token) {
  console.error("login failed"); process.exit(1);
}
const db = createClient(sbUrl, sbKey, {
  global: { headers: { Authorization: `Bearer ${auth.session.access_token}` } },
});

// fixtures — self-provision the "existing member" (no demo-data dependency)
const qpPhone = String(1000000000 + Math.floor(Math.random() * 8999999999));
const { data: qpOrphans } = await db.from("members").select("id").eq("gym_id", GYM_ID).eq("first_name", "Qpseed");
for (const o of qpOrphans ?? []) await db.rpc("hard_delete_member", { p_member_id: o.id });
const { data: existingMember } = await db
  .from("members")
  .insert({ gym_id: GYM_ID, first_name: "Qpseed", last_name: "Test", phone: qpPhone, status: "active" })
  .select("id, first_name, phone")
  .single();
const { data: pkgRow } = await db
  .from("packages")
  .select("id, name, amount, type")
  .eq("gym_id", GYM_ID)
  .or("type.eq.day_pass,type.eq.trial")
  .gt("amount", 0)
  .limit(1)
  .maybeSingle();
const pkg = pkgRow ?? (await db.from("packages").select("id, name, amount, type").eq("gym_id", GYM_ID).limit(1)).data?.[0];

if (!existingMember || !pkg) {
  console.error("fixtures missing (member or package)"); process.exit(1);
}
console.log(`fixtures: member ${existingMember.first_name} · ${existingMember.phone} | package ${pkg.name} ₹${pkg.amount}`);

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
};

async function cleanup(memberId, label) {
  const { error } = await db.rpc("hard_delete_member", { p_member_id: memberId });
  if (error) console.error(`  cleanup failed for ${label}: ${error.message}`);
}

// ---- browser session ----
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.error("  pageerror:", e.message));

await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 60000 });
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await Promise.all([page.waitForNavigation({ timeout: 60000 }), page.click("form button")]);

const phoneInput = 'input[placeholder="Enter phone number..."]';
const selectPkg = () => page.locator("button", { hasText: pkg.name }).first().click();
const submitBtn = () => page.getByRole("button", { name: /Collect Payment & Issue Pass|Issue Pass/ });

// ---------- (a) ambiguous phone is blocked in the form ----------
console.log("(a) existing phone without picking member:");
await page.goto(`${BASE}/dashboard/quick-pass`, { waitUntil: "networkidle", timeout: 60000 });
await page.fill(phoneInput, existingMember.phone);
await page.waitForTimeout(300);
// clear the auto-match (exact unique phone auto-selects the member)
const useNew = page.getByRole("button", { name: "Use as new member" });
if (await useNew.count()) await useNew.click();
await page.waitForTimeout(200);
await selectPkg();
await page.waitForTimeout(200);
const warningVisible = await page.getByText("This number matches an existing member").isVisible().catch(() => false);
check("warning strip shown", warningVisible);
const disabled = await submitBtn().isDisabled().catch(() => true);
check("submit blocked until member picked or new confirmed", disabled);

// ---------- (b) new phone → full quick pass flow ----------
console.log("(b) new phone walk-in:");
const newPhone = "9" + String(Date.now()).slice(-9); // 10 digits
await page.goto(`${BASE}/dashboard/quick-pass`, { waitUntil: "networkidle", timeout: 60000 });
await page.fill(phoneInput, newPhone);
await page.fill('input[name="first_name"]', "QP Test");
await selectPkg();
await page.waitForTimeout(200);
await Promise.all([page.waitForNavigation({ timeout: 60000 }), submitBtn().click()]);
await page.waitForTimeout(1500);
const landed = page.url();

const normPhone = "91" + newPhone;
const { data: m } = await db.from("members").select("id, phone").eq("gym_id", GYM_ID).eq("phone", normPhone).maybeSingle();
check("member created with normalized phone", !!m, m ? m.phone : "not found");
if (m) {
  const { data: ms } = await db.from("memberships").select("id, package_name, status").eq("member_id", m.id).maybeSingle();
  check("membership created with package_name", !!ms?.package_name, ms?.package_name ?? "missing");
  const { data: pay } = await db.from("payments").select("id, amount").eq("member_id", m.id).maybeSingle();
  check("payment recorded", !!pay, pay ? `₹${pay.amount}` : "none");
  const { data: rec } = await db.from("receipts").select("id, receipt_no").eq("member_id", m.id).maybeSingle();
  check("receipt issued", !!rec, rec ? `#${rec.receipt_no}` : "none");
  const { data: audit } = await db
    .from("audit_logs")
    .select("id, changes")
    .eq("entity_id", m.id)
    .eq("action", "member.enrolled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  check("audit row (via quick_pass)", !!audit && audit.changes?.via === "quick_pass");
  console.log(`  landed: ${landed.replace(BASE, "")}`);
  await cleanup(m.id, "(b)");
  console.log("  cleaned up");
}

// ---------- (c) existing phone + explicit "create as new member" ----------
console.log("(c) duplicate phone, explicitly new:");
await page.goto(`${BASE}/dashboard/quick-pass`, { waitUntil: "networkidle", timeout: 60000 });
await page.fill(phoneInput, existingMember.phone);
await page.waitForTimeout(300);
if (await useNew.count()) await useNew.click();
await page.waitForTimeout(200);
await page.getByRole("button", { name: /Create as new member/ }).click();
await page.waitForTimeout(200);
await page.fill('input[name="first_name"]', "QP Test Two");
await selectPkg();
await page.waitForTimeout(200);
const canSubmit = !(await submitBtn().isDisabled().catch(() => true));
check("submit enabled after confirming new member", canSubmit);
await Promise.all([page.waitForNavigation({ timeout: 60000 }), submitBtn().click()]);
await page.waitForTimeout(1500);
const { data: dup } = await db
  .from("members")
  .select("id")
  .eq("gym_id", GYM_ID)
  .eq("phone", "91" + existingMember.phone.replace(/\D/g, "").slice(-10))
  .eq("first_name", "QP Test Two")
  .maybeSingle();
if (dup) {
  const { data: ms } = await db
    .from("memberships")
    .select("start_date, end_date, packages(type, duration_days)")
    .eq("member_id", dup.id)
    .limit(1)
    .maybeSingle();
  const pkg = ms?.packages;
  const sameDay = pkg?.duration_days === 1 ? ms?.start_date === ms?.end_date : true;
  check("day pass/trial ends SAME DAY (1-day)", sameDay, `${ms?.start_date} → ${ms?.end_date}`);
}
check("separate member created with same phone", !!dup && dup.id !== existingMember.id);
if (dup) {
  await cleanup(dup.id, "(c)");
  console.log("  cleaned up");
}

await browser.close();
await db.rpc("hard_delete_member", { p_member_id: existingMember.id });
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `FAILED: ${failed}/${results.length}` : `ALL PASS: ${results.length}/${results.length}`);
process.exit(failed ? 1 : 0);

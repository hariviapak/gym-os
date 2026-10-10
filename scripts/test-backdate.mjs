// Role-aware backdate cap verification (owner/admin free, everyone else 7 days):
// - admin: modal backdate 90d → accepted, end = start + duration, audit row
//   carries start_date, UI shows the "already expired · record-keeping" chip
// - manager (throwaway): modal backdate 8d → rejected with the 7-day banner
// - staff (frontdesk): wizard backdate 8d → rejected, no member created
// - admin: wizard backdate 90d → accepted, end honored, audit carries dates
// Usage: node scripts/test-backdate.mjs [baseUrl]
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { adminPassword, envKeys } from "./lib/test-env.mjs";
const db = createClient(envKeys.NEXT_PUBLIC_SUPABASE_URL, envKeys.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const service = createClient(envKeys.NEXT_PUBLIC_SUPABASE_URL, envKeys.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const BASE = process.argv[2] || "http://localhost:3000";
const EMAIL = "792fitness@gmail.com";
const PASSWORD = adminPassword();
const STAFF_EMAIL = "frontdesk@792fitness.com";
const STAFF_PASSWORD = "Front@792Fit";
const GYM_ID = "00000000-0000-0000-0000-000000000001";
const MANAGER_EMAIL = "backdate.manager@792fitness.com";
const MANAGER_PASSWORD = "Backdate-Manager-1!";

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

// the Supabase REST pooler can briefly serve stale snapshots right after a
// write (a fresh connection sees the row moments later) — poll for audit rows
const waitFor = async (fn, label, timeout = 20000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log("[timeout]", label);
  return null;
};

// ---- setup: a 30d membership package, a bare member, a throwaway manager ----
await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
const { data: pkg } = await db
  .from("packages")
  .select("id, name, duration_days, amount")
  .eq("gym_id", GYM_ID)
  .eq("type", "membership")
  .limit(1)
  .maybeSingle();
if (!pkg) { console.error("no membership package"); process.exit(1); }

const { data: orphans } = await db.from("members").select("id").eq("gym_id", GYM_ID).in("first_name", ["Backdatetest", "Backdatewiz"]);
for (const o of orphans ?? []) await db.rpc("hard_delete_member", { p_member_id: o.id });

const { data: modalMember } = await db
  .from("members")
  .insert({ gym_id: GYM_ID, first_name: "Backdatetest", last_name: "Pending", phone: String(1000000000 + Math.floor(Math.random() * 8999999999)), status: "active" })
  .select()
  .single();

// throwaway manager (trigger builds the users row from metadata)
{
  const existing = await service.auth.admin.listUsers({ perPage: 500 });
  const prior = existing.data?.users?.find((x) => x.email === MANAGER_EMAIL);
  if (prior) await service.auth.admin.deleteUser(prior.id);
  const r = await service.auth.admin.createUser({
    email: MANAGER_EMAIL,
    password: MANAGER_PASSWORD,
    email_confirm: true,
    user_metadata: { name: "Backdate Manager", role: "manager", gym_id: GYM_ID },
  });
  if (r.error) { console.error("manager create failed:", JSON.stringify(r.error)); process.exit(1); }
  await db.from("users").update({ role: "manager", gym_id: GYM_ID }).eq("email", MANAGER_EMAIL);
}

const membershipsOf = (id) =>
  db.from("memberships").select("id, start_date, end_date, status").eq("member_id", id).order("created_at", { ascending: true });

const browser = await chromium.launch();

async function login(page, email, password) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await Promise.all([page.waitForNavigation(), page.click("form button")]);
}

// ---- 1. admin: modal deep backdate (90d) → accepted + chip + audit ----
console.log("\n--- admin: modal deep backdate ---");
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await login(page, EMAIL, PASSWORD);
  await page.goto(`${BASE}/dashboard/members/${modalMember.id}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Renew / Add Service" }).click();
  await page.locator('select[name="package_id"]').waitFor({ timeout: 10000 });
  await page.locator('select[name="package_id"]').selectOption({ value: pkg.id });
  const startInput = page.locator('input[name="start_date"]');
  await startInput.waitFor({ timeout: 10000 });
  check("admin modal input has no min cap", !(await startInput.evaluate((el) => el.hasAttribute("min"))));
  await startInput.fill(istDate(-90));
  const chip = page.getByText(/already expired · record-keeping only/i);
  await chip.waitFor({ timeout: 5000 });
  check("already-expired chip shows for old starts", true);
  await page.getByRole("button", { name: "Renew Membership" }).click();
  await page.waitForTimeout(3000);
  const { data: list } = await membershipsOf(modalMember.id);
  const created = list?.[list?.length - 1];
  check("90d backdate accepted", created?.start_date === istDate(-90), `${created?.start_date}`);
  check("end = start + duration", created?.end_date === istDate(-90 + pkg.duration_days), `${created?.end_date}`);
  const audit = await waitFor(
    async () => {
      const { data } = await db.from("audit_logs").select("changes").eq("entity_id", created?.id).eq("action", "membership.renewed").order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data?.changes?.start_date === istDate(-90) ? data : null;
    },
    "modal renewal audit row"
  );
  check("audit row carries start_date", !!audit, JSON.stringify(audit?.changes ?? null).slice(0, 80));
  await page.close();
}

// ---- 2. manager: modal backdate 8d → rejected ----
console.log("\n--- manager: modal backdate blocked ---");
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await login(page, MANAGER_EMAIL, MANAGER_PASSWORD);
  await page.goto(`${BASE}/dashboard/members/${modalMember.id}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Renew / Add Service" }).click();
  await page.locator('select[name="package_id"]').waitFor({ timeout: 10000 });
  await page.locator('select[name="package_id"]').selectOption({ value: pkg.id });
  const startInput = page.locator('input[name="start_date"]');
  await startInput.waitFor({ timeout: 10000 });
  check("manager sees the 7-day client cap", await startInput.evaluate((el) => el.getAttribute("min") ?? "no min"));
  await page.evaluate(() => document.querySelector('input[name="start_date"]')?.removeAttribute("min"));
  await startInput.fill(istDate(-8));
  await page.getByRole("button", { name: "Renew Membership" }).click();
  await page.waitForURL(/error=/, { timeout: 20000 });
  check("backdate >7d rejected for manager", true, page.url().match(/error=[^&]*/)?.[0]?.slice(0, 60));
  const { data: list } = await membershipsOf(modalMember.id);
  check("no membership created", (list ?? []).length === 1, `${list?.length} rows`);
  await page.close();
}

// ---- 3. staff: wizard backdate 8d → rejected ----
console.log("\n--- staff: wizard backdate blocked ---");
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await login(page, STAFF_EMAIL, STAFF_PASSWORD);
  const staffPhone = String(1000000000 + Math.floor(Math.random() * 8999999999));
  await page.goto(`${BASE}/dashboard/members/new`, { waitUntil: "networkidle" });
  await page.fill('input[name="first_name"]', "Backdatewiz");
  await page.fill('input[name="phone"]', staffPhone);
  await page.getByRole("button", { name: "Next →" }).click();
  await page.locator("#wizard-step-2").waitFor({ timeout: 10000 });
  await page.locator("#wizard-step-2").scrollIntoViewIfNeeded();
  await page.locator('select[name="package_id"]').selectOption({ value: pkg.id });
  await page.waitForTimeout(400);
  const startInput = page.locator('input[name="start_date"]');
  await startInput.waitFor({ timeout: 10000 });
  check("staff sees the 7-day client cap", await startInput.evaluate((el) => el.getAttribute("min") ?? "no min"));
  await page.evaluate(() => document.querySelector('input[name="start_date"]')?.removeAttribute("min"));
  await startInput.fill(istDate(-8));
  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByRole("button", { name: "Complete Enrollment" }).click();
  await page.waitForURL(/error=/, { timeout: 20000 });
  check("wizard backdate >7d rejected for staff", true, page.url().match(/error=[^&]*/)?.[0]?.slice(0, 60));
  await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  const { data: none } = await db.from("members").select("id").eq("gym_id", GYM_ID).eq("phone", "91" + staffPhone).maybeSingle();
  check("no member created by the rejected submit", none === null);
  await page.close();
}

// ---- 4. admin: wizard backdate 90d → accepted ----
console.log("\n--- admin: wizard deep backdate ---");
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await login(page, EMAIL, PASSWORD);
  const wizPhone = String(1000000000 + Math.floor(Math.random() * 8999999999));
  await page.goto(`${BASE}/dashboard/members/new`, { waitUntil: "networkidle" });
  await page.fill('input[name="first_name"]', "Backdatewiz");
  await page.fill('input[name="last_name"]', "Oldstart");
  await page.fill('input[name="phone"]', wizPhone);
  await page.getByRole("button", { name: "Next →" }).click();
  await page.locator("#wizard-step-2").waitFor({ timeout: 10000 });
  await page.locator('select[name="package_id"]').selectOption({ value: pkg.id });
  await page.waitForTimeout(400);
  const startInput = page.locator('input[name="start_date"]');
  await startInput.waitFor({ timeout: 10000 });
  check("admin wizard input has no min cap", !(await startInput.evaluate((el) => el.hasAttribute("min"))));
  await startInput.fill(istDate(-90));
  const chip = page.getByText(/already expired · record-keeping only/i);
  await chip.waitFor({ timeout: 5000 });
  check("wizard chip shows for old starts", true);
  await page.getByRole("button", { name: "Next →" }).click();
  await page.getByRole("button", { name: "Complete Enrollment" }).click();
  await page.waitForURL(/enrolled=1/, { timeout: 30000 });
  const { data: wizMember } = await db.from("members").select("id").eq("gym_id", GYM_ID).eq("phone", "91" + wizPhone).maybeSingle();
  check("wizard backdated member created", !!wizMember);
  const { data: ms } = await membershipsOf(wizMember.id).maybeSingle();
  check("wizard 90d start honored", ms?.start_date === istDate(-90), `${ms?.start_date}`);
  check("wizard end = start + duration", ms?.end_date === istDate(-90 + pkg.duration_days), `${ms?.end_date}`);
  const audit = await waitFor(
    async () => {
      const { data } = await db.from("audit_logs").select("changes").eq("entity_id", wizMember.id).eq("action", "member.enrolled").order("created_at", { ascending: false }).limit(1).maybeSingle();
      return data?.changes?.start_date === istDate(-90) && data?.changes?.end_date === istDate(-90 + pkg.duration_days) ? data : null;
    },
    "enrollment audit row"
  );
  check("enrolled audit carries start/end dates", !!audit, JSON.stringify(audit?.changes ?? null).slice(0, 90));
  await page.close();
}

await browser.close();

// ---- cleanup ----
await db.rpc("hard_delete_member", { p_member_id: modalMember.id });
const { data: wizLeft } = await db.from("members").select("id, first_name").eq("gym_id", GYM_ID).eq("first_name", "Backdatewiz");
for (const w of wizLeft ?? []) await db.rpc("hard_delete_member", { p_member_id: w.id });
{
  const existing = await service.auth.admin.listUsers({ perPage: 500 });
  const prior = existing.data?.users?.find((x) => x.email === MANAGER_EMAIL);
  if (prior) await service.auth.admin.deleteUser(prior.id);
}
const leftoverMembers = (await db.from("members").select("id").eq("gym_id", GYM_ID).in("first_name", ["Backdatetest", "Backdatewiz"])).data.length;
check("cleanup: test members removed", leftoverMembers === 0);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed ? "FAILURES: " + failed : "ALL PASS"}: ${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(failed ? 1 : 0);

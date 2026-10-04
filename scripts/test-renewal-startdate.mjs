// Start-date override verification on renewals:
// - no active plan → prefilled today; staff can shift to a future date and
//   the membership's end follows start + duration
// - active plan → prefilled to queue after it; submitting unchanged queues
// - backdate cap: >7 days in the past is rejected server-side
// Usage: node scripts/test-renewal-startdate.mjs [baseUrl]
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

await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
const { data: pkg } = await db
  .from("packages")
  .select("id, name, duration_days, amount")
  .eq("gym_id", GYM_ID)
  .eq("type", "membership")
  .limit(1)
  .maybeSingle();

// ---- setup: member whose plan ENDED 2 days ago ----
const { data: orphans } = await db.from("members").select("id").eq("gym_id", GYM_ID).eq("first_name", "Startdate");
for (const o of orphans ?? []) await db.rpc("hard_delete_member", { p_member_id: o.id });
const phone = String(1000000000 + Math.floor(Math.random() * 8999999999));
const { data: member } = await db
  .from("members")
  .insert({ gym_id: GYM_ID, first_name: "Startdate", last_name: "Test", phone, status: "active" })
  .select()
  .single();
await db.from("memberships").insert({
  gym_id: GYM_ID,
  member_id: member.id,
  package_id: pkg.id,
  start_date: istDate(-32),
  end_date: istDate(-2),
  status: "active",
  payment_status: "paid",
  amount: 3000,
  gst_amount: 0,
  total_amount: 3000,
  amount_paid: 3000,
});

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await Promise.all([page.waitForNavigation(), page.click("form button")]);

const memberships = () =>
  db.from("memberships").select("start_date, end_date, status, package_name").eq("member_id", member.id).order("start_date", { ascending: true });

// ---- 1. no active plan → prefilled today → override to a future Monday ----
{
  await page.goto(`${BASE}/dashboard/members/${member.id}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Renew / Add Service" }).click();
  await page.locator('select[name="package_id"]').waitFor({ timeout: 10000 });
  await page.locator('select[name="package_id"]').selectOption({ value: pkg.id });
  const startInput = page.locator('input[name="start_date"]');
  await startInput.waitFor({ timeout: 10000 });
  const prefill = await startInput.inputValue();
  check("prefilled with today (no active plan)", prefill === TODAY, prefill);

  const future = istDate(3);
  await startInput.fill(future);
  await page.getByRole("button", { name: "Renew Membership" }).click();
  await page.waitForTimeout(3000);

  const { data: list } = await memberships();
  const created = list?.[list.length - 1];
  const wantEnd = istDate(3 + pkg.duration_days);
  check("future start honored (end = start + duration)", created?.start_date === future && created?.end_date === wantEnd,
    `${created?.start_date} → ${created?.end_date} (want ${future} → ${wantEnd})`);
}

// ---- 2. active plan → prefilled to queue after it; unchanged submit queues ----
{
  await page.goto(`${BASE}/dashboard/members/${member.id}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Renew / Add Service" }).click();
  await page.locator('select[name="package_id"]').waitFor({ timeout: 10000 });
  await page.locator('select[name="package_id"]').selectOption({ value: pkg.id });
  const startInput = page.locator('input[name="start_date"]');
  await startInput.waitFor({ timeout: 10000 });
  const prefill = await startInput.inputValue();
  const queuedStart = istDate(3 + pkg.duration_days);
  check("prefilled to queue after the active plan", prefill === queuedStart, `${prefill} (want ${queuedStart})`);

  await page.getByRole("button", { name: "Renew Membership" }).click();
  await page.waitForTimeout(3000);
  const { data: list } = await memberships();
  const newest = list?.[list.length - 1];
  check("queued renewal starts after prior end", newest?.start_date === queuedStart, `${newest?.start_date}`);
}

// ---- 3. backdate cap: >7 days in the past is rejected ----
{
  await page.goto(`${BASE}/dashboard/members/${member.id}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Renew / Add Service" }).click();
  await page.locator('select[name="package_id"]').waitFor({ timeout: 10000 });
  await page.locator('select[name="package_id"]').selectOption({ value: pkg.id });
  const startInput = page.locator('input[name="start_date"]');
  await startInput.waitFor({ timeout: 10000 });
  // lift the client min so the server guard is what we exercise
  await page.evaluate(() => document.querySelector('input[name="start_date"]')?.removeAttribute("min"));
  await startInput.fill(istDate(-8));
  await page.getByRole("button", { name: "Renew Membership" }).click();
  await page.getByText(/cannot be more than 7 days/i).first().waitFor({ timeout: 20000 });
  check("backdate >7 days rejected", true);
  const { data: list } = await memberships();
  check("no membership created by the rejected submit", (list ?? []).length === 3, `${list?.length} rows`);
}

await browser.close();

// cleanup
await db.rpc("hard_delete_member", { p_member_id: member.id });
const left = (await db.from("members").select("id").eq("id", member.id)).data.length;
check("cleanup: test member removed", left === 0);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed ? "FAILURES: " + failed : "ALL PASS"}: ${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(failed ? 1 : 0);

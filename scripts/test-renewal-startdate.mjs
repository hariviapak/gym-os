// Start-date override verification on renewals:
// - no active plan → prefilled today; staff can shift to a future date and
//   the membership's end follows start + duration
// - active plan → prefilled to queue after it; submitting unchanged queues
// - backdate cap: >7 days in the past is rejected server-side
// - expired plans: modal says "Last ... ended ... — expired, new plan starts
//   today", never "renewal queues after it"
// - yesterday-expired edge: daysUntil() returns -0, which used to fail every
//   < 0 check — profile rows, modal note, and Reminders bucketing must all
//   still treat the plan as expired
// Usage: node scripts/test-renewal-startdate.mjs [baseUrl]
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { adminPassword } from "./lib/test-env.mjs";

const BASE = process.argv[2] || "http://localhost:3000";
const EMAIL = "792fitness@gmail.com";
const PASSWORD = adminPassword();
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

// ---- setup 2: member whose plan ended YESTERDAY (the daysUntil -0 edge) ----
const orphans2 = (await db.from("members").select("id").eq("gym_id", GYM_ID).eq("first_name", "Yesterday").data) ?? [];
for (const o of orphans2) await db.rpc("hard_delete_member", { p_member_id: o.id });
const phone2 = String(1000000000 + Math.floor(Math.random() * 8999999999));
const { data: memberY } = await db
  .from("members")
  .insert({ gym_id: GYM_ID, first_name: "Yesterday", last_name: "Edge", phone: phone2, status: "active" })
  .select()
  .single();
await db.from("memberships").insert({
  gym_id: GYM_ID,
  member_id: memberY.id,
  package_id: pkg.id,
  start_date: istDate(-31),
  end_date: istDate(-1),
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

// ---- 0. expired plan → member shows Expired everywhere, modal never queues ----
{
  await page.goto(`${BASE}/dashboard/members/${member.id}`, { waitUntil: "networkidle" });
  check("profile badge shows Expired (derived)", (await page.getByText("Expired", { exact: true }).count()) >= 1);
  check("membership row shows expired", (await page.getByText("expired", { exact: true }).count()) >= 1);

  await page.getByRole("button", { name: "Renew / Add Service" }).click();
  await page.locator('select[name="package_id"]').waitFor({ timeout: 10000 });
  await page.locator('select[name="package_id"]').selectOption({ value: pkg.id });
  const note = page.locator("div.max-w-lg .rounded-lg.bg-blue-50");
  await note.waitFor({ timeout: 10000 });
  const noteText = (await note.innerText()).replace(/\s+/g, " ");
  check("modal says Last plan (not Current)", noteText.includes("Last Gym"), noteText);
  check("modal says ended with the expired date", noteText.includes("ended"), noteText);
  check("modal says expired, new plan starts today", noteText.includes("expired, new plan starts today"), noteText);
  check("modal never queues after an expired plan", !noteText.toLowerCase().includes("queues after it"), noteText);
  await page.keyboard.press("Escape");
}

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

  const note = page.locator("div.max-w-lg .rounded-lg.bg-blue-50");
  const noteText = (await note.innerText()).replace(/\s+/g, " ");
  check("running plan → note says Current", noteText.includes("Current Gym"), noteText);
  check("running plan → note says renewal queues after it", noteText.toLowerCase().includes("queues after it"), noteText);

  await page.getByRole("button", { name: "Renew Membership" }).click();
  await page.waitForTimeout(3000);
  const { data: list } = await memberships();
  const newest = list?.[list.length - 1];
  check("queued renewal starts after prior end", newest?.start_date === queuedStart, `${newest?.start_date}`);
}

// ---- 3. admin can now backdate >7 days (role-aware cap; capped roles are
// covered by test-backdate.mjs — this suite signs in as admin) ----
{
  await page.goto(`${BASE}/dashboard/members/${member.id}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Renew / Add Service" }).click();
  await page.locator('select[name="package_id"]').waitFor({ timeout: 10000 });
  await page.locator('select[name="package_id"]').selectOption({ value: pkg.id });
  // scope to the modal — the profile freeze form also has a start_date input
  // once the member holds a running membership plan
  const startInput = page.locator("div.max-w-lg").locator('input[name="start_date"]');
  await startInput.waitFor({ timeout: 10000 });
  const hasMin = await startInput.evaluate((el) => el.hasAttribute("min"));
  check("admin sees no client-side backdate cap", !hasMin);
  await startInput.fill(istDate(-8));
  await page.waitForTimeout(400); // let the controlled input settle its state
  await page.locator("div.max-w-lg").getByRole("button", { name: "Renew Membership" }).click();
  await page.waitForTimeout(3000);
  // memberships() orders by start_date — find the backdated row, don't take
  // the last element (the queued plans start later than the backdate)
  const { data: list } = await memberships();
  const backdated = (list ?? []).find((r) => r.start_date === istDate(-8));
  check("admin backdate 8 days accepted", !!backdated, `rows: ${(list ?? []).map((r) => r.start_date).join(", ")}`);
  const wantEnd = istDate(-8 + pkg.duration_days);
  check("backdated end = start + duration", backdated?.end_date === wantEnd, `${backdated?.end_date}`);
}

// ---- 4. yesterday-expired edge (-0): row, modal, and Reminders all say expired ----
{
  await page.goto(`${BASE}/dashboard/members/${memberY.id}`, { waitUntil: "networkidle" });
  check("yesterday-expired: badge shows Expired", (await page.getByText("Expired", { exact: true }).count()) >= 1);
  check("yesterday-expired: row shows expired, not 0d left",
    (await page.getByText("expired", { exact: true }).count()) >= 1 && (await page.getByText("0d left").count()) === 0);

  await page.getByRole("button", { name: "Renew / Add Service" }).click();
  await page.locator('select[name="package_id"]').waitFor({ timeout: 10000 });
  await page.locator('select[name="package_id"]').selectOption({ value: pkg.id });
  const startInput = page.locator('input[name="start_date"]');
  await startInput.waitFor({ timeout: 10000 });
  const prefill = await startInput.inputValue();
  check("yesterday-expired: prefill is today, not queued", prefill === TODAY, prefill);
  const note = page.locator("div.max-w-lg .rounded-lg.bg-blue-50");
  const noteText = (await note.innerText()).replace(/\s+/g, " ");
  check("yesterday-expired: note says ended + starts today", noteText.includes("ended") && noteText.includes("expired, new plan starts today"), noteText);
  check("yesterday-expired: note never queues", !noteText.toLowerCase().includes("queues after it"), noteText);
  await page.keyboard.press("Escape");

  await page.goto(`${BASE}/dashboard/reminders`, { waitUntil: "networkidle" });
  await page.locator("#expired").getByText("Yesterday Edge").first().waitFor({ timeout: 10000 });
  check("reminders: yesterday-expired filed under Expired", true);
  const inWeek = await page.locator("#expiring-week").getByText("Yesterday Edge").count();
  check("reminders: not misfiled under Expiring This Week", inWeek === 0);
}

await browser.close();

// cleanup
await db.rpc("hard_delete_member", { p_member_id: member.id });
await db.rpc("hard_delete_member", { p_member_id: memberY.id });
const left = (await db.from("members").select("id").eq("gym_id", GYM_ID).eq("first_name", "Startdate").in("last_name", ["Test", "Edge"])).data.length;
check("cleanup: test members removed", left === 0);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed ? "FAILURES: " + failed : "ALL PASS"}: ${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(failed ? 1 : 0);

// Role-matrix verification: manager vs staff see exactly what they should.
// Creates throwaway auth accounts (service admin API), logs in as each,
// asserts the access matrix end-to-end, then deletes them.
// Usage: node scripts/test-roles.mjs [baseUrl]
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const BASE = process.argv[2] || "http://localhost:3000";
const GYM_ID = "00000000-0000-0000-0000-000000000001";
const PASSWORD = "RoleTest@123";

const envKeys = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.split("=")[0], l.split("=").slice(1).join("=")])
);
const service = createClient(envKeys.NEXT_PUBLIC_SUPABASE_URL, envKeys.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
};

const TEST_USERS = [
  { email: `roletest.manager@792fitness.com`, name: "Role Test Manager", role: "manager" },
  { email: `roletest.staff@792fitness.com`, name: "Role Test Staff", role: "staff" },
  { email: `roletest.trainer@792fitness.com`, name: "Role Test Trainer", role: "trainer" },
];

// ---- setup: throwaway accounts (auth admin API; trigger creates the profile row) ----
for (const u of TEST_USERS) {
  const existing = await service.auth.admin.listUsers({ perPage: 500 });
  const prior = existing.data?.users?.find((x) => x.email === u.email);
  if (prior) await service.auth.admin.deleteUser(prior.id);
  const r = await service.auth.admin.createUser({
    email: u.email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { name: u.name, role: u.role },
  });
  if (r.error) {
    console.error(`failed to create ${u.role}:`, JSON.stringify(r.error));
    process.exit(1);
  }
}

const browser = await chromium.launch();

async function loginAs(email) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([page.waitForNavigation(), page.click("form button")]);
  return page;
}

// ================= MANAGER =================
console.log("\n--- manager role ---");
{
  const page = await loginAs(TEST_USERS[0].email);

  // dashboard: finances visible
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  const dash = await page.evaluate(() => document.body.innerText);
  check("dashboard shows This month finances", /this month/i.test(dash) && /revenue/i.test(dash));

  // payments / expenses / reports / audit: allowed
  for (const [path, marker] of [
    ["/dashboard/payments", "Payments"],
    ["/dashboard/expenses", "Add Expense"],
    ["/dashboard/reports", "Financial"],
    ["/dashboard/audit", "Audit"],
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    const txt = await page.evaluate(() => document.body.innerText);
    check(`manager can access ${path}`, txt.toLowerCase().includes(marker.toLowerCase()) && !txt.toLowerCase().includes("don't have access"));
  }

  // users + settings: blocked (owner/admin only)
  await page.goto(`${BASE}/dashboard/users`, { waitUntil: "networkidle" });
  check("manager blocked from user management", (await page.evaluate(() => document.body.innerText)).includes("don't have access"));
  await page.goto(`${BASE}/dashboard/settings`, { waitUntil: "networkidle" });
  check("manager blocked from settings", (await page.evaluate(() => document.body.innerText)).includes("don't have access"));

  // desktop sidebar: audit link present (manager can read audit per RLS)
  const sidebar = await page.locator("nav, aside").first().textContent().catch(() => "");
  check("sidebar shows Audit Log for manager", /Audit Log/.test(sidebar ?? ""));
  check("sidebar hides Users for manager", !/Users/.test((sidebar ?? "").replace(/Members/, "")));

  // member profile: staff tools visible (canManage)
  const anon = createClient(envKeys.NEXT_PUBLIC_SUPABASE_URL, envKeys.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await anon.auth.signInWithPassword({ email: "admin@792fitness.com", password: "Admin@792Fit" });
  const { data: member } = await anon.from("members").select("id").eq("gym_id", GYM_ID).eq("status", "active").limit(1).maybeSingle();
  await page.goto(`${BASE}/dashboard/members/${member.id}`, { waitUntil: "networkidle" });
  const profile = await page.evaluate(() => document.body.innerText);
  check("manager sees profile staff tools", /staff tools/i.test(profile));

  // mobile More drawer shows Audit for manager (matches desktop + RLS)
  const mpage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mpage.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await mpage.fill('input[name="email"]', TEST_USERS[0].email);
  await mpage.fill('input[name="password"]', PASSWORD);
  await Promise.all([mpage.waitForNavigation(), mpage.click("form button")]);
  await mpage.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await mpage.getByRole("button", { name: "More" }).click();
  await mpage.waitForTimeout(300);
  const drawerTxt = (await mpage.locator("div.fixed.z-50.rounded-t-2xl").textContent()) ?? "";
  check("mobile More drawer shows Audit Log for manager", /Audit Log/.test(drawerTxt));
  check("mobile More drawer hides Users for manager", !/Users/.test(drawerTxt));
  await mpage.close();

  await page.close();
}

// ================= STAFF =================
console.log("\n--- staff role ---");
{
  const page = await loginAs(TEST_USERS[1].email);

  // dashboard: NO finances
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  const dash = await page.evaluate(() => document.body.innerText);
  check("dashboard hides This month finances", !/This month/.test(dash));

  // payments → redirected away
  await page.goto(`${BASE}/dashboard/payments`, { waitUntil: "networkidle" });
  check("staff redirected away from payments", page.url().endsWith("/dashboard"));

  // expenses / reports / users / settings / audit: blocked message or redirect
  for (const path of ["/dashboard/expenses", "/dashboard/reports", "/dashboard/users", "/dashboard/settings", "/dashboard/audit"]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    const blocked = page.url().endsWith("/dashboard") || (await page.evaluate(() => document.body.innerText)).includes("don't have access");
    check(`staff blocked from ${path}`, blocked);
  }

  // day-to-day pages: allowed
  for (const [path, marker] of [
    ["/dashboard/members", "Members"],
    ["/dashboard/members/new", "Enrollment"],
    ["/dashboard/quick-pass", "Quick Pass"],
    ["/dashboard/locker-keys", "Add Key"],
    ["/dashboard/reminders", "Reminders"],
    ["/dashboard/packages", "Packages"],
  ]) {
    await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
    const txt = await page.evaluate(() => document.body.innerText);
    check(`staff can access ${path}`, txt.includes(marker));
  }

  // desktop sidebar: no finance links
  const sidebar = page.locator("nav, aside").first();
  const sidebarTxt = (await sidebar.textContent().catch(() => "")) ?? "";
  check("sidebar hides Payments for staff", !/Payments/.test(sidebarTxt));
  check("sidebar hides Reports for staff", !/Reports/.test(sidebarTxt));

  // member profile: no staff tools (canManage = manager+)
  const anon = createClient(envKeys.NEXT_PUBLIC_SUPABASE_URL, envKeys.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await anon.auth.signInWithPassword({ email: "admin@792fitness.com", password: "Admin@792Fit" });
  const { data: member } = await anon.from("members").select("id").eq("gym_id", GYM_ID).eq("status", "active").limit(1).maybeSingle();
  await page.goto(`${BASE}/dashboard/members/${member.id}`, { waitUntil: "networkidle" });
  const profile = await page.evaluate(() => document.body.innerText);
  check("staff does NOT see profile staff tools", !/Staff tools/.test(profile));

  // mobile bottom-nav More drawer: no Payments/Expenses/Reports
  const mpage = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await mpage.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await mpage.fill('input[name="email"]', TEST_USERS[1].email);
  await mpage.fill('input[name="password"]', PASSWORD);
  await Promise.all([mpage.waitForNavigation(), mpage.click("form button")]);
  await mpage.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await mpage.getByRole("button", { name: "More" }).click();
  await mpage.waitForTimeout(300);
  const drawerTxt = (await mpage.locator("div.fixed.z-50.rounded-t-2xl").textContent()) ?? "";
  check("mobile More drawer hides Payments for staff", !/Payments/.test(drawerTxt));
  check("mobile More drawer hides Reports for staff", !/Reports/.test(drawerTxt));
  await mpage.close();

  await page.close();
}

// ================= FRONT-LINE LOCKER CYCLE =================
console.log("\n--- front-line locker cycle (staff + trainer) ---");
{
  // test key via the admin anon client (same pattern as the lockers suites)
  const anon = createClient(envKeys.NEXT_PUBLIC_SUPABASE_URL, envKeys.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await anon.auth.signInWithPassword({ email: "admin@792fitness.com", password: "Admin@792Fit" });
  await anon.from("locker_keys").delete().eq("gym_id", GYM_ID).eq("key_number", "TEST-ROLES-1");
  const { data: someMember } = await anon.from("members").select("id, first_name").eq("gym_id", GYM_ID).eq("status", "active").limit(1).maybeSingle();
  await anon.from("locker_keys").insert({
    gym_id: GYM_ID,
    key_number: "TEST-ROLES-1",
    locker_number: "901",
    status: "available",
  });

  const staffPage = await loginAs(TEST_USERS[1].email);
  staffPage.on("dialog", (d) => d.accept());
  await staffPage.goto(`${BASE}/dashboard/locker-keys`, { waitUntil: "networkidle" });
  const card = staffPage.locator("div.ring-1", { hasText: "TEST-ROLES-1" }).first();
  await card.getByRole("button", { name: "Issue", exact: true }).click();
  await staffPage.locator('input[placeholder*="Search member"]').fill(someMember.first_name);
  await staffPage.waitForTimeout(300);
  await staffPage.locator("button", { hasText: someMember.first_name }).first().click();
  await staffPage.getByRole("button", { name: "Confirm", exact: true }).click();
  await card.locator("button", { hasText: "Return" }).waitFor({ timeout: 20000 });
  check("staff can ISSUE a locker key (no 'Not allowed')", true);
  await staffPage.close();

  const trainerPage = await loginAs(TEST_USERS[2].email);
  trainerPage.on("dialog", (d) => d.accept());
  await trainerPage.goto(`${BASE}/dashboard/locker-keys`, { waitUntil: "networkidle" });
  const card2 = trainerPage.locator("div.ring-1", { hasText: "TEST-ROLES-1" }).first();
  await card2.locator("button", { hasText: "Return" }).first().click();
  await card2.getByRole("button", { name: "Issue", exact: true }).waitFor({ timeout: 20000 });
  check("trainer can RETURN a locker key", true);
  const { data: keyAfter } = await anon.from("locker_keys").select("status, current_member_id").eq("key_number", "TEST-ROLES-1").single();
  check("DB truth: key available + member cleared", keyAfter?.status === "available" && !keyAfter?.current_member_id);
  await trainerPage.close();

  // cleanup the test key
  await anon.from("locker_keys").delete().eq("gym_id", GYM_ID).eq("key_number", "TEST-ROLES-1");
}

await browser.close();

// ---- cleanup ----
for (const u of TEST_USERS) {
  const existing = await service.auth.admin.listUsers({ perPage: 500 });
  const prior = existing.data?.users?.find((x) => x.email === u.email);
  if (prior) await service.auth.admin.deleteUser(prior.id);
}
const leftover = (await service.from("users").select("id").like("email", "roletest.%")).data.length;
check("cleanup: test accounts removed", leftover === 0, `${leftover} left`);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed ? "FAILURES: " + failed : "ALL PASS"}: ${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(failed ? 1 : 0);

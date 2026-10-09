// Interaction QA for the global popover migration: every portal menu must
// open, be fully visible, close on outside click, and launch its action.
// Usage: node scripts/test-popovers.mjs [baseUrl]
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { adminPassword } from "./lib/test-env.mjs";
const envKeys = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.split("=")[0], l.split("=").slice(1).join("=")])
);
const db = createClient(envKeys.NEXT_PUBLIC_SUPABASE_URL, envKeys.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
const GYM_ID = "00000000-0000-0000-0000-000000000001";

const BASE = process.argv[2] || "http://localhost:3000";
const EMAIL = "792fitness@gmail.com";
const PASSWORD = envKeys.ADMIN_PASSWORD || (() => { console.error("Set ADMIN_PASSWORD in .env.local (scripts read the gitignored env, never the repo)"); process.exit(1); })();

// self-provision a member with history for the profile-menu sections (no
// demo-data dependency); cleaned up at the end
await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
const { data: menuOrphans } = await db.from("members").select("id").eq("gym_id", GYM_ID).eq("first_name", "Popmenu");
for (const o of menuOrphans ?? []) await db.rpc("hard_delete_member", { p_member_id: o.id });
const { data: pkg } = await db.from("packages").select("id").eq("gym_id", GYM_ID).eq("type", "membership").limit(1).maybeSingle();
const { data: popMember } = await db
  .from("members")
  .insert({ gym_id: GYM_ID, first_name: "Popmenu", last_name: "Test", phone: String(1000000000 + Math.floor(Math.random() * 8999999999)), status: "active" })
  .select()
  .single();
const { data: popMs } = await db.from("memberships").insert({
  gym_id: GYM_ID, member_id: popMember.id, package_id: pkg.id,
  start_date: "2026-09-05", end_date: "2026-11-04", status: "active", payment_status: "paid",
  amount: 3000, gst_amount: 0, total_amount: 3000, amount_paid: 3000,
}).select().single();
await db.from("payments").insert({ gym_id: GYM_ID, member_id: popMember.id, membership_id: popMs.id, amount: 3000, mode: "upi", payment_date: "2026-09-05", reference_note: "POPOVER-E2E" });
const MEMBER_ID = popMember.id;

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
};

async function openMenu(page, trigger) {
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  await page.waitForTimeout(350);
  return page.locator("[data-popover-panel]");
}

for (const vp of [{ w: 390, name: "mobile-390" }, { w: 1440, name: "desktop" }]) {
  console.log(`\n--- ${vp.name} ---`);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: vp.w, height: 844 } });
  page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 120)));

  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([page.waitForNavigation(), page.click("form button")]);

  const assertVisible = async (label, panel) => {
    const box = await panel.boundingBox();
    const visible = box && box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.w && box.y + box.height <= 844;
    const fixed = await panel.evaluate((el) => getComputedStyle(el).position === "fixed");
    check(`${label}: fully visible + fixed`, !!visible && fixed, box ? `x=${Math.round(box.x)} y=${Math.round(box.y)}` : "no box");
  };

  // 1. members list: Manage ▾ (or ▾ on urgent rows)
  await page.goto(`${BASE}/dashboard/members`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const manage = page.getByRole("button", { name: "Manage ▾" }).first();
  const chevron = page.getByRole("button", { name: "More actions" }).first();
  const trigger = (await manage.count()) ? manage : chevron;
  if ((await trigger.count()) || (await chevron.count())) {
    const t = (await manage.count()) ? manage : chevron;
    const panel = await openMenu(page, t);
    await assertVisible("members Manage menu", panel);
    // outside click closes
    await page.mouse.click(vp.w / 2, 20);
    await page.waitForTimeout(250);
    check("members menu closes on outside click", (await page.locator("[data-popover-panel]").count()) === 0);
  }

  // 2. member profile: More ▾ menu
  await page.goto(`${BASE}/dashboard/members/${MEMBER_ID}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const more = page.getByRole("button", { name: "More ▾" });
  if ((await more.count())) {
    const panel = await openMenu(page, more);
    await assertVisible("profile More menu", panel);
    // "Edit member" action navigates (also proves close-on-action)
    await page.getByRole("link", { name: "Edit member" }).click();
    await page.waitForTimeout(900);
    check("More menu action navigates (Edit member)", page.url().includes("/edit"));
  }

  // 3. profile: payment history ⋯ (open history first)
  await page.goto(`${BASE}/dashboard/members/${MEMBER_ID}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const historyBtn = page.getByRole("button", { name: /View payment history/ });
  if ((await historyBtn.count())) {
    await historyBtn.click();
    await page.waitForTimeout(400);
    const dots = page.locator("button", { hasText: "⋯" }).first();
    if ((await dots.count())) {
      const panel = await openMenu(page, dots);
      await assertVisible("payment-history ⋯ menu", panel);
      await page.mouse.click(vp.w / 2, 20);
      await page.waitForTimeout(200);
      check("payment menu closes on outside click", (await page.locator("[data-popover-panel]").count()) === 0);
    }
  }

  // 4. reports: Export Report ▾ (portal, at header)
  await page.goto(`${BASE}/dashboard/reports`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const exportBtn = page.getByRole("button", { name: /Export Report/ });
  if ((await exportBtn.count())) {
    const panel = await openMenu(page, exportBtn);
    await assertVisible("reports Export menu", panel);
    const optionCount = await panel.locator("a").count();
    check("export options listed", optionCount >= 5, `${optionCount} options`);
    await page.mouse.click(vp.w / 2, 20);
    await page.waitForTimeout(200);
    check("export menu closes", (await page.locator("[data-popover-panel]").count()) === 0);
  }

  // 5. bottom nav More drawer (mobile only)
  if (vp.w < 768) {
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    await page.getByRole("button", { name: "More" }).click();
    await page.waitForTimeout(350);
    const drawer = page.locator("div.fixed.z-50.rounded-t-2xl");
    const dVisible = (await drawer.count()) > 0 && (await drawer.boundingBox())?.y !== undefined;
    check("More drawer opens as bottom sheet", dVisible);
    const labels = await drawer.textContent();
    check("drawer lists less-frequent areas", /Reminders/.test(labels) && /Packages/.test(labels) && /Reports/.test(labels));
    check("Payments moved into drawer", /Payments/.test(labels));

    await page.mouse.click(vp.w / 2, 30);
    await page.waitForTimeout(300);
    check("drawer closes on backdrop", (await page.locator("div.fixed.z-50.rounded-t-2xl").count()) === 0 || !(await drawer.isVisible()));
    const navHasPayments = await page.locator('nav.fixed a', { hasText: "Payments" }).count();
    check("bottom nav slimmer (no Payments tab)", navHasPayments === 0);
  }

  await browser.close();
}

// ---- header account drawer: avatar + hamburger, Sign out tappable ----
{
  console.log("\n--- header account drawer (avatar / hamburger / Sign out) ---");
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([page.waitForNavigation(), page.click("form button")]);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });

  const drawer = page.locator("aside.z-50");
  const accountBtn = page.getByRole("button", { name: "Account menu" });

  // avatar opens the drawer
  await accountBtn.click();
  await drawer.waitFor({ timeout: 10000 });
  const drawerTxt = (await drawer.textContent()) ?? "";
  check("avatar opens the account drawer", true);
  check("drawer shows user + role", /Gym Admin|Manager|Staff|Owner/.test(drawerTxt), drawerTxt.slice(0, 40));

  // Sign out must not be overlapped by anything at its tap point
  const signOut = drawer.getByRole("button", { name: /sign out/i });
  const unobstructed = await signOut.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return el === hit || (hit && el.contains(hit));
  });
  check("Sign out fully tappable (nothing overlays it)", unobstructed);

  // Sign out actually logs out
  await signOut.click();
  await page.waitForURL(/\/login/, { timeout: 30000 });
  check("Sign out logs out → /login", true);

  // re-login: hamburger still works, drawer closes on overlay click
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([page.waitForNavigation(), page.click("form button")]);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Open menu" }).click();
  await drawer.waitFor({ timeout: 10000 });
  check("hamburger opens the same drawer", true);
  await page.mouse.click(330, 400); // right of the 256px-wide drawer → overlay
  await page.waitForTimeout(300);
  check("drawer closes on outside click", (await drawer.count()) === 0 || !(await drawer.isVisible()));

  await page.close();
  await browser.close();
}

// ---- member status + delete forms inside the More ▾ popover ----
// (regression: the popover used to unmount these forms mid-click, silently
// cancelling the server action)
{
  console.log("\n--- More ▾ popover forms (deactivate / reactivate / delete) ---");
  await db.auth.signInWithPassword({ email: "792fitness@gmail.com", password: adminPassword() });
  const { data: orphans } = await db.from("members").select("id").eq("gym_id", GYM_ID).eq("first_name", "Popform");
  for (const o of orphans ?? []) await db.rpc("hard_delete_member", { p_member_id: o.id });
  const phone = String(1000000000 + Math.floor(Math.random() * 8999999999));
  const { data: member } = await db
    .from("members")
    .insert({ gym_id: GYM_ID, first_name: "Popform", last_name: "Test", phone, status: "active" })
    .select()
    .single();

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', "792fitness@gmail.com");
  await page.fill('input[name="password"]', adminPassword());
  await Promise.all([page.waitForNavigation(), page.click("form button")]);

  const status = () => db.from("members").select("status").eq("id", member.id).single().then((r) => r.data?.status);
  const waitFor = async (fn, label, timeout = 20000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < timeout) {
      if (await fn()) return true;
      await page.waitForTimeout(250);
    }
    console.log("[timeout]", label);
    return false;
  };

  // deactivate via the popover form
  await page.goto(`${BASE}/dashboard/members/${member.id}`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "More ▾" }).click();
  await page.getByRole("button", { name: "Deactivate member" }).click();
  check("deactivate form fires (popover no longer cancels it)",
    await waitFor(async () => (await status()) === "deactivated", "deactivate"));

  // the menu reflects the new state
  await page.getByRole("button", { name: "More ▾" }).click();
  check("menu now offers Reactivate", (await page.getByRole("button", { name: "Reactivate member" }).count()) === 1);
  await page.getByRole("button", { name: "Reactivate member" }).click();
  check("reactivate form fires", await waitFor(async () => (await status()) === "active", "reactivate"));

  // delete via the popover form (confirm dialog auto-accepted)
  await page.getByRole("button", { name: "More ▾" }).click();
  await page.getByRole("button", { name: "Delete member" }).click();
  await page.getByRole("button", { name: "Delete everything" }).click();
  check("delete form fires (member removed)",
    await waitFor(async () => (await db.from("members").select("id").eq("id", member.id).maybeSingle()).data === null, "delete"));
  await page.close();
  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
await db.rpc("hard_delete_member", { p_member_id: MEMBER_ID });
console.log(`\n${failed ? `FAILED: ${failed}/${results.length}` : `ALL PASS: ${results.length}/${results.length}`}`);
process.exit(failed ? 1 : 0);

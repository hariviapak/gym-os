// Interaction QA for the global popover migration: every portal menu must
// open, be fully visible, close on outside click, and launch its action.
// Usage: node scripts/test-popovers.mjs [baseUrl]
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://localhost:3000";
const EMAIL = "admin@792fitness.com";
const PASSWORD = "Admin@792Fit";
const MEMBER_ID = "a45503b3-722a-4abb-bb74-b2628cf3d9c0";

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
    await page.mouse.click(vp.w / 2, 30);
    await page.waitForTimeout(300);
    check("drawer closes on backdrop", (await page.locator("div.fixed.z-50.rounded-t-2xl").count()) === 0 || !(await drawer.isVisible()));
  }

  await browser.close();
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed ? `FAILED: ${failed}/${results.length}` : `ALL PASS: ${results.length}/${results.length}`}`);
process.exit(failed ? 1 : 0);

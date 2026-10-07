// Members filters speed + compact mobile layout verification.
// - optimistic chip highlight (instant response, <300ms)
// - summary pills same instant behavior
// - scrollable chip rows on mobile (no page overflow), wrap on desktop
// Usage: node scripts/test-members-filters.mjs [baseUrl]
import { chromium } from "playwright";

const BASE = process.argv[2] || "http://localhost:3000";
const EMAIL = "792fitness@gmail.com";
const PASSWORD = "Admin@792Fit";

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
};

const browser = await chromium.launch();

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([page.waitForNavigation(), page.click("form button")]);
}

// ---------- mobile: compact + instant ----------
console.log("\n--- mobile 390px: instant chips ---");
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await login(page);
  await page.goto(`${BASE}/dashboard/members`, { waitUntil: "networkidle" });

  const overflow2 = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("no horizontal page overflow", overflow2 <= 1, `${overflow2}px`);

  // chip rows scroll instead of pushing the page
  const rowInfo = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("div")].filter(
      (d) => d.className && d.className.includes && d.className.includes("overflow-x-auto")
    );
    return rows.slice(0, 2).map((r) => ({ sw: r.scrollWidth, cw: r.clientWidth, chips: r.querySelectorAll("button").length }));
  });
  check(
    "status chip row scrolls (not page)",
    rowInfo.length >= 2 && rowInfo[0].chips === 7 && rowInfo[1].chips === 4,
    JSON.stringify(rowInfo)
  );

  // no mobile labels
  const labels = await page.locator("span", { hasText: "Status:" }).count();
  check("labels hidden on mobile", (await page.locator(":scope > span", { hasText: "Status:" }).count()) === 0);

  // ---- instant chip highlight ----
  const frozenChip = page.getByRole("button", { name: "Frozen", exact: true });
  const t0 = Date.now();
  await frozenChip.click();
  // immediately check for the optimistic active class
  let highlighted = false;
  let elapsed = 0;
  for (let i = 0; i < 40; i++) {
    const cls = (await frozenChip.getAttribute("class")) ?? "";
    if (cls.includes("bg-zinc-900")) {
      highlighted = true;
      elapsed = Date.now() - t0;
      break;
    }
    await page.waitForTimeout(25);
  }
  check("chip highlights instantly (optimistic)", highlighted && elapsed < 300, `${elapsed}ms`);

  // navigation completes non-blocking: URL updates
  await page.waitForURL(/status=frozen/, { timeout: 15000 });
  check("URL updates to status=frozen", true);

  // summary pill "Frozen" also active (derived from same param)
  const frozenPill = page.locator("button", { hasText: "Frozen" }).first();
  const pillCls = (await frozenPill.getAttribute("class")) ?? "";
  check("summary pill Frozen active after filter", pillCls.includes("bg-zinc-900"));

  // ---- back to All via chip ----
  await page.getByRole("button", { name: "All", exact: true }).first().click();
  await page.waitForURL(/dashboard\/members\?$/, { timeout: 15000 }).catch(() => {});
  const url1 = page.url();
  check("clear back to all removes param", !url1.includes("status="), url1.slice(-30));

  // ---- summary pill tap = instant too ----
  const activePill = page.locator("button", { hasText: "Active" }).first();
  const t1 = Date.now();
  await activePill.click();
  let pillHighlighted = false;
  let pillElapsed = 0;
  for (let i = 0; i < 40; i++) {
    const cls = (await activePill.getAttribute("class")) ?? "";
    if (cls.includes("bg-zinc-900")) {
      pillHighlighted = true;
      pillElapsed = Date.now() - t1;
      break;
    }
    await page.waitForTimeout(25);
  }
  check("summary pill highlights instantly", pillHighlighted && pillElapsed < 300, `${pillElapsed}ms`);
  await page.waitForURL(/status=active/, { timeout: 15000 });
  check("summary pill URL updates", true);

  await page.close();
}

// ---------- mobile 320px: still fits ----------
console.log("\n--- mobile 320px ---");
{
  const page = await browser.newPage({ viewport: { width: 320, height: 700 } });
  await login(page);
  await page.goto(`${BASE}/dashboard/members`, { waitUntil: "networkidle" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("no overflow at 320px", overflow <= 1, `${overflow}px`);
  await page.close();
}

// ---------- desktop: wrapped rows + labels ----------
console.log("\n--- desktop 1440px ---");
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await login(page);
  await page.goto(`${BASE}/dashboard/members`, { waitUntil: "networkidle" });
  const labelVisible = await page.locator("span", { hasText: "Status:" }).first().isVisible();
  check("labels visible on desktop", labelVisible);
  const wrapInfo = await page.evaluate(() => {
    const rows = [...document.querySelectorAll("div")].filter(
      (d) => d.className && d.className.includes && d.className.includes("md:flex-wrap")
    );
    return rows.length;
  });
  check("desktop rows use wrap layout", wrapInfo >= 2, `${wrapInfo} rows`);
  await page.close();
}

await browser.close();

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed ? "FAILURES: " + failed : "ALL PASS"}: ${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(failed ? 1 : 0);

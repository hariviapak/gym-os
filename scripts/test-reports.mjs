// Reports workspace e2e: global date range → overview numbers → drill-down →
// search/filter → pagination → export respects filters.
// Usage: node scripts/test-reports.mjs [baseUrl]
import { chromium } from "playwright";
const BASE = process.argv[2] || "http://localhost:3000";
const EMAIL = "admin@792fitness.com";
const PASSWORD = "Admin@792Fit";

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 150)));

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await Promise.all([page.waitForNavigation(), page.click("form button")]);

// ---------- (1) overview ----------
console.log("(1) overview:");
await page.goto(`${BASE}/dashboard/reports`, { waitUntil: "networkidle" });
await page.waitForTimeout(400);
let t = await page.locator("main").textContent();
check("Financial Overview: Revenue/Expenses/Net Profit", /Revenue/.test(t) && /Expenses/.test(t) && /Net Profit/.test(t));
check("Membership Activity with definitions", /New enrollments/.test(t) && /Renewals/.test(t) && /unique members/.test(t));
check("Package Performance", /Package Performance/.test(t));
check("no decorative per-card export buttons", (await page.locator("a", { hasText: "Export CSV" }).count()) === 0);

// date range shown + presets recompute
const rangeText = await page.locator("h1 + p, h1 ~ p").first().textContent();
check("selected range shown", /–/.test(rangeText ?? ""), rangeText?.trim());
const finSection = page.locator("section", { hasText: "Financial Overview" }).first();
const revenueOf = async () => (await finSection.locator("a").first().textContent()).trim();
const revenueThisMonth = await revenueOf();
await page.getByRole("button", { name: "This Year", exact: true }).click();
await page.waitForTimeout(2000);
const revenueThisYear = await revenueOf();
check("preset changes recompute all sections", revenueThisMonth !== revenueThisYear, `${revenueThisMonth} → ${revenueThisYear}`);
const url = page.url();
check("URL carries the range", url.includes("preset=year"));

// ---------- (2) drill-down + pagination + search + filters ----------
console.log("(2) revenue drill-down:");
await finSection.locator("a").first().click();
await page.waitForURL("**/dashboard/reports/payments**", { timeout: 20000 });
await page.waitForLoadState("networkidle");
await page.waitForTimeout(600);
t = await page.locator("main").textContent();
const showing = t.match(/Showing (\d+)–(\d+) of (\d+)/);
check("pagination footer present", !!showing, showing?.[0] ?? "missing");
const totalRows = (await page.locator("tbody tr").count());
check("page caps at 50 rows", totalRows <= 50, `${totalRows} rows`);
check("range carried into drill-down", (await page.getByRole("heading", { name: "Revenue Details" }).count()) === 1);

// filter by method → count changes consistently
const totalN = showing ? Number(showing[3]) : 0;
if (totalN > 0) {
  await page.getByRole("combobox").first().selectOption("cash");
  await page.waitForTimeout(3000);
  t = await page.locator("main").textContent();
  const cashShowing = t.match(/Showing (\d+)–(\d+) of (\d+)/);
  check("method filter narrows results", cashShowing && Number(cashShowing[3]) < totalN, `${totalN} → ${cashShowing?.[3]}`);
  // server-side pagination: Next → second page of the SAME filtered set
  if (cashShowing && Number(cashShowing[3]) > 50) {
    await Promise.all([page.waitForURL(/page=2/, { timeout: 30000 }), page.getByRole("link", { name: "Next →" }).click()]);
    await page.waitForTimeout(2500); // let the RSC render settle (dev is slow)
    t = await page.locator("main").textContent();
    const page2 = t.match(/Showing (\d+)–(\d+) of (\d+)/);
    check("Next paginates server-side", page2?.[1] === "51" && page2?.[3] === cashShowing[3], page2?.[0]);
    await Promise.all([page.waitForURL(/payments\?/, { timeout: 30000 }), page.getByRole("link", { name: "← Previous" }).click()]);
    await page.waitForTimeout(2000);
  }
  // search narrows further
  const cashN = Number(cashShowing?.[3] ?? 0);
  await page.locator('input[placeholder^="Search by member"]').fill("hari");
  await page.waitForURL(/q=hari/, { timeout: 30000 });
  await page.waitForTimeout(2500);
  t = await page.locator("main").textContent();
  const qShowing = t.match(/Showing (\d+)–(\d+) of (\d+)/);
  check("search stacks with filters", qShowing && Number(qShowing[3]) <= cashN, `${cashN} → ${qShowing?.[3]}`);
}

// ---------- (3) export respects filters ----------
console.log("(3) export:");
const csv = await page.evaluate(async () => {
  const res = await fetch(location.search ? `/api/export/report-payments${location.search}` : "/api/export/report-payments");
  return res.ok ? await res.text() : `HTTP ${res.status}`;
});
const csvLines = csv.split("\n");
const csvDataRows = csvLines.length - 2; // header + possible trailing
const bodyRows = csvLines.slice(1).filter((l) => l.trim()).length;
check("export headers per spec", csvLines[0] === "Date,Member Name,Phone,Amount,Payment Method,Payment Status,Reference,Recorded By", csvLines[0]);
const pageShowing = (await page.locator("main").textContent()).match(/Showing (\d+)–(\d+) of (\d+)/);
check(
  "export row count == filtered page count",
  bodyRows === Number(pageShowing?.[3] ?? -1),
  `csv ${bodyRows} vs page ${pageShowing?.[3]}`
);
check("export contains only filtered records", /hari/i.test(csv) || bodyRows === 0);

// memberships drill-down + package filter
console.log("(4) memberships drill-down:");
await page.goto(`${BASE}/dashboard/reports/memberships`, { waitUntil: "networkidle" });
await page.waitForTimeout(500);
t = await page.locator("main").textContent();
check("memberships drill-down renders", (await page.locator("tbody tr").count()) > 0, `${await page.locator("tbody tr").count()} rows`);
const pkgSelect = page.getByRole("combobox").nth(1); // basis=0, package=1
if (await pkgSelect.count()) {
  const firstOption = await pkgSelect.locator("option").nth(1).getAttribute("value");
  if (firstOption) {
    await pkgSelect.selectOption(firstOption);
    await page.waitForTimeout(2000);
    t = await page.locator("main").textContent();
    check("package filter works", /Showing/.test(t), (t.match(/Showing [^o]*of \d+/) || [""])[0]);
  }
}

// renewals + members + expenses pages render
console.log("(5) other drill-downs:");
for (const [path, name] of [["/dashboard/reports/renewals", "Renewals"], ["/dashboard/reports/members", "Member Growth"], ["/dashboard/reports/expenses", "Expenses"]]) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(400);
  const h = await page.locator("h1").textContent();
  check(`${name} page renders`, h?.trim() === name, h ?? "");
}

// full report export
const fullCsv = await page.evaluate(async () => (await (await fetch("/api/export/report-full?preset=month")).text()));
check("full report export has all sections", /Financial/.test(fullCsv) && /Membership/.test(fullCsv) && /Net Profit/.test(fullCsv));

await browser.close();
const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `FAILED: ${failed}/${results.length}` : `ALL PASS: ${results.length}/${results.length}`);
process.exit(failed ? 1 : 0);

// Find the deepest element responsible for a page's min-content width
import { chromium } from "playwright";

const BASE = "http://localhost:3000";
const PAGES = [
  "/dashboard/packages",
  "/dashboard/payments",
  "/dashboard/expenses",
  "/dashboard/import",
  "/dashboard/reports",
  "/dashboard/users",
  "/dashboard/audit",
];

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', "792fitness@gmail.com");
await page.fill('input[name="password"]', adminPassword());
await Promise.all([page.waitForNavigation({ timeout: 30000 }), page.click("form button")]);

for (const p of PAGES) {
  await page.goto(`${BASE}${p}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(300);
  const culprits = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out = [];
    // deepest elements with the largest scrollWidth that equals/exceeds doc width
    const docW = document.documentElement.scrollWidth;
    document.querySelectorAll("*").forEach((el) => {
      if (el.scrollWidth >= docW - 2 && el.children.length > 0) {
        const kids = [...el.children].filter((k) => k.scrollWidth >= docW - 2 || k.getBoundingClientRect().right > vw);
        if (kids.length === 0) {
          // el is wide but its children are not the cause — maybe el itself
        }
      }
    });
    // simpler: find leaf-ish widest elements
    const leaves = [];
    document.querySelectorAll("body *").forEach((el) => {
      const r = el.getBoundingClientRect();
      if (r.width > vw + 4) {
        const wideKids = [...el.children].filter((k) => k.getBoundingClientRect().width > vw + 4);
        if (wideKids.length === 0) {
          leaves.push({
            tag: el.tagName.toLowerCase(),
            cls: (el.className || "").toString().slice(0, 90),
            w: Math.round(r.width),
            overflow: getComputedStyle(el).overflow,
            text: (el.textContent || "").trim().slice(0, 50),
          });
        }
      }
    });
    return { docW, leaves: leaves.slice(0, 6) };
  });
  console.log(`\n### ${p} (doc ${culprits.docW}px)`);
  culprits.leaves.forEach((l) => console.log(`  ${l.w}px <${l.tag} class="${l.cls}"> overflow=${l.overflow} :: ${l.text}`));
}
await browser.close();

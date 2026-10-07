// Programmatic UI audit: walks dashboard pages at desktop + mobile widths and
// reports layout issues (overflow, clipped text, console/network errors).
// Usage: node scripts/ui-audit.mjs [baseUrl]
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const BASE = process.argv[2] || "https://gymos.sakhi.app";
const EMAIL = "792fitness@gmail.com";
const PASSWORD = "Admin@792Fit";

// Member-scoped routes need a real member id — fetch one at runtime. On an
// empty gym (fresh install / post-cleanup) those routes are skipped.
const envKeys = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.split("=")[0], l.split("=").slice(1).join("=")])
);
const db = createClient(envKeys.NEXT_PUBLIC_SUPABASE_URL, envKeys.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});
await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
const { data: firstMember } = await db.from("members").select("id").limit(1).maybeSingle();
const MEMBER_ID = firstMember?.id ?? null;
const MEMBER_ROUTES = MEMBER_ID
  ? [
      { path: `/dashboard/members/${MEMBER_ID}`, name: "Member profile" },
      { path: `/dashboard/members/${MEMBER_ID}/edit`, name: "Edit member" },
      { path: `/dashboard/members/${MEMBER_ID}/sign-terms`, name: "Sign terms" },
      { path: `/dashboard/members/${MEMBER_ID}/signed-documents`, name: "Signed documents" },
      { path: `/print/member-profile/${MEMBER_ID}`, name: "Print profile (screen preview)" },
    ]
  : [];
console.log(MEMBER_ID ? `member routes: on (${MEMBER_ID.slice(0, 8)}…)` : "member routes: skipped (no members — empty gym)");

const ROUTES = [
  { path: "/dashboard", name: "Dashboard" },
  { path: "/dashboard/members", name: "Members list" },
  { path: "/dashboard/members?filter=week", name: "Members expiring" },
  { path: "/dashboard/members/new", name: "New enrollment" },
  ...MEMBER_ROUTES,
  { path: "/dashboard/packages", name: "Packages (list)" },
  { path: "/dashboard/packages?view=grid", name: "Packages (grid)" },
  { path: "/dashboard/payments", name: "Payments" },
  { path: "/dashboard/payments/new", name: "Collect payment" },
  { path: "/dashboard/quick-pass", name: "Quick pass" },
  { path: "/dashboard/reminders", name: "Reminders" },
  { path: "/dashboard/locker-keys", name: "Locker keys" },
  { path: "/dashboard/tasks", name: "Tasks" },
  { path: "/dashboard/expenses", name: "Expenses" },
  { path: "/dashboard/import", name: "Import" },
  { path: "/dashboard/reports", name: "Reports" },
  { path: "/dashboard/reports/payments", name: "Report: payments" },
  { path: "/dashboard/reports/memberships", name: "Report: memberships" },
  { path: "/dashboard/reports/renewals", name: "Report: renewals" },
  { path: "/dashboard/reports/members", name: "Report: members" },
  { path: "/dashboard/reports/expenses", name: "Report: expenses" },
  { path: "/dashboard/terms", name: "Terms & Conditions" },
  { path: "/dashboard/users", name: "Users" },
  { path: "/dashboard/audit", name: "Audit log" },
  { path: "/dashboard/settings", name: "Settings" },
];

const MEMBERS_DATA_JS = () => {
  // When the summary strip reports active members, the table rows must actually
  // show memberships/payment/expiry data (catches embed/filter regressions).
  const strip = document.body.textContent.match(/(\d+) members/);
  const activePills = [...document.querySelectorAll("a,span")].some(
    (el) => /Active|Expiring/.test(el.textContent) && /^\d+\s/.test(el.textContent.trim())
  );
  const firstRowCells = document.querySelectorAll("tbody tr:first-child td");
  if (!firstRowCells || firstRowCells.length === 0) return "no rows rendered";
  const membershipsCell = firstRowCells[2]?.textContent?.trim();
  const paymentCell = firstRowCells[3]?.textContent?.trim();
  const expiryCell = firstRowCells[4]?.textContent?.trim();
  return {
    activePills,
    membershipsCell: membershipsCell?.slice(0, 60),
    paymentCell: paymentCell?.slice(0, 40),
    expiryCell: expiryCell?.slice(0, 40),
  };
};

const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile-390", width: 390, height: 844 },
  { name: "mobile-320", width: 320, height: 640 },
];

const CHECKS_JS = (vw) => {
  const issues = [];
  const de = document.documentElement;

  // 1. Page-level horizontal overflow
  if (de.scrollWidth > de.clientWidth + 1) {
    issues.push({
      type: "page-overflow",
      detail: `document ${de.scrollWidth}px wide vs ${de.clientWidth}px viewport`,
    });
  }

  // 2. Elements sticking outside the viewport (skipping those inside a
  //    scrollable ancestor, which is intentional overflow behavior)
  const isVisible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden" || parseFloat(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 24 && r.height > 12 && r.bottom > 0 && r.top < innerHeight;
  };
  const inScrollable = (el) => {
    let p = el.parentElement;
    while (p && p !== document.body) {
      const s = getComputedStyle(p);
      if (/(auto|scroll)/.test(s.overflow + s.overflowX)) return true;
      if (p.tagName === "DETAILS" && !p.open) return true; // closed disclosures are hidden (content-visibility)
      p = p.parentElement;
    }
    return false;
  };

  document.querySelectorAll("body *").forEach((el) => {
    if (!isVisible(el) || inScrollable(el)) return;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 2 || r.left < -2) {
      issues.push({
        type: "element-outside-viewport",
        detail: `<${el.tagName.toLowerCase()} class="${(el.className || "").toString().slice(0, 80)}"> left=${Math.round(r.left)} right=${Math.round(r.right)}`,
        text: (el.textContent || "").trim().slice(0, 60),
      });
    }
  });

  // 3. Clipped single-line text (content wider than its box with hidden overflow)
  document.querySelectorAll("body *").forEach((el) => {
    if (!isVisible(el) || inScrollable(el)) return;
    const s = getComputedStyle(el);
    const isTruncateByDesign = s.textOverflow === "ellipsis" || el.classList.toString().includes("truncate");
    if (isTruncateByDesign) return;
    if (
      el.children.length === 0 &&
      el.textContent.trim() &&
      (s.overflowX === "hidden" || s.overflow === "hidden") &&
      el.scrollWidth > el.clientWidth + 3
    ) {
      issues.push({
        type: "clipped-text",
        detail: `<${el.tagName.toLowerCase()} class="${(el.className || "").toString().slice(0, 60)}"> ${el.scrollWidth}px content in ${el.clientWidth}px box`,
        text: (el.textContent || "").trim().slice(0, 60),
      });
    }
  });

  return issues;
};

async function main() {
  const browser = await chromium.launch();
  const report = {};
  let consoleAuthed = false;

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();

    const consoleErrors = [];
    const failedRequests = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text().slice(0, 200));
    });
    page.on("pageerror", (err) => consoleErrors.push(`PAGEERROR: ${String(err).slice(0, 200)}`));
    page.on("response", (res) => {
      if (res.status() >= 400 && !res.url().includes("map")) {
        failedRequests.push(`${res.status()} ${res.url().replace(BASE, "").slice(0, 100)}`);
      }
    });

    // login once per context
    await page.goto(`${BASE}/login`, { waitUntil: "networkidle", timeout: 45000 });
    await page.fill('input[name="email"]', EMAIL);
    await page.fill('input[name="password"]', PASSWORD);
    await Promise.all([page.waitForNavigation({ timeout: 45000 }), page.click('form button')]);
    await page.goto(BASE + "/dashboard", { waitUntil: "networkidle", timeout: 45000 }).catch(() => {});
  consoleAuthed = !page.url().includes("/login");

    for (const route of ROUTES) {
      const key = `${vp.name} · ${route.name}`;
      try {
        await page.goto(`${BASE}${route.path}`, { waitUntil: "networkidle", timeout: 45000 });
        await page.waitForTimeout(400);
        const issues = await page.evaluate(CHECKS_JS, vp.width);
        const pageErrs = consoleErrors.splice(0);
        const reqErrs = failedRequests.splice(0);
        let dataCheck = null;
        if (route.path === "/dashboard/members") {
          dataCheck = await page.evaluate(MEMBERS_DATA_JS);
          const cellsEmpty =
            typeof dataCheck === "object" &&
            dataCheck.membershipsCell === "—" &&
            dataCheck.paymentCell === "—" &&
            dataCheck.expiryCell === "—";
          if (cellsEmpty && dataCheck.activePills) {
            issues.push({
              type: "data-regression",
              detail: "Members table renders empty membership/payment/expiry cells while the summary shows active members",
            });
          }
        }
        if (issues.length || pageErrs.length || reqErrs.length) {
          report[key] = { issues, console: pageErrs, requests: reqErrs, ...(dataCheck ? { dataCheck } : {}) };
        } else {
          report[key] = "OK";
        }
      } catch (e) {
        report[key] = `LOAD FAIL: ${String(e).slice(0, 150)}`;
      }
    }
    await context.close();
  }

  await browser.close();

  let problems = 0;
  for (const [k, v] of Object.entries(report)) {
    if (v === "OK") continue;
    problems++;
    console.log(`\n=== ${k} ===`);
    console.log(JSON.stringify(v, null, 2).slice(0, 3000));
  }
  console.log(`\n${consoleAuthed ? "auth OK" : "AUTH FAILED"} · ${Object.values(report).filter((v) => v === "OK").length} clean / ${Object.keys(report).length} checked`);
  process.exit(0);
}

main();

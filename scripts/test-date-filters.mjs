// Date filter pills verification (payments + audit pages).
// - pills render readable values from the URL (never blank — iOS Safari bug)
// - setting a date filters the list and shows in the pill
// - explicit ✕ clears the date
// - values survive reload (URL-derived display)
// Usage: node scripts/test-date-filters.mjs [baseUrl]
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const envKeys = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.split("=")[0], l.split("=").slice(1).join("=")])
);
const db = createClient(envKeys.NEXT_PUBLIC_SUPABASE_URL, envKeys.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const BASE = process.argv[2] || "http://localhost:3000";
const EMAIL = "792fitness@gmail.com";
const PASSWORD = envKeys.ADMIN_PASSWORD || (() => { console.error("Set ADMIN_PASSWORD in .env.local (scripts read the gitignored env, never the repo)"); process.exit(1); })();

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

// ---------- payments ----------
console.log("\n--- payments page (390px) ---");
// self-provision a payment so row-level assertions hold on any gym state
await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
const GYM_ID = "00000000-0000-0000-0000-000000000001";
const { data: dfOrphans } = await db.from("members").select("id").eq("gym_id", GYM_ID).eq("first_name", "Datefilter");
for (const o of dfOrphans ?? []) await db.rpc("hard_delete_member", { p_member_id: o.id });
const { data: dfMember } = await db
  .from("members")
  .insert({ gym_id: GYM_ID, first_name: "Datefilter", last_name: "Test", phone: String(1000000000 + Math.floor(Math.random() * 8999999999)), status: "active" })
  .select()
  .single();
await db.from("payments").insert({ gym_id: GYM_ID, member_id: dfMember.id, amount: 500, mode: "upi", payment_date: "2026-09-10", reference_note: "DATEFILTER-E2E" });

{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await login(page);
  await page.goto(`${BASE}/dashboard/payments`, { waitUntil: "networkidle" });

  const fromPill = page.locator("button", { hasText: "FromAny" }).first();
  const toPill = page.locator("button", { hasText: "ToAny" }).first();
  check("From/To pills present (Any state)", (await fromPill.count()) === 1 && (await toPill.count()) === 1);

  // no visible native date inputs (the old blank-on-iOS controls)
  const visibleDates = await page.evaluate(() =>
    [...document.querySelectorAll('input[type="date"]')].filter((i) => {
      const r = i.getBoundingClientRect();
      return r.width > 2 && r.height > 2 && getComputedStyle(i).opacity !== "0";
    }).length
  );
  check("no visible native date inputs", visibleDates === 0, `${visibleDates}`);

  // set From via the hidden picker input (what the wheel does on mobile)
  await page.locator('input[type="date"]').nth(0).fill("2026-09-01");
  await page.waitForURL(/from=2026-09-01/, { timeout: 15000 });
  await page.waitForTimeout(400);
  const fromTxt = (await page.locator("button", { hasText: "From" }).first().textContent()) ?? "";
  check("From pill shows friendly date", fromTxt.includes("1 Sept 2026"), fromTxt.trim());

  // filter applies to the list: narrow to an empty range → empty state
  await page.locator('input[type="date"]').nth(1).fill("2020-01-01");
  await page.waitForURL(/to=2020-01-01/, { timeout: 15000 });
  await page.getByText("No payments match your filters.").waitFor({ timeout: 15000 });
  check("filter applies to the list (empty state)", true);

  // explicit clear
  const clearTo = page.getByRole("button", { name: "Clear to date" });
  check("clear ✕ visible when date set", (await clearTo.count()) === 1);
  await clearTo.click();
  await page.waitForURL(/^(?!.*to=)/, { timeout: 15000 });
  await page.waitForTimeout(400);
  const toAny = (await page.locator("button", { hasText: "ToAny" }).count()) === 1;
  const rowsBack = await page.evaluate(() => document.body.innerText.includes("Datefilter") || document.body.innerText.includes("DATEFILTER-E2E"));
  check("clear resets pill, list returns", toAny && rowsBack);

  // set both via URL → reload → pills still show values (iOS-blank bug fixed)
  await page.goto(`${BASE}/dashboard/payments?from=2026-09-01&to=2026-09-28`, { waitUntil: "networkidle" });
  const fromTxt2 = (await page.locator("button", { hasText: "From" }).first().textContent()) ?? "";
  const toTxt2 = (await page.locator("button", { hasText: "To" }).first().textContent()) ?? "";
  check("From pill shows value after reload", fromTxt2.includes("1 Sept 2026"), fromTxt2.trim());
  check("To pill shows value after reload", toTxt2.includes("28 Sept 2026"), toTxt2.trim());

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("no overflow at 390px", overflow <= 1, `${overflow}px`);
  await page.close();
}

// ---------- audit log ----------
console.log("\n--- audit log (390px) ---");
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await login(page);
  await page.goto(`${BASE}/dashboard/audit`, { waitUntil: "networkidle" });

  await page.locator('input[type="date"]').nth(0).fill("2026-09-01");
  await page.waitForURL(/from=2026-09-01/, { timeout: 15000 });
  const fromTxt = (await page.locator("button", { hasText: "From" }).first().textContent()) ?? "";
  check("audit From pill shows date", fromTxt.includes("1 Sept 2026"), fromTxt.trim());

  check("Clear button visible while filtered", (await page.getByRole("button", { name: "Clear", exact: true }).count()) === 1);
  await page.getByRole("button", { name: "Clear from date" }).click();
  await page.waitForURL(/^(?!.*from=)/, { timeout: 15000 });
  await page.waitForTimeout(400);
  check("audit clear resets", (await page.locator("button", { hasText: "FromAny" }).count()) === 1);
  await page.close();
}

await browser.close();
await db.rpc("hard_delete_member", { p_member_id: dfMember.id });

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed ? "FAILURES: " + failed : "ALL PASS"}: ${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(failed ? 1 : 0);

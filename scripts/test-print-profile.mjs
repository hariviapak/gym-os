// Member profile print page (screen preview) verification:
// - back button exists (mobile PWA has no browser back) and returns to profile
// - no horizontal overflow at 320/390/768
// - print styles intact: @page rule + toolbar never printed
// Usage: node scripts/test-print-profile.mjs [baseUrl]
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { adminPassword } from "./lib/test-env.mjs";

const BASE = process.argv[2] || "http://localhost:3000";
const EMAIL = "792fitness@gmail.com";
const PASSWORD = adminPassword();

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
const GYM_ID = "00000000-0000-0000-0000-000000000001";
const { data: ppOrphans } = await db.from("members").select("id").eq("gym_id", GYM_ID).eq("first_name", "Printseed");
for (const o of ppOrphans ?? []) await db.rpc("hard_delete_member", { p_member_id: o.id });
const { data: member } = await db
  .from("members")
  .insert({ gym_id: GYM_ID, first_name: "Printseed", last_name: "Test", phone: String(1000000000 + Math.floor(Math.random() * 8999999999)), status: "active" })
  .select("id, first_name")
  .single();

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
};

const browser = await chromium.launch();
for (const vp of [
  { w: 320, name: "320px" },
  { w: 390, name: "390px" },
  { w: 768, name: "768px" },
]) {
  console.log(`\n--- ${vp.name} ---`);
  const page = await browser.newPage({ viewport: { width: vp.w, height: 844 } });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([page.waitForNavigation(), page.click("form button")]);

  await page.goto(`${BASE}/print/member-profile/${member.id}`, { waitUntil: "networkidle" });

  // 1. no horizontal overflow on screen
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("no horizontal overflow", overflow <= 1, `${overflow}px`);

  // 2. back button exists and returns to the profile
  const back = page.getByRole("link", { name: new RegExp(`← Back to ${member.first_name}`) });
  check("back button present", (await back.count()) === 1);
  await back.click();
  await page.waitForURL(/dashboard\/members\/[^/]+$/, { timeout: 20000 });
  await page.waitForTimeout(400);
  check("back returns to member profile", page.url().includes(`/dashboard/members/${member.id}`));

  // 3. download button in toolbar
  await page.goto(`${BASE}/print/member-profile/${member.id}`, { waitUntil: "networkidle" });
  check("Print / Save PDF button present", (await page.getByRole("button", { name: "Print / Save PDF" }).count()) === 1);

  // 4. print styles intact
  const printInfo = await page.evaluate(() => {
    const style = [...document.querySelectorAll("style")].find((s) => s.textContent.includes("@page"));
    const toolbar = [...document.querySelectorAll("div")].find((d) => d.className.includes("sticky top-0"));
    return {
      atPage: !!style,
      toolbarPrintHidden: toolbar ? toolbar.className.includes("print:hidden") : false,
    };
  });
  check("@page A4 rule present", printInfo.atPage);
  check("toolbar hidden in print", printInfo.toolbarPrintHidden);

  // 5. photo or initials hero renders
  const heroImgs = await page.locator("img").count();
  const txt = await page.evaluate(() => document.body.innerText);
  check("member hero renders", heroImgs >= 1 || txt.includes(member.first_name));

  await page.close();
}

await browser.close();
await db.rpc("hard_delete_member", { p_member_id: member.id });
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed ? "FAILURES: " + failed : "ALL PASS"}: ${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(failed ? 1 : 0);

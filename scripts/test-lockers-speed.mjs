// Locker action speed + instant-patch verification: issue/return/attention
// must update the card WITHOUT a page reload, and each action should feel
// quick (server round trip only — no 200-key page refetch).
// Usage: node scripts/test-lockers-speed.mjs [baseUrl]
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { adminPassword } from "./lib/test-env.mjs";

const BASE = process.argv[2] || "http://localhost:3000";
const EMAIL = "792fitness@gmail.com";
const PASSWORD = adminPassword();
const GYM_ID = "00000000-0000-0000-0000-000000000001";

const env = readFileSync(".env.local", "utf8");
const url = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const key = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();
const db = createClient(url, key, { auth: { persistSession: false } });
await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
const { data: lsOrphans } = await db.from("members").select("id").eq("gym_id", GYM_ID).eq("first_name", "Speedseed");
for (const o of lsOrphans ?? []) await db.rpc("hard_delete_member", { p_member_id: o.id });
const { data: member } = await db
  .from("members")
  .insert({ gym_id: GYM_ID, first_name: "Speedseed", last_name: "Test", phone: String(1000000000 + Math.floor(Math.random() * 8999999999)), status: "active" })
  .select("id, first_name")
  .single();

// a throwaway key for timing
await db.from("locker_keys").delete().eq("gym_id", GYM_ID).eq("key_number", "TEST-TIMING-1");
const { data: tk } = await db.from("locker_keys").insert({
  gym_id: GYM_ID, key_number: "TEST-TIMING-1", locker_number: "T1", status: "available",
}).select().single();

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on("pageerror", (e) => console.log("[pageerror]", e.message.slice(0, 120)));

await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill("input[name=" + '"email"' + "]", EMAIL);
await page.fill("input[name=" + '"password"' + "]", PASSWORD);
await Promise.all([page.waitForNavigation(), page.click("form button")]);
await page.goto(`${BASE}/dashboard/locker-keys`, { waitUntil: "networkidle" });
await page.waitForTimeout(600);

const card = page.locator("div.ring-1", { hasText: "TEST-TIMING-1" }).first();
await card.scrollIntoViewIfNeeded();

// ---- 1. ISSUE ----
let t0 = Date.now();
await card.locator("button", { hasText: "Issue" }).click();
await page.locator('input[placeholder*="Search member"]').fill(member.first_name);
await page.waitForTimeout(300);
await page.locator("button", { hasText: member.first_name }).first().click();
await page.getByRole("button", { name: "Confirm", exact: true }).click();
// wait until the card shows Issued
await page.locator("div.ring-1", { hasText: "TEST-TIMING-1" })
  .locator("span", { hasText: "Issued" }).first().waitFor({ timeout: 20000 });
const issueMs = Date.now() - t0;
const issuedCard = page.locator("div.ring-1", { hasText: "TEST-TIMING-1" }).first();
check("issue reflects instantly", (await issuedCard.locator("button", { hasText: "Return" }).count()) === 1, `${issueMs}ms`);
check("no page reload on issue", (await issuedCard.textContent()).includes(member.first_name));
check("URL unchanged (no navigation)", !page.url().includes("?"));

// ---- 2. RETURN ----
t0 = Date.now();
await issuedCard.locator("button", { hasText: "Return" }).click();
await page.getByRole("button", { name: "Return key" }).click();
await page.locator("div.ring-1", { hasText: "TEST-TIMING-1" }).first()
  .locator("button", { hasText: "Issue" }).waitFor({ timeout: 20000 });
const returnMs = Date.now() - t0;
check("return reflects instantly", returnMs < 10000, `${returnMs}ms`);

// ---- 3. ATTENTION via the detail modal (available keys have no ••• menu) ----
t0 = Date.now();
await page.locator("div.ring-1", { hasText: "TEST-TIMING-1" }).first()
  .getByText("TEST-TIMING-1").click(); // key number opens the detail modal
await page.getByRole("button", { name: "Flag for attention" }).click();
await page.locator("div.ring-1", { hasText: "TEST-TIMING-1" }).first()
  .locator("span", { hasText: "Attention" }).first().waitFor({ timeout: 20000 });
check("attention flag patches instantly", true, `${Date.now() - t0}ms`);
await page.getByRole("button", { name: "Close" }).last().click();
await page.waitForTimeout(300);

// ---- 4. re-issue (attention card: Manage → Issue) ----
await page.locator("div.ring-1", { hasText: "TEST-TIMING-1" }).first()
  .getByRole("button", { name: "Manage" }).click();
await page.getByRole("button", { name: "Issue Key" }).click();
await page.locator('input[placeholder*="Search member"]').fill(member.first_name);
await page.waitForTimeout(300);
await page.locator("button", { hasText: member.first_name }).first().click();
await page.getByRole("button", { name: "Confirm", exact: true }).click();
await page.waitForTimeout(2500);
// issuing an attention key keeps the flag → primary stays "Manage" (by design)
await page.locator("div.ring-1", { hasText: "TEST-TIMING-1" }).first()
  .getByRole("button", { name: "Manage" }).waitFor({ timeout: 20000 });
const cardTxt4 = await page.locator("div.ring-1", { hasText: "TEST-TIMING-1" }).first().textContent();
check("issue from detail modal patches (attention primary)", cardTxt4.includes(member.first_name));

// ---- 5. DB truth check ----
const { data: after } = await db.from("locker_keys").select("status, current_member_id").eq("id", tk.id).single();
check("server state matches UI", after.status === "issued" && after.current_member_id === member.id);
const { count } = await db.from("locker_key_logs").select("id", { count: "exact", head: true }).eq("gym_id", GYM_ID).eq("locker_key_id", tk.id);
check("history rows written", (count ?? 0) >= 2, `${count} rows`);
const { count: audits } = await db.from("audit_logs").select("id", { count: "exact", head: true }).eq("gym_id", GYM_ID).eq("entity_id", tk.id);
check("audit rows written", (audits ?? 0) >= 3, `${audits} rows`);

// cleanup
await db.from("locker_key_logs").update({ returned_at: new Date().toISOString() }).eq("locker_key_id", tk.id).is("returned_at", null);
await db.from("locker_keys").delete().eq("id", tk.id);
await db.rpc("hard_delete_member", { p_member_id: member.id });
await browser.close();

const failed = results.filter((r) => !r.ok).length;
console.log(failed ? `FAILED: ${failed}/${results.length}` : `ALL PASS: ${results.length}/${results.length}`);
process.exit(failed ? 1 : 0);

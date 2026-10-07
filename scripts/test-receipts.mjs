// Receipt share verification: staff sends a token-gated WhatsApp link, the
// member opens it WITHOUT login, views + downloads the receipt, voided
// receipts carry a permanent VOIDED mark, and expired links explain themselves.
// Usage: node scripts/test-receipts.mjs [baseUrl]
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { adminPassword } from "./lib/test-env.mjs";

const BASE = process.argv[2] || "http://localhost:3000";
const BASE_HOST = BASE.replace(/^https?:\/\//, "");
const EMAIL = "792fitness@gmail.com";
const PASSWORD = adminPassword();
const GYM_ID = "00000000-0000-0000-0000-000000000001";

const envKeys = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.split("=")[0], l.split("=").slice(1).join("=")])
);
const db = createClient(envKeys.NEXT_PUBLIC_SUPABASE_URL, envKeys.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const istDate = (offsetDays = 0) => {
  const d = new Date(Date.now() + offsetDays * 86400000 + 5.5 * 3600000);
  return d.toISOString().slice(0, 10);
};

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
};

await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });

// ---- setup: member + membership + payment + receipt ----
const { data: orphans } = await db.from("members").select("id").eq("gym_id", GYM_ID).eq("first_name", "Receipttest");
for (const o of orphans ?? []) await db.rpc("hard_delete_member", { p_member_id: o.id });

const { data: pkg } = await db.from("packages").select("id").eq("gym_id", GYM_ID).eq("type", "membership").limit(1).maybeSingle();
const { data: adminUser } = await db.from("users").select("id").eq("email", EMAIL).single();
const phone = String(1000000000 + Math.floor(Math.random() * 8999999999));
const { data: member } = await db
  .from("members")
  .insert({ gym_id: GYM_ID, first_name: "Receipttest", last_name: "Pending", phone, status: "active" })
  .select()
  .single();
const { data: ms } = await db.from("memberships").insert({
  gym_id: GYM_ID,
  member_id: member.id,
  package_id: pkg.id,
  start_date: istDate(-5),
  end_date: istDate(25),
  status: "active",
  payment_status: "paid",
  amount: 3000,
  gst_amount: 0,
  total_amount: 3000,
  amount_paid: 3000,
}).select().single();
const { data: payment } = await db.from("payments").insert({
  gym_id: GYM_ID,
  member_id: member.id,
  membership_id: ms.id,
  amount: 3000,
  mode: "upi",
  payment_date: istDate(-5),
  reference_note: "RCPT-TEST",
}).select().single();
const { data: maxReceipt } = await db.from("receipts").select("receipt_no").eq("gym_id", GYM_ID).order("receipt_no", { ascending: false }).limit(1).maybeSingle();
const { data: receipt, error: receiptErr } = await db.from("receipts").insert({
  gym_id: GYM_ID,
  receipt_no: (maxReceipt?.receipt_no ?? 0) + 1,
  member_id: member.id,
  membership_id: ms.id,
  payment_id: payment.id,
  amount: 3000,
  gst_amount: 0,
  total_amount: 3000,
  created_by: adminUser.id,
}).select().single();
if (receiptErr) {
  console.error("receipt insert failed:", JSON.stringify(receiptErr));
  process.exit(1);
}
console.log(`setup: receipt #${receipt.receipt_no} for ${member.id}`);

const browser = await chromium.launch();

// ---- staff: receipt page + Send to member ----
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([page.waitForNavigation(), page.click("form button")]);

  await page.goto(`${BASE}/dashboard/receipts/${receipt.id}`, { waitUntil: "networkidle" });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("receipt page fits on mobile", overflow <= 1, `${overflow}px`);
  check("Send to member button present", (await page.getByRole("button", { name: "Send to member" }).count()) === 1);

  await page.getByRole("button", { name: "Send to member" }).click();
  await page.waitForURL(/(wa\.me|api\.whatsapp\.com)/, { timeout: 20000, waitUntil: "commit" });
  const waUrl = decodeURIComponent(page.url().replace(/\+/g, " "));
  const m = waUrl.match(/https?:\/\/[^/]+\/r\/([a-f0-9]+)/);
  check("wa.me message contains receipt link", !!m, waUrl.slice(0, 80) + "…");
  const token = m?.[1] ?? "";
  check("link uses the CURRENT host", waUrl.includes(`${BASE_HOST}/r/`));
  check("message greets member", waUrl.includes("Hello Receipttest Pending"));
  await page.close();

  // ---- member: clean unauthenticated context ----
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mpage = await ctx.newPage();
  await mpage.goto(`${BASE}/r/${token}`, { waitUntil: "networkidle" });
  check("public receipt opens without login", !/\/login/.test(mpage.url()));
  const txt = await mpage.evaluate(() => document.body.innerText);
  check("receipt details render", txt.includes("Payment Receipt") && txt.includes("Receipttest Pending"));
  check("amount + mode render", txt.includes("3,000") && /upi/i.test(txt));
  check("Download PDF button present", (await mpage.getByRole("button", { name: "Download PDF" }).count()) === 1);

  // ---- voided receipt carries a permanent mark ----
  await db.from("receipts").update({ voided_at: new Date().toISOString() }).eq("id", receipt.id);
  await mpage.goto(`${BASE}/r/${token}`, { waitUntil: "networkidle" });
  const voidTxt = await mpage.evaluate(() => document.body.innerText);
  check("voided receipt shows VOIDED watermark", /voided/i.test(voidTxt));
  check("voided notice explains invalidity", /not a valid proof/i.test(voidTxt));
  await db.from("receipts").update({ voided_at: null }).eq("id", receipt.id);

  // ---- expired link state ----
  await db.from("receipt_tokens").update({ expires_at: new Date(Date.now() - 86400000).toISOString() }).eq("token", token);
  await mpage.goto(`${BASE}/r/${token}`, { waitUntil: "networkidle" });
  const expTxt = await mpage.evaluate(() => document.body.innerText);
  check("expired link explains itself", /expired/i.test(expTxt) && /resend/i.test(expTxt));
  await ctx.close();
}

// ---- mobile navigation paths to the receipt ----
{
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await page.fill('input[name="email"]', EMAIL);
  await page.fill('input[name="password"]', PASSWORD);
  await Promise.all([page.waitForNavigation(), page.click("form button")]);

  // payments card → Receipt button
  await page.goto(`${BASE}/dashboard/payments`, { waitUntil: "networkidle" });
  await page.waitForTimeout(500);
  const card = page.locator("div.rounded-xl", { hasText: "Receipttest Pending" }).first();
  const receiptBtn = card.getByRole("link", { name: "Receipt", exact: true });
  check("payments card has Receipt button", (await receiptBtn.count()) === 1);
  await receiptBtn.click();
  await page.waitForURL(/dashboard\/receipts\//, { timeout: 20000 });
  check("Receipt button opens the receipt page", true);

  // member profile → payment ⋯ → View receipt
  await page.goto(`${BASE}/dashboard/members/${member.id}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  await page.getByRole("button", { name: /View payment history/ }).click();
  await page.waitForTimeout(400);
  const row = page.locator('div.rounded-lg.bg-zinc-50', { hasText: `R#${receipt.receipt_no}` }).first();
  await row.getByRole("button", { name: "⋯" }).click();
  await page.getByRole("link", { name: "View receipt →" }).waitFor({ timeout: 10000 });
  check("profile payment ⋯ has View receipt", true);
  await page.close();
}

await browser.close();

// cleanup: member cascade removes payment/receipt/tokens
await db.rpc("hard_delete_member", { p_member_id: member.id });
const left = (await db.from("members").select("id").eq("id", member.id)).data.length;
check("cleanup: test data removed", left === 0);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed ? "FAILURES: " + failed : "ALL PASS"}: ${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(failed ? 1 : 0);

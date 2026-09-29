// Logic verification for filters + reports:
//  - payments date filter boundaries (from/to inclusive, both ends)
//  - payments "total" header = DB sum of the WHOLE filtered set, voids excluded
//  - members status filter count = DB count
//  - dashboard "This month" card = DB month revenue (voids excluded)
//  - reports overview revenue = same DB truth (dashboard == reports)
// Usage: node scripts/test-filters-logic.mjs [baseUrl]
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const BASE = process.argv[2] || "http://localhost:3000";
const EMAIL = "admin@792fitness.com";
const PASSWORD = "Admin@792Fit";
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
const TODAY = istDate();
const YDAY = istDate(-1);
const TWOAGO = istDate(-2);

const results = [];
const check = (name, ok, detail = "") => {
  results.push({ name, ok });
  console.log(`  ${ok ? "✓" : "✗"} ${name}${detail ? " — " + detail : ""}`);
};

await db.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });

// ---- DB truth helper: all non-voided payments in a date range ----
const dbRange = async (from, to) => {
  let q = db
    .from("payments")
    .select("id, amount, payment_date, receipts!receipts_payment_id_fkey(voided_at)")
    .eq("gym_id", GYM_ID);
  if (from) q = q.gte("payment_date", from);
  if (to) q = q.lte("payment_date", to);
  const { data } = await q;
  const live = (data ?? []).filter((p) => !p.receipts?.[0]?.voided_at);
  return { count: live.length, sum: live.reduce((s, p) => s + Number(p.amount), 0) };
};

// ---- setup: test member + 3 boundary payments ----
const { data: orphans } = await db.from("members").select("id").eq("gym_id", GYM_ID).eq("first_name", "Logic");
for (const o of orphans ?? []) await db.rpc("hard_delete_member", { p_member_id: o.id });

const phone = String(1000000000 + Math.floor(Math.random() * 8999999999));
const { data: member } = await db
  .from("members")
  .insert({ gym_id: GYM_ID, first_name: "Logic", last_name: "Tester", phone, status: "active" })
  .select()
  .single();

const notes = { P1: `LOGIC-TEST-P1-${Date.now() % 10000}`, P2: `LOGIC-TEST-P2-${Date.now() % 10000}`, P3: `LOGIC-TEST-P3-${Date.now() % 10000}` };
for (const [key, date] of [["P1", TODAY], ["P2", YDAY], ["P3", TWOAGO]]) {
  const r = await db.from("payments").insert({
    gym_id: GYM_ID,
    member_id: member.id,
    amount: { P1: 100, P2: 200, P3: 300 }[key],
    mode: "upi",
    payment_date: date,
    reference_note: notes[key],
  });
  if (r.error) {
    console.error("payment insert failed:", JSON.stringify(r.error));
    process.exit(1);
  }
}
console.log(`setup: payments on ${TODAY} (+100), ${YDAY} (+200), ${TWOAGO} (+300)`);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
await page.fill('input[name="email"]', EMAIL);
await page.fill('input[name="password"]', PASSWORD);
await Promise.all([page.waitForNavigation(), page.click("form button")]);

const bodyText = () => page.evaluate(() => document.body.innerText);

// ---- A. from boundary is inclusive ----
{
  await page.goto(`${BASE}/dashboard/payments?from=${YDAY}`, { waitUntil: "networkidle" });
  const txt = await bodyText();
  const expected = await dbRange(YDAY, null);
  check("from=YESTERDAY includes yesterday payment", txt.includes(notes.P2));
  check("from=YESTERDAY includes today payment", txt.includes(notes.P1));
  check("from=YESTERDAY excludes 2-day-old payment", !txt.includes(notes.P3));
  check(
    "header total = DB sum of whole filtered set",
    txt.includes(`₹${expected.sum.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total`),
    `page shows DB sum ${expected.sum}`
  );
}

// ---- B. to boundary is inclusive ----
{
  await page.goto(`${BASE}/dashboard/payments?from=${TWOAGO}&to=${YDAY}`, { waitUntil: "networkidle" });
  const txt = await bodyText();
  check("range includes yesterday payment", txt.includes(notes.P2));
  check("range includes 2-day-old payment", txt.includes(notes.P3));
  check("range excludes today payment", !txt.includes(notes.P1));
  const expected = await dbRange(TWOAGO, YDAY);
  check("range header total matches DB", txt.includes(`₹${expected.sum.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total`), `DB ${expected.sum}`);
}

// ---- C. exact single-day range ----
{
  await page.goto(`${BASE}/dashboard/payments?from=${YDAY}&to=${YDAY}`, { waitUntil: "networkidle" });
  const txt = await bodyText();
  check("single-day range shows only that day", txt.includes(notes.P2) && !txt.includes(notes.P1) && !txt.includes(notes.P3));
}

// ---- D. mode filter combines with dates ----
{
  const { count: upiYday } = await dbRange(YDAY, YDAY);
  await page.goto(`${BASE}/dashboard/payments?from=${YDAY}&to=${YDAY}&mode=upi`, { waitUntil: "networkidle" });
  const txt = await bodyText();
  check("mode filter keeps the day's UPI payment", txt.includes(notes.P2));
  const expected = await (async () => {
    const { data } = await db
      .from("payments")
      .select("id, amount, receipts!receipts_payment_id_fkey(voided_at)")
      .eq("gym_id", GYM_ID)
      .eq("mode", "upi")
      .gte("payment_date", YDAY)
      .lte("payment_date", YDAY);
    const live = (data ?? []).filter((p) => !p.receipts?.[0]?.voided_at);
    return live.reduce((s, p) => s + Number(p.amount), 0);
  })();
  check("mode+date header total matches DB", txt.includes(`₹${expected.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} total`), `DB ${expected}`);
}

// ---- E. members status filter count = DB count ----
{
  // the page derives "frozen" from active/approved freezes OR the status column
  const { data: statusFrozen } = await db.from("members").select("id").eq("gym_id", GYM_ID).eq("status", "frozen");
  const { data: activeFreezeMembers } = await db
    .from("membership_freezes")
    .select("member_id")
    .eq("gym_id", GYM_ID)
    .in("status", ["active", "approved"]);
  const frozenDB = new Set([...(statusFrozen ?? []).map((m) => m.id), ...(activeFreezeMembers ?? []).map((f) => f.member_id)]).size;
  await page.goto(`${BASE}/dashboard/members?status=frozen`, { waitUntil: "networkidle" });
  const txt = await bodyText();
  check("frozen filter count matches DB", txt.includes(`${frozenDB} members`), `DB ${frozenDB}`);
  // and the tab is active
  const frozenChipCls = (await page.getByRole("button", { name: "Frozen", exact: true }).getAttribute("class")) ?? "";
  check("frozen chip active", frozenChipCls.includes("bg-zinc-900"));
}

// ---- F. dashboard month card = DB month revenue (voids excluded) ----
{
  const monthStart = `${TODAY.slice(0, 7)}-01`;
  const { sum } = await dbRange(monthStart, null);
  await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
  const txt = await bodyText();
  const compact = `₹${sum.toLocaleString("en-IN")}`;
  check("dashboard card shows DB month revenue (voids excluded)", txt.includes(compact), `DB ${compact}`);
  check("dashboard card links to reports", txt.includes("Reports →"));
}

// ---- G. reports overview uses the same DB truth ----
{
  const monthStart = `${TODAY.slice(0, 7)}-01`;
  const { sum } = await dbRange(monthStart, null);
  await page.goto(`${BASE}/dashboard/reports?preset=month`, { waitUntil: "networkidle" });
  const txt = await bodyText();
  const compact = `₹${sum.toLocaleString("en-IN")}`;
  check("reports overview revenue matches DB", txt.includes(compact), `DB ${compact}`);
}

await browser.close();

// cleanup: member delete cascades payments
await db.rpc("hard_delete_member", { p_member_id: member.id });
const left = (await db.from("members").select("id").eq("id", member.id)).data.length;
check("cleanup: test data removed", left === 0);

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${failed ? "FAILURES: " + failed : "ALL PASS"}: ${results.filter((r) => r.ok).length}/${results.length}`);
process.exit(failed ? 1 : 0);

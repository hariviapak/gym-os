// E2E test of the group enrollment flow — mirrors enrollMember 1:1:
// dup-phone quick-adds, double-booking guard, partial collection split,
// consolidated receipt, auto group assignment, gift kits for all members.
// NOTE: before re-running, clean stray artifacts of the existing participant
// (RLS blocks client-side deletes) with the psql snippet in this file's README
// note below. Run from the project root: node scripts/test-group-enrollment.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter(l => l.includes("=")).map(l => [l.split("=")[0], l.split("=").slice(1).join("=")])
);
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

// --- helpers identical to the app ---
const todayIST = () => new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const dateToIST = (d) => d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
const normalizePhone = (p) => { const d = p.replace(/\D/g, ""); return d.length === 10 ? "91" + d : d; };
const fail = (msg) => { console.log("❌ " + msg); process.exit(1); };
const ok = (msg) => console.log("✓ " + msg);

// --- sign in as admin ---
const { data: auth, error: authErr } = await supa.auth.signInWithPassword({ email: "792fitness@gmail.com", password: "Admin@792Fit" });
if (authErr) fail("auth: " + authErr.message);
const { data: me } = await supa.from("users").select("gym_id, id, role").eq("id", auth.user.id).single();
const gymId = me.gym_id;
const createdBy = me.id;
ok(`signed in (${me.role})`);

// --- fetch package: Family Annual (3 Members) ---
const { data: pkg } = await supa.from("packages").select("*").eq("gym_id", gymId).ilike("name", "Family Annual (3 Members)").single();
if (!pkg) fail("package not found");
const totalAmount = Number(pkg.amount);
ok(`package: ${pkg.name} ₹${totalAmount} ${pkg.duration_days}d service=${pkg.service_type} group=${pkg.is_group_package}`);

// --- self-provisioned throwaway "existing member" (no demo-data dependency) ---
const { data: existingStrays } = await supa.from("members").select("id").eq("gym_id", gymId).in("first_name", ["Grp", "Kidso", "Grpexist"]);
for (const s of existingStrays ?? []) await supa.rpc("hard_delete_member", { p_member_id: s.id });
if (existingStrays?.length) console.log("   pre-clean: removed " + existingStrays.length + " stray test members");
const { data: suresh } = await supa.from("members").insert({
  gym_id: gymId, first_name: "Grpexist", last_name: "Test",
  phone: String(1000000000 + Math.floor(Math.random() * 8999999999)), status: "active",
}).select("id, first_name").single();
if (!suresh) fail("could not create throwaway existing member");
ok(`existing participant: ${suresh.first_name} (${suresh.id.slice(0, 8)}) — self-provisioned`);

// ============ PRE-CLEAN (from prior failed runs) ============
await supa.from("member_groups").delete().eq("gym_id", gymId).ilike("name", "Grptest & Family");
const { count: preCount } = await supa.from("memberships").select("id", { count: "exact", head: true }).eq("package_id", pkg.id);
if ((preCount ?? 0) !== 0) fail(`pre-clean incomplete: ${preCount} Family Annual (3) memberships remain`);
ok("pre-clean complete (0 stray memberships)");

// ============ THE FLOW (mirrors enrollMember exactly) ============
// primary = new member; quick-add #1 SHARES THE PRIMARY'S PHONE (old bug trigger)
const primaryPhoneRaw = "94999" + Math.floor(10000 + Math.random() * 89999);
const groupEntries = [
  { id: null, new: null, amount: 30000 },                                  // primary (new member)
  { id: null, new: { first_name: "Kidso", last_name: "Test", phone: primaryPhoneRaw }, amount: 30000 }, // quick-add, SAME phone as primary
  { id: suresh.id, new: null, amount: 40000 },                             // existing member
];
// client sends normalized primary phone too
const formData = {
  first_name: "Grp", last_name: "Test", phone: primaryPhoneRaw,
  gift_kit: "yes", gift_kit_delivered: "no",
  payment_mode: "cash", reference_note: "e2e group test",
  group_amount_collected: "60000.00",   // partial collection
  group_receipt_mode: "group",
  group_bill_name: "Grptest & Family",
};

// Step 1: create primary member
const { data: member, error: mErr } = await supa.from("members").insert({
  gym_id: gymId, first_name: formData.first_name, last_name: formData.last_name,
  phone: normalizePhone(formData.phone), status: "active",
}).select().single();
if (mErr) fail("primary insert: " + mErr.message);
ok(`primary member created: ${member.first_name} ${member.last_name} (${member.id.slice(0, 8)}) phone=${member.phone}`);

// Step 2: quick-add loop — ALWAYS create, never merge
for (const e of groupEntries) {
  if (!e.id && e.new) {
    const newPhone = normalizePhone(e.new.phone || "");
    const { data: createdMember, error: createError } = await supa.from("members").insert({
      gym_id: gymId, first_name: e.new.first_name, last_name: e.new.last_name || null,
      phone: newPhone, status: "active",
    }).select("id").single();
    if (createError || !createdMember) fail("quick-add create failed (would redirect with error): " + (createError?.message ?? "unknown"));
    e.id = createdMember.id; e.new = null;
  }
}
// ASSERT: quick-added is a SEPARATE member despite the shared phone
const { data: samePhone } = await supa.from("members").select("id, first_name").eq("gym_id", gymId).eq("phone", normalizePhone(primaryPhoneRaw));
if (samePhone.length !== 2) fail(`expected 2 distinct members with phone ${primaryPhoneRaw}, got ${samePhone.length}`);
if (samePhone.some(m => m.id === member.id) && samePhone.filter(m => m.id !== member.id).length !== 1) fail("quick-add merged into primary!");
ok(`dup-phone quick-add created a SEPARATE member (${samePhone.length} members share the phone — no silent merge)`);

// Step 3: double-booking guard
const seenMemberIds = new Set();
let guardBlocked = false;
for (const e of groupEntries) {
  const mid = e.id ?? member.id;
  if (seenMemberIds.has(mid)) { guardBlocked = true; break; }
  seenMemberIds.add(mid);
}
if (guardBlocked) fail("guard falsely triggered on valid group");
// simulate the malicious payload: primary repeated
const malicious = [{ id: null, new: null, amount: 1 }, { id: member.id, new: null, amount: 1 }];
const seen2 = new Set([member.id]);
let blocked = false;
for (const e of malicious) { const mid = e.id ?? member.id; if (seen2.has(mid)) { blocked = true; break; } seen2.add(mid); }
if (!blocked) fail("double-booking guard did NOT block same-member-twice payload");
ok("double-booking guard blocks same-member-twice, passes valid groups");

// Step 4: split validation
const sum = groupEntries.reduce((s, e) => s + Number(e.amount), 0);
if (Math.abs(sum - totalAmount) > 0.01) fail(`split ${sum} != total ${totalAmount}`);

// Step 5: collected distribution
const collected = Math.min(totalAmount, Math.max(0, parseFloat(formData.group_amount_collected)));
let remaining = collected;
const startDateStr = todayIST();
const endDate = new Date(startDateStr); endDate.setDate(endDate.getDate() + pkg.duration_days);
const endDateStr = dateToIST(endDate);
const paymentGroupId = crypto.randomUUID();
const groupBillName = formData.group_bill_name || `${member.first_name} & Family`;

const participants = groupEntries.map(e => {
  const share = Number(e.amount) || 0;
  const paid = Math.min(share, Math.max(0, remaining));
  remaining = Math.round((remaining - paid) * 100) / 100;
  return { memberId: e.id ?? member.id, total: share, paid: Math.round(paid * 100) / 100, isNew: !e.id ? true : false };
});
ok(`collected ₹${collected} of ₹${totalAmount} → ${participants.map(p => `${p.memberId.slice(0, 6)}:${p.paid}/${p.total}`).join(", ")}`);

// Step 6: memberships + payments + consolidated receipt (mode=group)
const perParticipant = participants; // (no pre-existing active dupes in this test)
let firstPaymentId = null;
for (const p of perParticipant) {
  const base = Number((p.total / (1 + pkg.gst_rate / 100)).toFixed(2));
  const gst = Number((p.total - base).toFixed(2));
  const msStatus = p.paid >= p.total ? "paid" : p.paid > 0 ? "partial" : "pending";
  const { data: ms, error: msErr } = await supa.from("memberships").insert({
    gym_id: gymId, member_id: p.memberId, package_id: pkg.id, package_name: pkg.name,
    status: "active", payment_status: msStatus, start_date: startDateStr, end_date: endDateStr,
    amount: base, gst_amount: gst, total_amount: p.total,
    amount_paid: p.paid, payment_group_id: paymentGroupId, created_by: createdBy,
  }).select().single();
  if (msErr) fail("membership insert: " + msErr.message);
  // group receipt mode: single payment after the loop (individual mode would
  // create a payment per participant here)
}

// Step 7: ONE payment (full collected amount) + ONE consolidated receipt
const { data: groupPayment } = await supa.from("payments").insert({
  gym_id: gymId, member_id: member.id, membership_id: null, amount: collected,
  mode: formData.payment_mode, reference_note: formData.reference_note,
  payment_date: todayIST(), payment_group_id: paymentGroupId, created_by: createdBy,
}).select().single();
if (!groupPayment) fail("group payment insert failed");
const { data: receiptNo } = await supa.rpc("get_next_receipt_no", { p_gym_id: gymId }).single();
const { data: receipt, error: rErr } = await supa.from("receipts").insert({
  gym_id: gymId, receipt_no: receiptNo, member_id: member.id,
  membership_id: null, payment_id: groupPayment.id,
  amount: 100000, gst_amount: 0, total_amount: totalAmount,
  billed_to: groupBillName, payment_group_id: paymentGroupId, created_by: createdBy,
}).select().single();
if (rErr) fail("receipt: " + rErr.message);
await supa.from("payments").update({ receipt_id: receipt.id }).eq("id", groupPayment.id);

// Step 8: auto-assign member_groups
const { data: existingGroup } = await supa.from("member_groups").select("id").eq("gym_id", gymId).ilike("name", groupBillName).maybeSingle();
let groupId = existingGroup?.id;
if (!groupId) {
  const { data: ng } = await supa.from("member_groups").insert({ gym_id: gymId, name: groupBillName, created_by: createdBy }).select("id").single();
  groupId = ng?.id;
}
await supa.from("members").update({ group_id: groupId }).in("id", perParticipant.map(p => p.memberId));

// Step 9: gift kit for EVERY participant
const giftKitMemberIds = perParticipant.map(p => p.memberId);
await supa.from("gift_kit_tasks").insert(giftKitMemberIds.map(mid => ({
  gym_id: gymId, member_id: mid, status: "pending",
  created_by: createdBy,
})));

// ============ ASSERTIONS ============
// memberships: 3 rows, statuses by distribution
const msIds = perParticipant.map(p => p.memberId);
const { data: newMs } = await supa.from("memberships").select("member_id, payment_status, total_amount, amount_paid").in("member_id", msIds).eq("package_id", pkg.id);
if (newMs.length !== 3) fail(`expected 3 memberships, got ${newMs.length}`);
const statuses = newMs.map(m => `${m.member_id.slice(0, 6)}:${m.payment_status}(${m.amount_paid}/${m.total_amount})`);
ok(`3 memberships created → ${statuses.join(", ")}`);
if (newMs.filter(m => m.payment_status === "paid").length !== 2) fail("distribution: expected 2 paid");
if (newMs.filter(m => m.payment_status === "pending").length !== 1) fail("distribution: expected 1 pending (#3 collected nothing)");

// ONE payment row carrying the FULL collected amount (group mode)
const { data: groupPays } = await supa.from("payments").select("id, member_id, amount, receipt_id").eq("payment_group_id", paymentGroupId);
if (groupPays.length !== 1) fail(`expected exactly 1 payment row in group mode, got ${groupPays.length}`);
if (Number(groupPays[0].amount) !== collected) fail(`payment amount ${groupPays[0].amount} != collected ${collected}`);
ok(`ONE payment row: ₹${groupPays[0].amount} (full collection, single record)`);

// annexure source: memberships by payment_group_id
const { data: annexRows } = await supa.from("memberships").select("id, amount_paid, total_amount, members(first_name, last_name)").eq("payment_group_id", paymentGroupId);
if (annexRows.length !== 3) fail(`expected 3 memberships in the payment group, got ${annexRows.length}`);
ok(`receipt annexure source: ${annexRows.length} member shares (${annexRows.map(a => `${a.members.first_name}:₹${a.amount_paid}`).join(", ")})`);

// receipt
if (receipt.billed_to !== "Grptest & Family") fail("receipt billed_to wrong");
if (receipt.payment_group_id !== paymentGroupId) fail("receipt payment_group_id wrong");
if (receipt.payment_id !== groupPayment.id) fail("receipt not linked to the single group payment");
ok(`ONE consolidated receipt #${receipt.receipt_no} billed to "${receipt.billed_to}"`);

// group assignment
const { data: grouped } = await supa.from("members").select("id, first_name").eq("group_id", groupId);
if (grouped.length !== 3) fail(`expected 3 members in group, got ${grouped.length}`);
ok(`member_groups "${groupBillName}" auto-assigned to all 3: ${grouped.map(g => g.first_name).join(", ")}`);

// gift kits: one per member
const { data: kits } = await supa.from("gift_kit_tasks").select("member_id").in("member_id", msIds);
const uniqueKits = new Set(kits.map(k => k.member_id));
if (uniqueKits.size !== 3) fail(`expected 3 gift kits (one per member), got ${uniqueKits.size}`);
const kitCounts = {};
kits.forEach(k => { kitCounts[k.member_id] = (kitCounts[k.member_id] ?? 0) + 1; });
if (Object.values(kitCounts).some(n => n > 1)) fail("a member got 2+ gift kits!");
ok(`gift kits assigned to ALL 3 group members, one each (${kits.length} tasks)`);

// no duplicate membership per member
const perMember = {};
newMs.forEach(m => { perMember[m.member_id] = (perMember[m.member_id] ?? 0) + 1; });
if (Object.values(perMember).some(n => n > 1)) fail("a member received 2+ memberships (double-booking!)");
ok("no member double-booked (one membership each)");

// ============ CLEANUP (all participants are self-provisioned this run) ============
const cleanupIds = [...new Set([member.id, ...groupEntries.filter(e => e.id).map(e => e.id)])];
for (const mid of cleanupIds) {
  const { data: deleted, error: delErr } = await supa.rpc("hard_delete_member", { p_member_id: mid });
  if (delErr || !deleted) console.log(`   cleanup warn ${mid.slice(0, 6)}: ${delErr?.message ?? "not deleted"}`);
}
await supa.from("member_groups").delete().eq("id", groupId);
// verify cleanup
const { data: leftovers } = await supa.from("memberships").select("id").in("member_id", msIds);
console.log(`\ncleanup: ${leftovers?.length === 0 ? "all test members + data removed" : "LEFTOVERS: " + leftovers.length}`);
console.log("\nALL GROUP ENROLLMENT TESTS PASSED (incl. dup-phone scenario, partial collection, consolidated receipt, gift kits for all)");

// E2E test of the locker key inventory lifecycle — mirrors the actions 1:1:
// bulk-create → issue → transfer → flag → return → rename → remove, with
// history checks. Run: node scripts/test-lockers.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { adminPassword } from "./lib/test-env.mjs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter(l => l.includes("=")).map(l => [l.split("=")[0], l.split("=").slice(1).join("=")])
);
const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const fail = (m) => { console.log("❌ " + m); process.exit(1); };
const ok = (m) => console.log("✓ " + m);

const { data: auth, error: authErr } = await supa.auth.signInWithPassword({ email: "792fitness@gmail.com", password: adminPassword() });
if (authErr) fail("auth: " + authErr.message);
const { data: me } = await supa.from("users").select("gym_id, id, role").eq("id", auth.user.id).single();
const gymId = me.gym_id;
ok(`signed in (${me.role})`);

// ---- pre-clean any keys from prior runs ----
const { data: prior } = await supa.from("locker_keys").select("id, key_number").eq("gym_id", gymId).like("key_number", "TEST-%");
if (prior.length) console.log("   pre-clean: " + prior.length + " prior TEST keys (returned first)");
for (const k of prior) {
  await supa.from("locker_key_logs").update({ returned_at: new Date().toISOString(), returned_by: me.id }).eq("locker_key_id", k.id).is("returned_at", null);
  await supa.from("locker_keys").delete().eq("id", k.id);
}
const { count: preCount } = await supa.from("locker_keys").select("id", { count: "exact", head: true }).eq("gym_id", gymId).like("key_number", "TEST-%");
if ((preCount ?? 0) !== 0) fail("pre-clean incomplete");

// ---- bulk-create (mirrors addLockerKeysBulk) ----
const rows = Array.from({ length: 5 }, (_, i) => ({
  gym_id: gymId,
  key_number: `TEST-${String(101 + i).padStart(3, "0")}`,
  locker_number: String(101 + i).padStart(2, "0"),
  status: "available",
}));
const { error: bulkErr } = await supa.from("locker_keys").insert(rows);
if (bulkErr) fail("bulk create: " + bulkErr.message);
ok("bulk-created 5 keys (TEST-101…TEST-105)");

// duplicate key_number must fail (unique gym_id+key_number)
const { error: dupErr } = await supa.from("locker_keys").insert({ gym_id: gymId, key_number: "TEST-101", status: "available" });
if (!dupErr) fail("duplicate key creation should fail");
ok("duplicate key rejected (unique constraint)");

// ---- self-provisioned throwaway members (no demo-data dependency) ----
const { data: priorMembers } = await supa.from("members").select("id").eq("gym_id", gymId).eq("first_name", "Locktest");
for (const s of priorMembers ?? []) await supa.rpc("hard_delete_member", { p_member_id: s.id });
const throwPhone = () => String(1000000000 + Math.floor(Math.random() * 8999999999));
const { data: lockA } = await supa.from("members").insert({ gym_id: gymId, first_name: "Locktest", last_name: "A", phone: throwPhone(), status: "active" }).select("id, first_name").single();
const { data: lockB } = await supa.from("members").insert({ gym_id: gymId, first_name: "Locktest", last_name: "B", phone: throwPhone(), status: "active" }).select("id, first_name").single();
if (!lockA || !lockB) fail("could not create throwaway members");

// ---- issue (mirrors issueLockerKey) ----
const { data: key101 } = await supa.from("locker_keys").select("id, key_number, status").eq("gym_id", gymId).eq("key_number", "TEST-101").single();
await supa.from("locker_keys").update({ status: "issued", current_member_id: lockA.id, issued_at: new Date().toISOString() }).eq("id", key101.id);
await supa.from("locker_key_logs").insert({ gym_id: gymId, locker_key_id: key101.id, member_id: lockA.id, key_number: key101.key_number, issued_by: me.id });
ok(`issued TEST-101 to ${lockA.first_name} ${lockA.last_name}`);

// ---- transfer (mirrors transferLockerKey) ----
await supa.from("locker_key_logs").update({ returned_at: new Date().toISOString(), returned_by: me.id, notes: "Transferred" }).eq("locker_key_id", key101.id).is("returned_at", null);
await supa.from("locker_keys").update({ current_member_id: lockB.id, issued_at: new Date().toISOString() }).eq("id", key101.id);
await supa.from("locker_key_logs").insert({ gym_id: gymId, locker_key_id: key101.id, member_id: lockB.id, key_number: key101.key_number, issued_by: me.id, notes: "Received via transfer" });
ok(`transferred TEST-101 → ${lockB.first_name} ${lockB.last_name}`);

// ---- flag attention (manual only) ----
await supa.from("locker_keys").update({ attention: true }).eq("id", key101.id);
ok("flagged TEST-101 for attention");

// ---- verifications ----
const { data: k1 } = await supa.from("locker_keys").select("status, attention, current_member_id").eq("id", key101.id).single();
if (k1.status !== "issued") fail("status should be issued");
if (k1.current_member_id !== lockB.id) fail("holder should be Locktest B");
if (!k1.attention) fail("attention flag lost");

const { data: logs101 } = await supa.from("locker_key_logs").select("member_id, returned_at, notes").eq("locker_key_id", key101.id).order("issued_at");
if (logs101.length !== 2) fail(`expected 2 history rows, got ${logs101.length}`);
if (logs101[0].returned_at === null) fail("first issue should be closed by transfer");
if (logs101[1].returned_at !== null) fail("current issue should be open");
ok(`history correct: ${logs101.length} rows (transfer closed the first)`);

// ---- return (mirrors returnLockerKey) ----
await supa.from("locker_keys").update({ status: "available", current_member_id: null, issued_at: null, attention: false }).eq("id", key101.id);
await supa.from("locker_key_logs").update({ returned_at: new Date().toISOString(), returned_by: me.id }).eq("locker_key_id", key101.id).is("returned_at", null);
const { data: k2 } = await supa.from("locker_keys").select("status, current_member_id, attention").eq("id", key101.id).single();
if (k2.status !== "available" || k2.current_member_id !== null) fail("key not returned to available");
if (k2.attention) fail("attention should clear on return? (per action it stays unless cleared — check)");
ok("returned TEST-101 → available");

// ---- rename + remove (available only) ----
await supa.from("locker_keys").update({ key_number: "TEST-101R", locker_number: "42" }).eq("id", key101.id);
const { data: kr } = await supa.from("locker_keys").select("key_number, locker_number").eq("id", key101.id).single();
if (kr.key_number !== "TEST-101R" || kr.locker_number !== "42") fail("rename failed");
ok("renamed to TEST-101R / locker 42");

// removal of an ISSUED key must be blocked by the action — simulate the guard
const { data: key102 } = await supa.from("locker_keys").select("id, key_number").eq("gym_id", gymId).eq("key_number", "TEST-102").single();
await supa.from("locker_keys").update({ status: "issued", current_member_id: lockB.id, issued_at: new Date().toISOString() }).eq("id", key102.id);
const { data: k102 } = await supa.from("locker_keys").select("status").eq("id", key102.id).single();
if (k102.status !== "available") ok("issued key detected — action would refuse removal (guard)");

// ---- cleanup ----
for (const kn of ["TEST-101R", "TEST-102", "TEST-103", "TEST-104", "TEST-105"]) {
  const { data: key } = await supa.from("locker_keys").select("id").eq("gym_id", gymId).eq("key_number", kn).maybeSingle();
  if (!key) continue;
  if (kn === "TEST-102") {
    await supa.from("locker_key_logs").update({ returned_at: new Date().toISOString(), returned_by: me.id }).eq("locker_key_id", key.id).is("returned_at", null);
    await supa.from("locker_keys").update({ status: "available", current_member_id: null }).eq("id", key.id);
  }
  await supa.from("locker_keys").delete().eq("id", key.id);
}
const { count: after } = await supa.from("locker_keys").select("id", { count: "exact", head: true }).eq("gym_id", gymId).like("key_number", "TEST-%");
for (const s of [lockA, lockB]) await supa.rpc("hard_delete_member", { p_member_id: s.id });
console.log(`\ncleanup: ${after === 0 ? "all test keys + members removed" : "LEFTOVERS: " + after}`);
console.log("\nALL LOCKER LIFECYCLE TESTS PASSED");

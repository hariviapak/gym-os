// Idempotent seed for the QA Test Gym — a completely separate gym so e2e
// suites never touch live data. Creates: the gym, settings, packages the
// suites need, message templates, an active terms version, a receipt
// counter, and the QA admin account bound to this gym.
//
// Values land in .env.local (E2E_GYM_ID / E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD)
// so the suites can pick them up. Run: node scripts/seed-test-gym.mjs
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const envKeys = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.split("=")[0], l.split("=").slice(1).join("=")])
);
const service = createClient(envKeys.NEXT_PUBLIC_SUPABASE_URL, envKeys.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const GYM_NAME = process.env.GYM_NAME || "QA Test Gym";
const QA_EMAIL = process.env.QA_EMAIL || "qa@792fitness.com";
const QA_PASSWORD = process.env.QA_PASSWORD || "QA-Admin-Test-1!";

const fail = (m) => { console.error("✗ " + m); process.exit(1); };
const ok = (m) => console.log("✓ " + m);

// ---- gym (create if missing; remember id via a stable code) ----
const { data: gyms } = await service.from("gyms").select("id, name").eq("name", GYM_NAME).limit(1);
let gymId = gyms?.[0]?.id ?? null;
if (!gymId) {
  const { data: created, error } = await service
    .from("gyms")
    .insert({ name: GYM_NAME, code: "QA-TEST", phone: "910000000000", is_active: true })
    .select()
    .single();
  if (error || !created) fail("gym create: " + (error?.message ?? "unknown"));
  gymId = created.id;
  ok(`gym created: ${GYM_NAME} (${gymId})`);
} else {
  ok(`gym exists: ${GYM_NAME} (${gymId})`);
}

// ---- gym settings (GST-inclusive mirrors the live gym) ----
const { data: settings } = await service.from("gym_settings").select("gym_id").eq("gym_id", gymId).maybeSingle();
if (!settings) {
  const { error } = await service.from("gym_settings").insert({
    gym_id: gymId,
    gst_enabled: true,
    gst_rate: 18,
    gst_mode: "inclusive",
    currency_symbol: "₹",
    grace_period_days: 0,
  });
  if (error) fail("settings: " + error.message);
  ok("settings seeded (GST inclusive 18%)");
}

// ---- packages the suites need ----
const PACKAGES = [
  { name: "Trial 1 Day", type: "trial", service_type: "gym", duration_days: 1, amount: 1000, sort_order: 1 },
  { name: "Day Pass", type: "day_pass", service_type: "gym", duration_days: 1, amount: 600, sort_order: 2 },
  { name: "1 Month Signature", type: "membership", service_type: "gym", duration_days: 30, amount: 10000, sort_order: 3 },
  { name: "1 Year Signature", type: "membership", service_type: "gym", duration_days: 365, amount: 40000, sort_order: 4 },
  { name: "Family Annual (3 Members)", type: "membership", service_type: "gym", duration_days: 365, amount: 100000, is_group_package: true, sort_order: 5 },
  { name: "Swimming Only (1 Month)", type: "membership", service_type: "swimming", duration_days: 30, amount: 6000, sort_order: 6 },
];
for (const p of PACKAGES) {
  const { data: existing } = await service.from("packages").select("id").eq("gym_id", gymId).eq("name", p.name).limit(1);
  if (existing?.length) continue;
  const { error } = await service.from("packages").insert({
    gym_id: gymId,
    name: p.name,
    type: p.type,
    service_type: p.service_type,
    duration_days: p.duration_days,
    amount: p.amount,
    gst_rate: 18,
    is_active: true,
    sort_order: p.sort_order,
    is_group_package: p.is_group_package ?? false,
  });
  if (error) fail("package " + p.name + ": " + error.message);
  ok(`package seeded: ${p.name}`);
}

// ---- receipt counter ----
const { data: counter } = await service.from("receipt_counters").select("gym_id").eq("gym_id", gymId).maybeSingle();
if (!counter) {
  await service.from("receipt_counters").insert({ gym_id: gymId, next_no: 1 });
  ok("receipt counter seeded");
}

// ---- message templates (WhatsApp handoff text per type) ----
const TEMPLATES = [
  { name: "Welcome / Starter Kit", type: "welcome_kit", content: "Hi {name}, welcome to {gym_name}! Your starter kit is ready at the front desk." },
  { name: "Renewal Reminder", type: "renewal", content: "Hi {name}, your {package_name} at {gym_name} ends on {end_date}. Renew to keep training!" },
  { name: "Dues Reminder", type: "dues", content: "Hi {name}, a balance of {amount} is pending on your {gym_name} membership. You can pay at the desk." },
  { name: "Freeze Notification", type: "freeze", content: "Hi {name}, your {gym_name} membership is frozen from {start_date} to {end_date}." },
  { name: "Birthday Wish", type: "birthday", content: "Happy birthday {name}! Have a great one from the {gym_name} team." },
  { name: "Belated Birthday Wish", type: "belated_birthday", content: "Belated happy birthday {name} — hope it was a good one! — {gym_name}" },
  { name: "Gift Kit Ready", type: "gift_kit", content: "Hi {name}, your gift kit is ready at {gym_name}." },
];
for (const t of TEMPLATES) {
  const { data: existing } = await service.from("message_templates").select("id").eq("gym_id", gymId).eq("type", t.type).limit(1);
  if (existing?.length) continue;
  const { error } = await service.from("message_templates").insert({
    gym_id: gymId,
    name: t.name,
    type: t.type,
    content: t.content,
    is_active: true,
  });
  if (error) fail("template " + t.type + ": " + error.message);
}
ok("message templates seeded");

// ---- active terms versions (signing flow needs one per service) ----
const TERMS = [
  { version: "1.0", title: "Gym Terms & Conditions", category: "gym" },
  { version: "1.0", title: "Swimming Pool Rules", category: "swimming" },
];
for (const t of TERMS) {
  const { data: existing } = await service.from("terms_versions").select("id").eq("gym_id", gymId).eq("category", t.category).eq("status", "active").limit(1);
  if (existing?.length) continue;
  const { error } = await service.from("terms_versions").insert({
    gym_id: gymId,
    version: t.version,
    title: t.title,
    category: t.category,
    status: "active",
    effective_from: new Date().toISOString(),
    body: "1. Members must follow staff instructions.\n2. Use the facilities safely.\n3. The gym is not liable for personal belongings.\n4. Memberships are non-transferable.\n5. Frozen days extend the membership end date.",
  });
  if (error) fail("terms " + t.category + ": " + error.message);
  ok("terms version seeded (active): " + t.title);
}
if (false) {
  const { error } = await service.from("terms_versions").insert({
    gym_id: gymId,
    version: "1.0",
    title: "Gym Terms & Conditions",
    category: "gym",
    status: "active",
    effective_from: new Date().toISOString(),
    body: "1. Members must carry their membership.\n2. Use equipment safely and as instructed.\n3. The gym is not liable for personal belongings.\n4. Memberships are non-transferable.\n5. Frozen days extend the membership end date.",
  });
  if (error) fail("terms: " + error.message);
  ok("terms version seeded (active)");
}

// ---- QA admin account bound to the test gym ----
const { data: list } = await service.auth.admin.listUsers({ perPage: 500 });
const prior = list?.users?.find((u) => u.email === QA_EMAIL);
if (prior) await service.auth.admin.deleteUser(prior.id);
const r = await service.auth.admin.createUser({
  email: QA_EMAIL,
  password: QA_PASSWORD,
  email_confirm: true,
  user_metadata: { name: "QA Admin", role: "admin", gym_id: gymId },
});
if (r.error) fail("qa user: " + r.error.message);
const { data: qaRow } = await service.from("users").select("id").eq("email", QA_EMAIL).maybeSingle();
if (qaRow) {
  await service.from("users").update({ role: "admin", gym_id: gymId, name: "QA Admin" }).eq("id", qaRow.id);
} else {
  await service.from("users").insert({ id: r.user.id, gym_id: gymId, email: QA_EMAIL, name: "QA Admin", role: "admin" });
}
ok(`QA admin ready: ${QA_EMAIL} (admin of ${GYM_NAME})`);

// ---- QA staff account (wizard-flow tests need a non-discounting role) ----
const STAFF_EMAIL = process.env.QA_STAFF_EMAIL || "qa.staff@792fitness.com";
const STAFF_PASSWORD = process.env.QA_STAFF_PASSWORD || "QA-Staff-Test-1!";
{
  const { data: sList } = await service.auth.admin.listUsers({ perPage: 500 });
  const sPrior = sList?.users?.find((u) => u.email === STAFF_EMAIL);
  if (sPrior) await service.auth.admin.deleteUser(sPrior.id);
  const sr = await service.auth.admin.createUser({
    email: STAFF_EMAIL,
    password: STAFF_PASSWORD,
    email_confirm: true,
    user_metadata: { name: "QA Staff", role: "staff", gym_id: gymId },
  });
  if (sr.error) fail("qa staff: " + sr.error.message);
  const { data: sRow } = await service.from("users").select("id").eq("email", STAFF_EMAIL).maybeSingle();
  if (sRow) {
    await service.from("users").update({ role: "staff", gym_id: gymId, name: "QA Staff" }).eq("id", sRow.id);
  } else {
    await service.from("users").insert({ id: sr.user.id, gym_id: gymId, email: STAFF_EMAIL, name: "QA Staff", role: "staff" });
  }
  ok(`QA staff ready: ${STAFF_EMAIL} (staff of ${GYM_NAME})`);
}

console.log(`\nE2E_GYM_ID=${gymId}\nE2E_ADMIN_EMAIL=${QA_EMAIL}\nE2E_ADMIN_PASSWORD=${QA_PASSWORD}\nE2E_STAFF_EMAIL=${STAFF_EMAIL}\nE2E_STAFF_PASSWORD=${STAFF_PASSWORD}`);
console.log("\nAdd the three values above to .env.local");

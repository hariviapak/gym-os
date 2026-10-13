// Shared test-env access. Admin credentials live in .env.local (gitignored)
// — NEVER hardcoded in scripts: this repo is public.
import { readFileSync } from "fs";

export const envKeys = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => [l.split("=")[0], l.split("=").slice(1).join("=")])
);

export function adminPassword() {
  const p = envKeys.ADMIN_PASSWORD;
  if (!p) {
    console.error("Set ADMIN_PASSWORD in .env.local (gitignored — never in the repo)");
    process.exit(1);
  }
  return p;
}

// ---- e2e identity: the QA admin of the QA TEST GYM — never the live gym ----
export const TEST_GYM_ID = (() => {
  const id = envKeys.E2E_GYM_ID;
  if (!id) {
    console.error("Set E2E_GYM_ID in .env.local (run scripts/seed-test-gym.mjs first)");
    process.exit(1);
  }
  return id;
})();

export function e2eAdmin() {
  const email = envKeys.E2E_ADMIN_EMAIL;
  const password = envKeys.E2E_ADMIN_PASSWORD;
  if (!email || !password) {
    console.error("Set E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD in .env.local (seed via scripts/seed-test-gym.mjs)");
    process.exit(1);
  }
  return { email, password };
}

export function e2eStaff() {
  const email = envKeys.E2E_STAFF_EMAIL;
  const password = envKeys.E2E_STAFF_PASSWORD;
  if (!email || !password) {
    console.error("Set E2E_STAFF_EMAIL / E2E_STAFF_PASSWORD in .env.local (seed via scripts/seed-test-gym.mjs)");
    process.exit(1);
  }
  return { email, password };
}

// Sweep the test gym's audit rows so crashed/finished runs leave no residue.
// Uses the service key internally — audit_logs has no DELETE policy for gym
// roles (RLS would silently no-op) — and is hard-scoped to the test gym:
// the live gym can never be touched.
export async function sweepAuditLogs(_db) {
  const { createClient } = await import("@supabase/supabase-js");
  const service = createClient(envKeys.NEXT_PUBLIC_SUPABASE_URL, envKeys.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });
  const { error } = await service.from("audit_logs").delete().eq("gym_id", TEST_GYM_ID);
  if (error) console.error("[sweepAuditLogs]", error.message);
}

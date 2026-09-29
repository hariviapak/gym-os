"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logAudit } from "@/lib/actions/audit";

async function requireStaff() {
  const supabase = await createClient();
  // local JWT verify — auth.getUser() costs a network round trip on every
  // action; the session cookie is already signed and data stays RLS-guarded
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, id, role")
    .eq("id", user!.id)
    .single();
  if (!userData || !["owner", "admin", "manager"].includes(userData.role)) {
    redirect("/dashboard?error=" + encodeURIComponent("Not allowed to manage locker keys"));
  }
  return { supabase, gymId: userData.gym_id, userId: userData.id };
}

// Actions called programmatically from the lockers page set __local: they get
// a plain result back (no redirect) so the page can patch its state instantly
// instead of reloading. Form callers (member profile) keep redirect behavior.
export interface LockerActionResult {
  ok: boolean;
  error?: string;
}

// Where to land after an action (locker page by default; member profile passes
// its own URL so the staff flow stays where they are)
function redirectTo(formData: FormData | undefined, fallback: string) {
  const to = (formData?.get("redirect_to") as string) || fallback;
  redirect(to);
}

// Issue an available key to a member
export async function issueLockerKey(lockerKeyId: string, formData?: FormData): Promise<LockerActionResult | void> {
  const { supabase, gymId, userId } = await requireStaff();
  const memberId = formData?.get("member_id") as string | null;
  const local = !!formData?.get("__local");
  if (!memberId) return fail("Pick a member first", local);

  // atomic conditional update with RETURNING — one round trip instead of
  // select-then-update, and it can never double-issue
  const { data: key, error } = await supabase
    .from("locker_keys")
    .update({ status: "issued", current_member_id: memberId, issued_at: new Date().toISOString() })
    .eq("id", lockerKeyId)
    .eq("gym_id", gymId)
    .eq("status", "available")
    .select("id, key_number")
    .single();

  if (error || !key) return fail("Key not found or not available", local);

  // history + audit in parallel — both single inserts
  await Promise.all([
    supabase.from("locker_key_logs").insert({
      gym_id: gymId,
      locker_key_id: lockerKeyId,
      member_id: memberId,
      key_number: key.key_number,
      issued_by: userId,
    }),
    logAudit(
      {
        action: "locker_key.issued",
        entity_type: "locker_keys",
        entity_id: lockerKeyId,
        changes: { key: key.key_number, member_id: memberId },
      },
      { gymId, userId }
    ),
  ]);

  revalidatePath("/dashboard/locker-keys");
  revalidatePath("/dashboard");
  if (local) return { ok: true };
  redirectTo(formData, "/dashboard/locker-keys");
}

function fail(message: string, local: boolean): LockerActionResult | never {
  if (local) return { ok: false, error: message };
  redirect("/dashboard/locker-keys?error=" + encodeURIComponent(message));
}

// Return an issued key (closes the open history row, clears attention)
export async function returnLockerKey(lockerKeyId: string, formData?: FormData): Promise<LockerActionResult | void> {
  const { supabase, gymId, userId } = await requireStaff();
  const local = !!formData?.get("__local");

  // one atomic conditional update with RETURNING — no double return possible
  const { data: key, error } = await supabase
    .from("locker_keys")
    .update({ status: "available", current_member_id: null, issued_at: null, attention: false })
    .eq("id", lockerKeyId)
    .eq("gym_id", gymId)
    .eq("status", "issued")
    .select("id, key_number")
    .single();

  if (error || !key) return fail("Key not found or not issued", local);

  const now = new Date().toISOString();
  await Promise.all([
    supabase
      .from("locker_key_logs")
      .update({ returned_at: now, returned_by: userId })
      .eq("locker_key_id", lockerKeyId)
      .is("returned_at", null),
    logAudit(
      { action: "locker_key.returned", entity_type: "locker_keys", entity_id: lockerKeyId, changes: { key: key.key_number } },
      { gymId, userId }
    ),
  ]);

  revalidatePath("/dashboard/locker-keys");
  revalidatePath("/dashboard");
  if (local) return { ok: true };
  redirectTo(formData, "/dashboard/locker-keys");
}

// Transfer an issued key to a different member (return + issue, both logged)
export async function transferLockerKey(lockerKeyId: string, formData?: FormData): Promise<LockerActionResult | void> {
  const { supabase, gymId, userId } = await requireStaff();
  const newMemberId = formData?.get("member_id") as string | null;
  const local = !!formData?.get("__local");
  if (!newMemberId) return fail("Pick a member first", local);

  const now = new Date().toISOString();
  // atomic conditional update with RETURNING — only succeeds while issued
  const { data: key, error } = await supabase
    .from("locker_keys")
    .update({ current_member_id: newMemberId, issued_at: now })
    .eq("id", lockerKeyId)
    .eq("gym_id", gymId)
    .eq("status", "issued")
    .select("id, key_number, current_member_id")
    .single();

  if (error || !key) return fail("Key not found or not issued", local);
  if (key.current_member_id === newMemberId) return fail("Key is already with that member", local);

  await Promise.all([
    // close the previous holder's log row + open the new one, in parallel
    supabase
      .from("locker_key_logs")
      .update({ returned_at: now, returned_by: userId, notes: "Transferred" })
      .eq("locker_key_id", lockerKeyId)
      .is("returned_at", null),
    supabase.from("locker_key_logs").insert({
      gym_id: gymId,
      locker_key_id: lockerKeyId,
      member_id: newMemberId,
      key_number: key.key_number,
      issued_by: userId,
      notes: "Received via transfer",
    }),
    logAudit(
      {
        action: "locker_key.transferred",
        entity_type: "locker_keys",
        entity_id: lockerKeyId,
        changes: { key: key.key_number, to_member_id: newMemberId },
      },
      { gymId, userId }
    ),
  ]);

  revalidatePath("/dashboard/locker-keys");
  revalidatePath("/dashboard");
  if (local) return { ok: true };
  redirectTo(formData, "/dashboard/locker-keys");
}

// Manual attention flag (no automatic rules by design)
export async function setLockerKeyAttention(
  lockerKeyId: string,
  attention: boolean,
  formData?: FormData
): Promise<LockerActionResult | void> {
  const { supabase, gymId, userId } = await requireStaff();
  const local = !!formData?.get("__local");

  const { error } = await supabase
    .from("locker_keys")
    .update({ attention })
    .eq("id", lockerKeyId)
    .eq("gym_id", gymId);

  if (error) return fail(error.message, local);

  await logAudit(
    {
      action: attention ? "locker_key.flagged" : "locker_key.attention_cleared",
      entity_type: "locker_keys",
      entity_id: lockerKeyId,
      changes: { attention },
    },
    { gymId, userId }
  );

  revalidatePath("/dashboard/locker-keys");
  revalidatePath("/dashboard");
  if (local) return { ok: true };
  redirectTo(formData, "/dashboard/locker-keys");
}

// Bulk-create the configurable inventory (e.g. K-001..K-030 / lockers 01..30)
export async function addLockerKeysBulk(formData: FormData) {
  const { supabase, gymId, userId } = await requireStaff();
  const count = Math.min(500, Math.max(1, parseInt(formData.get("count") as string) || 0));
  const keyPrefix = ((formData.get("key_prefix") as string) || "K").trim() || "K";
  const startNumber = Math.max(1, parseInt(formData.get("start_number") as string) || 1);
  const lockersSameAsKeys = formData.get("lockers_same") !== "no";

  const rows = Array.from({ length: count }, (_, i) => {
    const n = startNumber + i;
    return {
      gym_id: gymId,
      key_number: `${keyPrefix}-${String(n).padStart(3, "0")}`,
      locker_number: lockersSameAsKeys ? String(n).padStart(2, "0") : null,
      status: "available" as const,
    };
  });

  const { error } = await supabase.from("locker_keys").insert(rows);

  if (error) {
    const friendly = error.message.includes("duplicate")
      ? "Some key numbers already exist — use a different prefix or starting number"
      : error.message;
    redirect("/dashboard/locker-keys?error=" + encodeURIComponent(friendly));
  }

  await logAudit(
    { action: "locker_keys.bulk_created", entity_type: "locker_keys", changes: { count, key_prefix: keyPrefix, start_number: startNumber } },
    { gymId, userId }
  ).catch(() => {});

  revalidatePath("/dashboard/locker-keys");
  revalidatePath("/dashboard");
  redirect("/dashboard/locker-keys");
}

// Add a single key
export async function addLockerKey(formData: FormData) {
  const { supabase, gymId } = await requireStaff();
  const keyNumber = ((formData.get("key_number") as string) || "").trim();
  const lockerNumber = ((formData.get("locker_number") as string) || "").trim() || null;

  if (!keyNumber) {
    redirect("/dashboard/locker-keys?error=" + encodeURIComponent("Key number is required"));
  }

  const { error } = await supabase.from("locker_keys").insert({
    gym_id: gymId,
    key_number: keyNumber,
    locker_number: lockerNumber,
    status: "available",
  });

  if (error) {
    const friendly = error.message.includes("duplicate")
      ? `Key "${keyNumber}" already exists`
      : error.message;
    redirect("/dashboard/locker-keys?error=" + encodeURIComponent(friendly));
  }

  revalidatePath("/dashboard/locker-keys");
  redirect("/dashboard/locker-keys");
}

// Rename / retag a key
export async function renameLockerKey(lockerKeyId: string, formData: FormData) {
  const { supabase, gymId } = await requireStaff();
  const keyNumber = ((formData.get("key_number") as string) || "").trim();
  const lockerNumber = ((formData.get("locker_number") as string) || "").trim() || null;

  if (!keyNumber) {
    redirect("/dashboard/locker-keys?error=" + encodeURIComponent("Key number is required"));
  }

  const { error } = await supabase
    .from("locker_keys")
    .update({ key_number: keyNumber, locker_number: lockerNumber })
    .eq("id", lockerKeyId)
    .eq("gym_id", gymId);

  if (error) {
    const friendly = error.message.includes("duplicate")
      ? `Key "${keyNumber}" already exists`
      : error.message;
    redirect("/dashboard/locker-keys?error=" + encodeURIComponent(friendly));
  }

  revalidatePath("/dashboard/locker-keys");
  redirect("/dashboard/locker-keys");
}

// Remove a key (only when available; issued keys must be returned first).
// History survives — logs keep their own key_number copy.
export async function removeLockerKey(lockerKeyId: string, formData?: FormData) {
  const { supabase, gymId, userId } = await requireStaff();

  const { data: key } = await supabase
    .from("locker_keys")
    .select("id, key_number, status")
    .eq("id", lockerKeyId)
    .eq("gym_id", gymId)
    .single();

  if (!key) redirect("/dashboard/locker-keys?error=" + encodeURIComponent("Key not found"));
  if (key.status !== "available") {
    redirect("/dashboard/locker-keys?error=" + encodeURIComponent(`Return key ${key.key_number} before removing it`));
  }

  const { error } = await supabase.from("locker_keys").delete().eq("id", lockerKeyId).eq("gym_id", gymId);
  if (error) {
    redirect("/dashboard/locker-keys?error=" + encodeURIComponent(error.message));
  }

  await logAudit(
    { action: "locker_key.removed", entity_type: "locker_keys", entity_id: lockerKeyId, changes: { key: key.key_number } },
    { gymId, userId }
  ).catch(() => {});

  revalidatePath("/dashboard/locker-keys");
  revalidatePath("/dashboard");
  redirect("/dashboard/locker-keys");
}

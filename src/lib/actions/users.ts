"use server";

import { createClient } from "@/lib/supabase/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
import { redirect } from "next/navigation";
import { logAudit } from "@/lib/actions/audit";
import type { StaffRole } from "@/lib/types/database";

export async function createUser(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, role")
    .eq("id", user!.id)
    .single();

  if (!["owner", "admin"].includes(userData!.role)) {
    redirect("/dashboard/users");
  }

  const gymId = userData!.gym_id;
  const name = formData.get("name") as string;
  const email = (formData.get("email") as string).toLowerCase().trim();
  const phone = (formData.get("phone") as string) || null;
  const role = formData.get("role") as StaffRole;
  const password = formData.get("password") as string;

  if (!name || !email || !password || !role) {
    redirect("/dashboard/users?error=Missing+required+fields");
  }

  if (password.length < 6) {
    redirect("/dashboard/users?error=Password+must+be+at+least+6+characters");
  }

  // Auth account via the service-role admin API. The on_auth_user_created
  // trigger (search_path pinned — see migration 013) creates the
  // public.users profile automatically; phone/gym get filled in below.
  const adminClient = createAdminClient();

  const { data: authUser, error: authError } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name, role },
  });

  if (authError) {
    redirect("/dashboard/users?error=" + encodeURIComponent(authError.message));
  }

  const { error: dbError } = await supabase
    .from("users")
    .update({ gym_id: gymId, phone, is_active: true })
    .eq("id", authUser.user.id);

  if (dbError) {
    await adminClient.auth.admin.deleteUser(authUser.user.id);
    redirect("/dashboard/users?error=" + encodeURIComponent(dbError.message));
  }

  await logAudit({
    action: "user.created",
    entity_type: "users",
    entity_id: authUser.user.id,
    changes: { name, email, role },
  });

  revalidatePath("/dashboard/users");
  redirect("/dashboard/users");
}

export async function updateUserRole(userId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, role")
    .eq("id", user!.id)
    .single();

  if (!["owner", "admin"].includes(userData!.role)) {
    redirect("/dashboard/users");
  }

  if (userId === user!.id) {
    redirect("/dashboard/users?error=Cannot+change+your+own+role");
  }

  const role = formData.get("role") as StaffRole;

  await supabase
    .from("users")
    .update({ role })
    .eq("id", userId)
    .eq("gym_id", userData!.gym_id);

  await logAudit({
    action: "user.role_changed",
    entity_type: "users",
    entity_id: userId,
    changes: { role },
  });

  revalidatePath("/dashboard/users");
  redirect("/dashboard/users");
}

export async function toggleUserActive(userId: string, isActive: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, role")
    .eq("id", user!.id)
    .single();

  if (!["owner", "admin"].includes(userData!.role)) {
    redirect("/dashboard/users");
  }

  if (userId === user!.id) {
    redirect("/dashboard/users?error=Cannot+deactivate+yourself");
  }

  await supabase
    .from("users")
    .update({ is_active: isActive })
    .eq("id", userId)
    .eq("gym_id", userData!.gym_id);

  await logAudit({
    action: isActive ? "user.activated" : "user.deactivated",
    entity_type: "users",
    entity_id: userId,
  });

  revalidatePath("/dashboard/users");
}

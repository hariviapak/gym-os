"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logAudit } from "@/lib/actions/audit";

export async function updateGymSettings(formData: FormData) {
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
    redirect("/dashboard/settings");
  }

  await supabase
    .from("gym_settings")
    .update({
      grace_period_days: parseInt(formData.get("grace_period_days") as string) || 0,
      gst_rate: parseFloat(formData.get("gst_rate") as string) || 18,
      gst_mode: (formData.get("gst_mode") as string) || "inclusive",
      receipt_prefix: (formData.get("receipt_prefix") as string) || "RCT",
    })
    .eq("gym_id", userData!.gym_id);

  revalidatePath("/dashboard/settings");
  redirect("/dashboard/settings");
}

export async function updateGym(formData: FormData) {
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
    redirect("/dashboard/settings");
  }

  const { error } = await supabase
    .from("gyms")
    .update({
      name: formData.get("name") as string,
      address: (formData.get("address") as string) || null,
      phone: (formData.get("phone") as string) || null,
      email: (formData.get("email") as string) || null,
      gstin: (formData.get("gstin") as string) || null,
      digital_kit_url: (formData.get("digital_kit_url") as string) || null,
    })
    .eq("id", userData!.gym_id);

  if (error) {
    redirect("/dashboard/settings?error=" + encodeURIComponent(error.message));
  }

  await logAudit({
    action: "gym.profile_updated",
    entity_type: "gyms",
    entity_id: userData!.gym_id,
  });

  revalidatePath("/dashboard/settings");
  revalidatePath("/dashboard");
  redirect("/dashboard/settings");
}

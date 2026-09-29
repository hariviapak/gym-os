"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function markGiftKitDelivered(giftKitId: string, memberId: string, _formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, id")
    .eq("id", user!.id)
    .single();

  const gymId = userData!.gym_id;

  const { data: settings } = await supabase
    .from("gym_settings")
    .select("digital_content_url")
    .eq("gym_id", gymId)
    .single();

  await supabase
    .from("gift_kit_tasks")
    .update({
      status: "delivered",
      delivered_at: new Date().toISOString(),
      digital_content_url: settings?.digital_content_url || null,
      delivered_by_method: "staff_handover",
    })
    .eq("id", giftKitId)
    .eq("gym_id", gymId);

  await supabase.from("member_events").insert({
    gym_id: gymId,
    member_id: memberId,
    event_type: "gift_kit_delivered",
    title: "Gift kit delivered",
    description: settings?.digital_content_url
      ? `Digital content: ${settings.digital_content_url}`
      : undefined,
    created_by: userData!.id,
  });

  revalidatePath(`/dashboard/members/${memberId}`);
  redirect(`/dashboard/members/${memberId}`);
}

export async function assignGiftKit(giftKitId: string, memberId: string, formData: FormData) {
  const supabase = await createClient();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, id")
    .eq("id", (await supabase.auth.getUser()).data.user!.id)
    .single();

  const assignedTo = (formData.get("assigned_to") as string) || null;

  await supabase
    .from("gift_kit_tasks")
    .update({
      assigned_to: assignedTo,
      assigned_at: assignedTo ? new Date().toISOString() : null,
      status: assignedTo ? "assigned" : "pending",
    })
    .eq("id", giftKitId)
    .eq("gym_id", userData!.gym_id);

  revalidatePath(`/dashboard/members/${memberId}`);
  redirect(`/dashboard/members/${memberId}`);
}

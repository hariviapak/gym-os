"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function logContact(memberId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, id")
    .eq("id", user!.id)
    .single();

  const method = (formData.get("method") as string) || "whatsapp";
  const note = (formData.get("note") as string) || "";
  const redirectTo = (formData.get("redirect_to") as string) || `/dashboard/members/${memberId}`;

  const titles: Record<string, string> = {
    call: "Phone call logged",
    whatsapp: "WhatsApp message logged",
    visit: "In-person visit logged",
    "in-person": "In-person visit logged",
  };

  await supabase.from("member_events").insert({
    gym_id: userData!.gym_id,
    member_id: memberId,
    event_type: "contact",
    title: titles[method] ?? "Contact logged",
    description: note || undefined,
    metadata: { method },
    created_by: userData!.id,
  });

  revalidatePath(`/dashboard/members/${memberId}`);
  revalidatePath("/dashboard");
  redirect(redirectTo);
}

export async function logWhatsAppSent(
  memberId: string,
  templateType: string,
  formData: FormData
) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, id")
    .eq("id", user!.id)
    .single();

  const redirectTo = (formData.get("redirect_to") as string) || `/dashboard/members/${memberId}`;

  await supabase.from("member_events").insert({
    gym_id: userData!.gym_id,
    member_id: memberId,
    event_type: "contact",
    title: `WhatsApp sent: ${templateType}`,
    description: `Template type: ${templateType}`,
    metadata: { method: "whatsapp", template_type: templateType },
    created_by: userData!.id,
  });

  // If this was a welcome_kit template, mark digital_sent_at on the gift kit task
  if (templateType === "welcome_kit" || templateType === "gift_kit") {
    const { data: giftKit } = await supabase
      .from("gift_kit_tasks")
      .select("id")
      .eq("member_id", memberId)
      .eq("gym_id", userData!.gym_id)
      .is("digital_sent_at", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (giftKit) {
      await supabase
        .from("gift_kit_tasks")
        .update({
          digital_sent_at: new Date().toISOString(),
          digital_sent_by: userData!.id,
        })
        .eq("id", giftKit.id);
    }
  }

  revalidatePath(`/dashboard/members/${memberId}`);
  revalidatePath("/dashboard");
  redirect(redirectTo);
}

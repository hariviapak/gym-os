"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logAudit } from "@/lib/actions/audit";

export async function createTemplate(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, id, role")
    .eq("id", user!.id)
    .single();

  if (!["owner", "admin", "manager"].includes(userData!.role)) {
    redirect("/dashboard/settings");
  }

  const name = formData.get("name") as string;
  const type = formData.get("type") as string;
  const content = formData.get("content") as string;

  if (!name?.trim() || !content?.trim()) {
    redirect("/dashboard/settings?error=" + encodeURIComponent("Name and content are required"));
  }

  const { data, error } = await supabase
    .from("message_templates")
    .insert({
      gym_id: userData!.gym_id,
      name: name.trim(),
      type: type || "custom",
      content: content.trim(),
      is_active: true,
      created_by: userData!.id,
    })
    .select()
    .single();

  if (error) {
    redirect("/dashboard/settings?error=" + encodeURIComponent(error.message));
  }

  await logAudit({
    action: "template.created",
    entity_type: "message_templates",
    entity_id: data.id,
    changes: { name: name.trim(), type },
  });

  revalidatePath("/dashboard/settings");
  redirect("/dashboard/settings");
}

export async function updateTemplate(id: string, formData: FormData) {
  const supabase = await createClient();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, role")
    .eq("id", (await supabase.auth.getUser()).data.user!.id)
    .single();

  if (!["owner", "admin", "manager"].includes(userData!.role)) {
    redirect("/dashboard/settings");
  }

  await supabase
    .from("message_templates")
    .update({
      name: (formData.get("name") as string)?.trim(),
      content: (formData.get("content") as string)?.trim(),
      is_active: formData.get("is_active") === "on",
    })
    .eq("id", id)
    .eq("gym_id", userData!.gym_id);

  await logAudit({
    action: "template.updated",
    entity_type: "message_templates",
    entity_id: id,
  });

  revalidatePath("/dashboard/settings");
  redirect("/dashboard/settings");
}

export async function deleteTemplate(id: string) {
  const supabase = await createClient();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, role")
    .eq("id", (await supabase.auth.getUser()).data.user!.id)
    .single();

  if (!["owner", "admin", "manager"].includes(userData!.role)) {
    redirect("/dashboard/settings");
  }

  await supabase
    .from("message_templates")
    .delete()
    .eq("id", id)
    .eq("gym_id", userData!.gym_id);

  await logAudit({
    action: "template.deleted",
    entity_type: "message_templates",
    entity_id: id,
  });

  revalidatePath("/dashboard/settings");
  redirect("/dashboard/settings");
}

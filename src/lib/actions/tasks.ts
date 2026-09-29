"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logAudit } from "@/lib/actions/audit";

export async function createTask(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, id")
    .eq("id", user!.id)
    .single();

  const title = formData.get("title") as string;
  if (!title?.trim()) {
    redirect("/dashboard/tasks?error=" + encodeURIComponent("Title is required"));
  }

  const { data, error } = await supabase
    .from("gym_tasks")
    .insert({
      gym_id: userData!.gym_id,
      title: title.trim(),
      description: (formData.get("description") as string) || null,
      type: (formData.get("type") as string) || "custom",
      priority: (formData.get("priority") as string) || "medium",
      assigned_to: (formData.get("assigned_to") as string) || null,
      due_date: (formData.get("due_date") as string) || null,
      created_by: userData!.id,
    })
    .select()
    .single();

  if (error) {
    redirect("/dashboard/tasks?error=" + encodeURIComponent(error.message));
  }

  await logAudit({
    action: "task.created",
    entity_type: "gym_tasks",
    entity_id: data.id,
    changes: { title: title.trim() },
  });

  revalidatePath("/dashboard/tasks");
  revalidatePath("/dashboard");
  redirect("/dashboard/tasks");
}

export async function completeTask(id: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, id")
    .eq("id", user!.id)
    .single();

  const notes = (formData.get("notes") as string) || null;

  const { error } = await supabase
    .from("gym_tasks")
    .update({
      status: "done",
      completed_at: new Date().toISOString(),
      completed_by: userData!.id,
      notes: notes,
    })
    .eq("id", id)
    .eq("gym_id", userData!.gym_id);

  if (!error) {
    await logAudit({
      action: "task.completed",
      entity_type: "gym_tasks",
      entity_id: id,
    });
  }

  revalidatePath("/dashboard/tasks");
  revalidatePath("/dashboard");
  redirect("/dashboard/tasks");
}

export async function deleteTask(id: string) {
  const supabase = await createClient();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id")
    .eq("id", (await supabase.auth.getUser()).data.user!.id)
    .single();

  await supabase
    .from("gym_tasks")
    .delete()
    .eq("id", id)
    .eq("gym_id", userData!.gym_id);

  await logAudit({
    action: "task.deleted",
    entity_type: "gym_tasks",
    entity_id: id,
  });

  revalidatePath("/dashboard/tasks");
  revalidatePath("/dashboard");
  redirect("/dashboard/tasks");
}

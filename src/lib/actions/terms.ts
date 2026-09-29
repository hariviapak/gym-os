"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createTermsVersion(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, id, role")
    .eq("id", user!.id)
    .single();

  if (!["owner", "admin"].includes(userData!.role)) {
    redirect("/dashboard/terms");
  }

  await supabase.from("terms_versions").insert({
    gym_id: userData!.gym_id,
    version: formData.get("version") as string,
    title: formData.get("title") as string,
    body: formData.get("body") as string,
    category: (formData.get("category") as string) || "gym",
    status: "draft",
    created_by: userData!.id,
  });

  revalidatePath("/dashboard/terms");
  redirect("/dashboard/terms");
}

export async function activateTermsVersion(versionId: string) {
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
    redirect("/dashboard/terms");
  }

  const { data: newVersion } = await supabase
    .from("terms_versions")
    .select("category")
    .eq("id", versionId)
    .single();

  const category = newVersion?.category || "gym";

  await supabase
    .from("terms_versions")
    .update({ status: "retired" })
    .eq("gym_id", userData!.gym_id)
    .eq("status", "active")
    .eq("category", category);

  await supabase
    .from("terms_versions")
    .update({ status: "active", effective_from: new Date().toISOString() })
    .eq("id", versionId)
    .eq("gym_id", userData!.gym_id);

  revalidatePath("/dashboard/terms");
  redirect("/dashboard/terms");
}

export async function updateTermsVersion(versionId: string, formData: FormData) {
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
    redirect("/dashboard/terms");
  }

  await supabase
    .from("terms_versions")
    .update({
      title: formData.get("title") as string,
      body: formData.get("body") as string,
    })
    .eq("id", versionId)
    .eq("gym_id", userData!.gym_id);

  revalidatePath("/dashboard/terms");
  redirect("/dashboard/terms");
}

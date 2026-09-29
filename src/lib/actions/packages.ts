"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export async function createPackage(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, role")
    .eq("id", user!.id)
    .single();

  if (!["owner", "admin", "manager"].includes(userData!.role)) {
    redirect("/dashboard/packages");
  }

  const { error } = await supabase.from("packages").insert({
    gym_id: userData!.gym_id,
    name: formData.get("name") as string,
    type: formData.get("type") as string,
    service_type: (formData.get("service_type") as string) || "gym",
    is_group_package: formData.get("is_group_package") === "yes",
    duration_days: parseInt(formData.get("duration_days") as string),
    amount: parseFloat(formData.get("amount") as string),
    gst_rate: parseFloat(formData.get("gst_rate") as string) || 18,
    description: (formData.get("description") as string) || null,
    digital_kit_url: (formData.get("digital_kit_url") as string) || null,
  });

  if (error) {
    redirect("/dashboard/packages?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/dashboard/packages");
  redirect("/dashboard/packages");
}

export async function togglePackageActive(packageId: string, active: boolean) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, role")
    .eq("id", user!.id)
    .single();

  if (!["owner", "admin", "manager"].includes(userData!.role)) {
    redirect("/dashboard/packages");
  }

  await supabase
    .from("packages")
    .update({ is_active: active })
    .eq("id", packageId)
    .eq("gym_id", userData!.gym_id);

  revalidatePath("/dashboard/packages");
}

export async function deletePackage(packageId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, role")
    .eq("id", user!.id)
    .single();

  if (!["owner", "admin", "manager"].includes(userData!.role)) {
    redirect("/dashboard/packages");
  }

  await supabase
    .from("packages")
    .update({ is_active: false })
    .eq("id", packageId)
    .eq("gym_id", userData!.gym_id);

  revalidatePath("/dashboard/packages");
}

export async function updatePackage(packageId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, role")
    .eq("id", user!.id)
    .single();

  if (!["owner", "admin", "manager"].includes(userData!.role)) {
    redirect("/dashboard/packages");
  }

  const { error } = await supabase
    .from("packages")
    .update({
      name: formData.get("name") as string,
      type: formData.get("type") as string,
      service_type: (formData.get("service_type") as string) || "gym",
      is_group_package: formData.get("is_group_package") === "yes",
      duration_days: parseInt(formData.get("duration_days") as string),
      amount: parseFloat(formData.get("amount") as string),
      gst_rate: parseFloat(formData.get("gst_rate") as string) || 18,
      description: (formData.get("description") as string) || null,
      digital_kit_url: (formData.get("digital_kit_url") as string) || null,
    })
    .eq("id", packageId)
    .eq("gym_id", userData!.gym_id);

  if (error) {
    redirect("/dashboard/packages?error=" + encodeURIComponent(error.message));
  }

  revalidatePath("/dashboard/packages");
  redirect("/dashboard/packages");
}

export async function movePackage(packageId: string, direction: "up" | "down") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, role")
    .eq("id", user!.id)
    .single();

  if (!["owner", "admin", "manager"].includes(userData!.role)) {
    redirect("/dashboard/packages");
  }

  const { data: packages } = await supabase
    .from("packages")
    .select("id, sort_order")
    .eq("gym_id", userData!.gym_id)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  if (!packages || packages.length < 2) return;

  const currentIndex = packages.findIndex((p) => p.id === packageId);
  if (currentIndex === -1) return;

  const swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
  if (swapIndex < 0 || swapIndex >= packages.length) return;

  const current = packages[currentIndex];
  const swap = packages[swapIndex];

  await Promise.all([
    supabase.from("packages").update({ sort_order: swap.sort_order }).eq("id", current.id),
    supabase.from("packages").update({ sort_order: current.sort_order }).eq("id", swap.id),
  ]);

  revalidatePath("/dashboard/packages");
}

"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { todayIST } from "@/lib/utils";
import { logAudit } from "@/lib/actions/audit";

export async function addExpense(formData: FormData) {
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
    redirect("/dashboard/expenses");
  }

  const { error } = await supabase.from("expenses").insert({
    gym_id: userData!.gym_id,
    category_id: (formData.get("category_id") as string) || null,
    title: formData.get("title") as string,
    description: (formData.get("description") as string) || null,
    amount: parseFloat(formData.get("amount") as string),
    expense_date: (formData.get("expense_date") as string) || todayIST(),
    created_by: userData!.id,
  });

  if (error) {
    redirect("/dashboard/expenses?error=" + encodeURIComponent(error.message));
  }

  await logAudit({
    action: "expense.created",
    entity_type: "expenses",
  });

  revalidatePath("/dashboard/expenses");
  redirect("/dashboard/expenses");
}

export async function deleteExpense(expenseId: string) {
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
    redirect("/dashboard/expenses");
  }

  await supabase
    .from("expenses")
    .delete()
    .eq("id", expenseId)
    .eq("gym_id", userData!.gym_id);

  await logAudit({
    action: "expense.deleted",
    entity_type: "expenses",
    entity_id: expenseId,
  });

  revalidatePath("/dashboard/expenses");
  redirect("/dashboard/expenses");
}

export async function updateExpense(expenseId: string, formData: FormData) {
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
    redirect("/dashboard/expenses");
  }

  const { error } = await supabase
    .from("expenses")
    .update({
      title: formData.get("title") as string,
      category_id: (formData.get("category_id") as string) || null,
      amount: parseFloat(formData.get("amount") as string),
      description: (formData.get("description") as string) || null,
      expense_date: (formData.get("expense_date") as string) || todayIST(),
    })
    .eq("id", expenseId)
    .eq("gym_id", userData!.gym_id);

  if (error) {
    redirect("/dashboard/expenses?error=" + encodeURIComponent(error.message));
  }

  await logAudit({
    action: "expense.updated",
    entity_type: "expenses",
    entity_id: expenseId,
  });

  revalidatePath("/dashboard/expenses");
  redirect("/dashboard/expenses");
}

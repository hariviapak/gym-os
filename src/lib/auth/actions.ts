"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";

export async function login(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const gymCode = (formData.get("gym_code") as string) || null;

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    const gymParam = gymCode ? `&gym=${gymCode}` : "";
    redirect(`/login?error=${encodeURIComponent(error.message)}${gymParam}`);
  }

  revalidatePath("/");
  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function signup(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;
  const name = formData.get("name") as string;

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { name },
    },
  });

  if (error) {
    redirect("/login?error=" + encodeURIComponent(error.message));
  }

  if (data.user) {
    redirect("/login?message=Account+created.+Ask+admin+to+assign+your+gym+and+role.");
  }

  redirect("/login");
}

export async function requestPasswordReset(formData: FormData) {
  const email = formData.get("email") as string;
  const gymCode = (formData.get("gym_code") as string) || null;
  const supabase = await createClient();
  const headersList = await headers();
  const origin = headersList.get("origin");

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password`,
  });

  const gymParam = gymCode ? `&gym=${gymCode}` : "";

  if (error) {
    redirect(`/forgot-password?error=${encodeURIComponent(error.message)}${gymParam}`);
  }

  redirect(`/forgot-password?message=${encodeURIComponent("Reset link sent! Check your email.")}${gymParam}`);
}

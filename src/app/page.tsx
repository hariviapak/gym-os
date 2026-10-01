import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();
// zero-network session read: the middleware already verified this session,
  // and RLS enforces all data access regardless of where it was checked
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;

  if (!user) {
    redirect("/login");
  }

  redirect("/dashboard");
}

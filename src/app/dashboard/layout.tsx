import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";
import { BottomNav } from "@/components/layout/bottom-nav";
import { UserProvider } from "@/components/layout/user-context";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
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

  const { data: userData } = await supabase
    .from("users")
    .select("*, gyms(name, logo_url)")
    .eq("id", user.id)
    .single();

  if (!userData || !userData.gym_id) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50">
        <div className="max-w-md rounded-xl bg-white p-8 text-center shadow-lg">
          <h1 className="text-xl font-bold text-zinc-900">Account Pending</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Your account has not been assigned to a gym yet. Please contact your
            administrator to complete setup.
          </p>
        </div>
      </div>
    );
  }

  const canSeeFinances = ["owner", "admin", "manager"].includes(userData.role);
  let pendingDuesCount = 0;
  if (canSeeFinances) {
    const { count } = await supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("gym_id", userData.gym_id)
      .eq("status", "active")
      .in("payment_status", ["partial", "pending"]);
    pendingDuesCount = count ?? 0;
  }

  return (
    <UserProvider role={userData.role}>
      <div className="flex min-h-screen bg-zinc-50">
        <Sidebar
          userName={userData.name}
          userRole={userData.role}
          gymName={userData.gyms?.name ?? "Gym"}
          gymLogoUrl={userData.gyms?.logo_url ?? null}
        />
        <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
          <Header userName={userData.name} userRole={userData.role} gymName={userData.gyms?.name ?? "Gym"} gymLogoUrl={userData.gyms?.logo_url ?? null} />
          <main className="min-w-0 flex-1 p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] lg:p-8 lg:pb-8">{children}</main>
        </div>
        <BottomNav role={userData.role} duesCount={pendingDuesCount} />
      </div>
    </UserProvider>
  );
}

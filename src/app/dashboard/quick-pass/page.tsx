import { createClient } from "@/lib/supabase/server";
import { MobilePageHeader } from "@/components/ui/mobile-page-header";
import { QuickPassForm } from "@/components/payments/quick-pass-form";

export default async function QuickPassPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
// zero-network session read: the middleware already verified this session,
  // and RLS enforces all data access regardless of where it was checked
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id")
    .eq("id", user!.id)
    .single();

  const gymId = userData!.gym_id;
  const params = await searchParams;

  const [{ data: packages }, { data: members }, { data: settings }] = await Promise.all([
    supabase
      .from("packages")
      .select("id, name, amount, type, duration_days, gst_rate")
      .eq("gym_id", gymId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("members")
      .select("id, first_name, last_name, phone")
      .eq("gym_id", gymId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("gym_settings").select("gst_mode").eq("gym_id", gymId).single(),
  ]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <MobilePageHeader title="Quick Pass" />
      <div>
        <h1 className="hidden text-2xl font-bold text-zinc-900 md:block">Quick Pass</h1>
        <p className="mt-0.5 hidden text-sm text-zinc-500 md:block">Fast walk-in day pass</p>
        <p className="mt-1 text-sm text-zinc-500">
          Fast day pass, trial, or walk-in enrollment — minimal fields, one screen
        </p>
      </div>

      {params.error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {params.error}
        </div>
      )}

      <QuickPassForm packages={packages ?? []} members={members ?? []} gstMode={settings?.gst_mode ?? "exclusive"} />
    </div>
  );
}

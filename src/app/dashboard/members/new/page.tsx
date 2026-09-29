import { createClient } from "@/lib/supabase/server";
import { EnrollmentWizard } from "@/components/members/enrollment-wizard";

export default async function NewMemberPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id")
    .eq("id", user!.id)
    .single();

  const gymId = userData!.gym_id;
  const params = await searchParams;

  const [{ data: packages }, { data: activeTerms }, { data: settings }, { data: recentMembers }] = await Promise.all([
    supabase
      .from("packages")
      .select("*")
      .eq("gym_id", gymId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true })
      .order("name", { ascending: true }),
    supabase
      .from("terms_versions")
      .select("*")
      .eq("gym_id", gymId)
      .eq("status", "active")
      .order("category", { ascending: true }),
    supabase.from("gym_settings").select("*").eq("gym_id", gymId).single(),
    supabase
      .from("members")
      .select("id, first_name, last_name, phone")
      .eq("gym_id", gymId)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(200),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">New Enrollment</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Create member → select package → record payment → accept T&C
        </p>
      </div>

      {params.error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {params.error}
        </div>
      )}

      <EnrollmentWizard
        packages={(packages ?? []).map((p: any) => ({
          id: p.id,
          name: p.name,
          amount: Number(p.amount),
          duration_days: p.duration_days,
          gst_rate: p.gst_rate,
          type: p.type,
          service_type: p.service_type,
          is_group_package: !!p.is_group_package,
        }))}
        members={(recentMembers ?? []).map((m: any) => ({
          id: m.id,
          first_name: m.first_name,
          last_name: m.last_name,
          phone: m.phone,
        }))}
        terms={(activeTerms ?? []).map((t: any) => ({ id: t.id, title: t.title, category: t.category }))}
        gstMode={settings?.gst_mode ?? "exclusive"}
      />
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { createTermsVersion } from "@/lib/actions/terms";
import { SubmitButton } from "@/components/ui/submit-button";
import { TermsCard } from "@/components/terms/terms-card";

export default async function TermsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, role")
    .eq("id", user!.id)
    .single();

  const gymId = userData!.gym_id;
  const canEdit = ["owner", "admin"].includes(userData!.role);

  const { data: versions } = await supabase
    .from("terms_versions")
    .select("*")
    .eq("gym_id", gymId)
    .order("category", { ascending: true })
    .order("created_at", { ascending: false });

  const gymVersionIds = (versions ?? []).filter((v: any) => (v.category || "gym") === "gym").map((v: any) => v.id);
  const swimVersionIds = (versions ?? []).filter((v: any) => v.category === "swimming").map((v: any) => v.id);

  const [gymCountResult, swimCountResult] = await Promise.all([
    gymVersionIds.length > 0
      ? supabase.from("terms_acceptances").select("id", { count: "exact", head: true }).eq("gym_id", gymId).in("terms_version_id", gymVersionIds)
      : Promise.resolve({ count: 0 }),
    swimVersionIds.length > 0
      ? supabase.from("terms_acceptances").select("id", { count: "exact", head: true }).eq("gym_id", gymId).in("terms_version_id", swimVersionIds)
      : Promise.resolve({ count: 0 }),
  ]);

  const gymCount = gymCountResult.count ?? 0;
  const swimCount = swimCountResult.count ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Terms & Conditions</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Versioned T&C documents for digital signature
        </p>
        <div className="mt-2 flex gap-4 text-xs text-zinc-500">
          <span>Gym Terms: {gymCount} signed</span>
          <span>Swimming Rules: {swimCount} signed</span>
        </div>
      </div>

      {canEdit && (
        <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900">New Version</h2>
          <form action={createTermsVersion} className="space-y-4">
            <input type="hidden" name="gym_id" value={gymId} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-medium text-zinc-600">Category *</label>
                <select
                  name="category"
                  required
                  defaultValue="gym"
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                >
                  <option value="gym">Gym Terms</option>
                  <option value="swimming">Swimming Pool Rules</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600">Version *</label>
                <input
                  name="version"
                  required
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  placeholder="1.0"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600">Title *</label>
                <input
                  name="title"
                  required
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  placeholder="Gym Membership Terms"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600">Body *</label>
              <textarea
                name="body"
                required
                rows={8}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                placeholder="Full terms and conditions text..."
              />
            </div>
            <SubmitButton
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
              label="Creating..."
            >
              Create Draft
            </SubmitButton>
          </form>
        </div>
      )}

      <div className="space-y-3">
        {versions?.length === 0 || !versions ? (
          <p className="text-sm text-zinc-400">No T&C versions yet. Create one above.</p>
        ) : (
          versions.map((v) => (
            <TermsCard
              key={v.id}
              version={v}
              canEdit={canEdit}
            />
          ))
        )}
      </div>
    </div>
  );
}

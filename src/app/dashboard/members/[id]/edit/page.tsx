import { createClient } from "@/lib/supabase/server";
import { updateMember as updateMemberAction } from "@/lib/actions/members";
import { notFound } from "next/navigation";
import { SubmitButton } from "@/components/ui/submit-button";
import Link from "next/link";
import { PhotoUpload } from "@/components/members/photo-upload";
import { initials } from "@/lib/utils";

export default async function EditMemberPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, role")
    .eq("id", user!.id)
    .single();

  const sp = await searchParams;

  const { data: member } = await supabase
    .from("members")
    .select("*")
    .eq("id", id)
    .eq("gym_id", userData!.gym_id)
    .single();

  if (!member) notFound();

  const { data: currentGroup } = member.group_id
    ? await supabase
        .from("member_groups")
        .select("name")
        .eq("id", member.group_id)
        .eq("gym_id", userData!.gym_id)
        .maybeSingle()
    : { data: null };

  const { data: existingGroups } = await supabase
    .from("member_groups")
    .select("name")
    .eq("gym_id", userData!.gym_id)
    .order("name", { ascending: true });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Edit Member</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {member.first_name} {member.last_name}
        </p>
      </div>

      {sp.error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {sp.error}
        </div>
      )}

      <form action={updateMemberAction.bind(null, member.id)} className="space-y-6">
        {/* Photo */}
        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <div className="flex items-center gap-6">
            <PhotoUpload
              memberId={member.id}
              gymId={userData!.gym_id}
              currentPhotoUrl={member.photo_url}
              initials={initials(member)}
              size="lg"
              canDelete={["owner", "admin", "manager"].includes(userData!.role)}
            />
            <div>
              <h2 className="text-lg font-semibold text-zinc-900">Profile Photo</h2>
              <p className="text-sm text-zinc-500">Take a photo with the device camera or upload an existing image.</p>
              <p className="text-xs text-zinc-400">Cropped and compressed automatically.</p>
            </div>
          </div>
        </section>

        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900">Member Details</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-zinc-600">First Name *</label>
              <input
                name="first_name"
                required
                defaultValue={member.first_name}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600">Last Name</label>
              <input
                name="last_name"
                defaultValue={member.last_name ?? ""}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600">Phone *</label>
              <input
                name="phone"
                required
                type="tel"
                defaultValue={member.phone}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600">Email</label>
              <input
                name="email"
                type="email"
                defaultValue={member.email ?? ""}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600">Gender</label>
              <select
                name="gender"
                defaultValue={member.gender ?? ""}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              >
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600">Date of Birth</label>
              <input
                name="date_of_birth"
                type="date"
                defaultValue={member.date_of_birth ?? ""}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-600">Address</label>
              <input
                name="address"
                defaultValue={member.address ?? ""}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600">Emergency Contact</label>
              <input
                name="emergency_contact_name"
                defaultValue={member.emergency_contact_name ?? ""}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600">Emergency Phone</label>
              <input
                name="emergency_contact_phone"
                type="tel"
                defaultValue={member.emergency_contact_phone ?? ""}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600">Medical Notes</label>
              <input
                name="medical_notes"
                defaultValue={member.medical_notes ?? ""}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                placeholder="Allergies, conditions..."
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600">Injury Notes</label>
              <input
                name="injury_notes"
                defaultValue={member.injury_notes ?? ""}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600">Referred By</label>
              <input
                name="referred_by"
                defaultValue={member.referred_by ?? ""}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600">Group (family / team / school)</label>
              <input
                name="group_name"
                list="group-options"
                defaultValue={currentGroup?.name ?? ""}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                placeholder="e.g. Verma Family"
              />
              <datalist id="group-options">
                {(existingGroups ?? []).map((g: any) => (
                  <option key={g.name} value={g.name} />
                ))}
              </datalist>
              <p className="mt-1 text-xs text-zinc-400">
                Leave empty to ungroup. Typing a new name creates the group.
              </p>
            </div>
          </div>
        </section>

        <div className="flex justify-end gap-3">
          <Link
            href={`/dashboard/members/${member.id}`}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            Cancel
          </Link>
          <SubmitButton
            className="rounded-lg bg-zinc-900 px-6 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
            label="Saving..."
          >
            Save Changes
          </SubmitButton>
        </div>
      </form>
    </div>
  );
}

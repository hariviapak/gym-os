import { createClient } from "@/lib/supabase/server";
import { fullName, formatDate, buildWhatsAppUrl } from "@/lib/utils";
import { generateSigningToken } from "@/lib/actions/signing";
import { StaffSignCard } from "@/components/members/staff-sign-card";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function SignTermsPage({
  params,
}: {
  params: Promise<{ id: string }>;
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

  const gymId = userData!.gym_id;

  const [{ data: member }, { data: activeTerms }, { data: acceptances }] = await Promise.all([
    supabase.from("members").select("*").eq("id", id).eq("gym_id", gymId).single(),
    supabase
      .from("terms_versions")
      .select("*")
      .eq("gym_id", gymId)
      .eq("status", "active")
      .order("created_at", { ascending: false }),
    supabase
      .from("terms_acceptances")
      .select("*")
      .eq("member_id", id)
      .order("accepted_at", { ascending: false }),
  ]);

  if (!member) notFound();

  // Terms auto-attach by package service type: only require the documents
  // matching the member's active memberships (gym-only members don't see pool
  // rules; swimmers don't see gym T&C; "both" packages require both)
  const { data: activeMemberships } = await supabase
    .from("memberships")
    .select("id, packages(service_type)")
    .eq("member_id", id)
    .eq("gym_id", gymId)
    .eq("status", "active");

  const services = new Set<string>(
    (activeMemberships ?? []).map((ms: any) => ms.packages?.service_type ?? "gym")
  );
  const needsGym = services.size === 0 || services.has("gym") || services.has("both");
  const needsSwimming = services.has("swimming") || services.has("both");

  const gymTerms = needsGym ? (activeTerms ?? []).find((t: any) => t.category === "gym" || !t.category) : null;
  const swimmingTerms = needsSwimming ? (activeTerms ?? []).find((t: any) => t.category === "swimming") : null;

  const memberAcceptances = acceptances ?? [];
  const gymAcceptance = memberAcceptances.find(
    (a: any) => a.terms_version_id === gymTerms?.id
  );
  const swimmingAcceptance = memberAcceptances.find(
    (a: any) => a.terms_version_id === swimmingTerms?.id
  );

  const memberName = fullName(member);

  async function sendSigningLink(termsVersionId: string, termsTitle: string) {
    "use server";
    const result = await generateSigningToken(id, termsVersionId);
    if (result.url) {
      const msg = `Hello ${memberName}, please review and sign our ${termsTitle}: ${result.url}`;
      const waUrl = buildWhatsAppUrl(member.phone, msg);
      return { waUrl };
    }
    return { error: result.error };
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <Link
            href={`/dashboard/members/${id}`}
            className="text-xs font-medium text-zinc-400 transition hover:text-zinc-900"
          >
            ← Back to {memberName}
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-zinc-900">Sign Terms</h1>
          <p className="mt-0.5 text-sm text-zinc-500">{memberName} · {member.phone}</p>
        </div>
      </div>

      {/* Gym Terms */}
      {gymTerms ? (
        <StaffSignCard
          memberId={id}
          gymId={gymId}
          termsVersionId={gymTerms.id}
          termsTitle={gymTerms.title}
          termsVersion={gymTerms.version}
          termsBody={gymTerms.body}
          category={gymTerms.category || "gym"}
          memberName={memberName}
          alreadySigned={!!gymAcceptance}
          signedAt={gymAcceptance ? formatDate(gymAcceptance.accepted_at) : undefined}
          signatureImage={gymAcceptance?.signature_image}
          signedName={gymAcceptance?.signed_name}
        />
      ) : (
        <div className="rounded-xl bg-white p-5 ring-1 ring-zinc-200/60">
          <p className="text-sm text-zinc-400">No active Gym Terms version. Create one in the T&C page.</p>
        </div>
      )}

      {/* Swimming Rules */}
      {swimmingTerms ? (
        <StaffSignCard
          memberId={id}
          gymId={gymId}
          termsVersionId={swimmingTerms.id}
          termsTitle={swimmingTerms.title}
          termsVersion={swimmingTerms.version}
          termsBody={swimmingTerms.body}
          category="swimming"
          memberName={memberName}
          alreadySigned={!!swimmingAcceptance}
          signedAt={swimmingAcceptance ? formatDate(swimmingAcceptance.accepted_at) : undefined}
          signatureImage={swimmingAcceptance?.signature_image}
          signedName={swimmingAcceptance?.signed_name}
        />
      ) : (
        <div className="rounded-xl bg-white p-5 ring-1 ring-zinc-200/60">
          <p className="text-sm text-zinc-400">No active Swimming Pool Rules version. Create one in the T&C page.</p>
        </div>
      )}

      {/* WhatsApp signing link helper */}
      <div className="rounded-xl bg-zinc-50 p-5 ring-1 ring-zinc-200/60">
        <h3 className="text-sm font-semibold text-zinc-900">Send Signing Link via WhatsApp</h3>
        <p className="mt-0.5 text-xs text-zinc-500">
          Generate a link and send it to the member. They can read and sign on their phone.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {gymTerms && !gymAcceptance && (
            <SendLinkButton memberId={id} termsVersionId={gymTerms.id} termsTitle={gymTerms.title} phone={member.phone} memberName={memberName} />
          )}
          {swimmingTerms && !swimmingAcceptance && (
            <SendLinkButton memberId={id} termsVersionId={swimmingTerms.id} termsTitle={swimmingTerms.title} phone={member.phone} memberName={memberName} />
          )}
          {(!gymTerms || gymAcceptance) && (!swimmingTerms || swimmingAcceptance) && (
            <p className="text-xs text-green-600">✓ All required terms signed!</p>
          )}
        </div>
      </div>
    </div>
  );
}

function SendLinkButton({
  memberId,
  termsVersionId,
  termsTitle,
  phone,
  memberName,
}: {
  memberId: string;
  termsVersionId: string;
  termsTitle: string;
  phone: string;
  memberName: string;
}) {
  return (
    <form
      action={async () => {
        "use server";
        const { generateSigningToken } = await import("@/lib/actions/signing");
        const { buildWhatsAppUrl } = await import("@/lib/utils");
        const { redirect } = await import("next/navigation");
        const result = await generateSigningToken(memberId, termsVersionId);
        if (result.url) {
          const msg = `Hello ${memberName}, please review and sign our ${termsTitle}: ${result.url}`;
          const waUrl = buildWhatsAppUrl(phone, msg);
          redirect(waUrl);
        }
      }}
    >
      <button
        type="submit"
        className="rounded-lg bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700 transition hover:bg-green-100"
      >
        Send &ldquo;{termsTitle}&rdquo; link →
      </button>
    </form>
  );
}

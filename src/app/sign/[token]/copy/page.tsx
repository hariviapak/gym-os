import { createServiceClient } from "@/lib/supabase/service";
import { getSigningTokenInfo } from "@/lib/actions/signing";
import { PrintButton } from "@/components/terms/print-button";
import { SignedDoc } from "@/components/terms/terms-document";
import Link from "next/link";

// Public (token-gated) signed-copy view: after signing, the member can open
// this from the success screen to read or download the exact document the
// gym keeps — same layout as the staff signed-documents page.
export default async function SignedCopyPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const tokenInfo = await getSigningTokenInfo(token);

  const member = tokenInfo?.members as any;
  const terms = tokenInfo?.terms_versions as any;
  const gym = tokenInfo?.gyms as any;

  if (!tokenInfo || !member || !terms || !tokenInfo.used_at) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-lg font-bold text-zinc-900">Nothing signed yet</h1>
        <p className="mt-1 text-sm text-zinc-500">
          This link becomes your signed copy once you submit your signature.
        </p>
        <Link
          href={`/sign/${token}`}
          className="mt-4 inline-block rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white"
        >
          Go to signing page →
        </Link>
      </div>
    );
  }

  // the acceptance recorded for this token's member + terms
  const supabase = createServiceClient(); // token-gated public route: service client reads the acceptance
  const { data: acceptance } = await supabase
    .from("terms_acceptances")
    .select("*")
    .eq("member_id", tokenInfo.member_id)
    .eq("terms_version_id", tokenInfo.terms_version_id)
    .order("accepted_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!acceptance) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-lg font-bold text-zinc-900">Signed copy not found</h1>
        <p className="mt-1 text-sm text-zinc-500">Please contact the gym front desk.</p>
      </div>
    );
  }

  const memberName = `${member.first_name ?? ""} ${member.last_name ?? ""}`.trim();

  return (
    <div className="min-h-screen bg-zinc-50 print:bg-white">
      <style>{`@page { size: A4; margin: 10mm }`}</style>
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 print:hidden">
        <Link href={`/sign/${token}`} className="text-xs font-medium text-zinc-400 transition hover:text-zinc-900">
          ← Back
        </Link>
        <PrintButton />
      </div>
      <div className="mx-auto max-w-2xl px-4 py-8 print-doc-ancestor">
        <div className="print-doc">
          <SignedDoc
            gymName={gym?.name ?? "Gym"}
            gymAddress={gym?.address}
            gymPhone={gym?.phone}
            title={terms.title}
            version={terms.version}
            category={terms.category}
            memberName={memberName}
            memberPhone={member.phone}
            memberEmail={member.email}
            body={terms.body}
            signatureImage={acceptance.signature_image}
            signedName={acceptance.signed_name || memberName}
            signedAt={acceptance.signed_at || acceptance.accepted_at}
            method={acceptance.accepted_by_method}
            signedIp={null}
          />
        </div>
      </div>
    </div>
  );
}

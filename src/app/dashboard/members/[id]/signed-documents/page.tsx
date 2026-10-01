import { createClient } from "@/lib/supabase/server";
import { fullName } from "@/lib/utils";
import { PrintButton } from "@/components/terms/print-button";
import { SignedDoc } from "@/components/terms/terms-document";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function SignedDocumentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  // zero-network session read: the middleware already verified this session,
  // and RLS enforces all data access regardless of where it was checked
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, role")
    .eq("id", user!.id)
    .single();

  const gymId = userData!.gym_id;

  const [{ data: member }, { data: acceptances }, { data: gym }] = await Promise.all([
    supabase.from("members").select("*").eq("id", id).eq("gym_id", gymId).single(),
    supabase
      .from("terms_acceptances")
      .select("*, terms_versions(id, title, version, body, category)")
      .eq("member_id", id)
      .order("accepted_at", { ascending: true }),
    supabase.from("gyms").select("name, address, phone").eq("id", gymId).single(),
  ]);

  if (!member) notFound();

  const memberName = fullName(member);
  const gymName = gym?.name ?? "Gym";
  const signedDocs = (acceptances ?? []).filter(
    (a: any) => a.terms_versions && a.signature_image
  );

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Screen-only toolbar */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 print:hidden">
        <Link
          href={`/dashboard/members/${id}`}
          className="text-xs font-medium text-zinc-400 transition hover:text-zinc-900"
        >
          ← Back to {memberName}
        </Link>
        <PrintButton />
      </div>

      {signedDocs.length === 0 ? (
        <div className="mx-auto max-w-2xl px-4 py-12">
          <div className="rounded-xl bg-white p-8 text-center ring-1 ring-zinc-200/60">
            <p className="text-sm text-zinc-400">No signed documents yet. Have the member sign the terms first.</p>
            <Link
              href={`/dashboard/members/${id}/sign-terms`}
              className="mt-3 inline-block rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800"
            >
              Go to Sign Terms →
            </Link>
          </div>
        </div>
      ) : (
        <div className="mx-auto max-w-2xl px-4 py-8 print-doc-ancestor">
          <div className="print-doc space-y-6">
            {signedDocs.map((a: any, idx: number) => {
              const terms = a.terms_versions;
              return (
                <SignedDoc
                  key={a.id}
                  gymName={gymName}
                  gymAddress={(gym as any)?.address}
                  gymPhone={(gym as any)?.phone}
                  title={terms.title}
                  version={terms.version}
                  category={terms.category}
                  memberName={memberName}
                  memberPhone={member.phone}
                  memberEmail={member.email}
                  body={terms.body}
                  signatureImage={a.signature_image}
                  signedName={a.signed_name || memberName}
                  signedAt={a.signed_at || a.accepted_at}
                  method={a.accepted_by_method}
                  signedIp={a.signed_ip}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

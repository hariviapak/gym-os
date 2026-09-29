import { createClient } from "@/lib/supabase/server";
import { fullName, formatDateTime } from "@/lib/utils";
import { PrintButton } from "@/components/terms/print-button";
import Link from "next/link";
import { notFound } from "next/navigation";

export default async function SignedDocumentsPage({
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
  const gymAddress = (gym as any)?.address ?? "";
  const gymPhone = (gym as any)?.phone ?? "";
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
              const isSwimming = terms.category === "swimming";
              const lines = terms.body.split("\n");
              return (
                <div
                  key={a.id}
                  className="bg-white p-10 print:break-before-page print:border-0 print:p-0 print:shadow-none"
                  style={idx === 0 ? { pageBreakBefore: "auto" } : { pageBreakBefore: "always" }}
                >
                  {/* Document header */}
                  <div className="text-center">
                    <h1 className="text-xl font-bold tracking-tight text-zinc-900">{gymName}</h1>
                    {gymAddress && <p className="mt-0.5 text-xs text-zinc-500">{gymAddress}</p>}
                    {gymPhone && <p className="text-xs text-zinc-500">Phone: {gymPhone}</p>}
                    <div className="mx-auto mt-3 w-16 border-t-2 border-zinc-900" />
                    <h2 className="mt-3 text-lg font-semibold text-zinc-900">{terms.title}</h2>
                    <p className="text-xs text-zinc-400">
                      Version {terms.version} · {isSwimming ? "Swimming Pool Rules" : "Gym Terms & Conditions"}
                    </p>
                  </div>

                  {/* Member info box */}
                  <div className="mt-6 rounded border border-zinc-200 px-4 py-3 print:border-zinc-300">
                    <div className="grid grid-cols-2 gap-1 text-xs">
                      <div>
                        <span className="text-zinc-400">Member Name: </span>
                        <span className="font-semibold text-zinc-700">{memberName}</span>
                      </div>
                      {member.phone && (
                        <div>
                          <span className="text-zinc-400">Phone: </span>
                          <span className="font-semibold text-zinc-700">{member.phone}</span>
                        </div>
                      )}
                      {member.email && (
                        <div>
                          <span className="text-zinc-400">Email: </span>
                          <span className="font-semibold text-zinc-700">{member.email}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Terms body — formatted as proper document text */}
                  <div className="mt-6 text-[11px] leading-[1.7] text-zinc-700">
                    {lines.map((line: string, i: number) => {
                      const trimmed = line.trim();
                      if (!trimmed) {
                        return <div key={i} className="h-3" />;
                      }
                      const isSectionHeader = /^\d+\.\s+[A-Z]/.test(trimmed);
                      const isSubHeader = /^[A-Z][A-Z\s,&]+$/.test(trimmed) && trimmed.length < 50;
                      const isBullet = trimmed.startsWith("•");

                      if (isSectionHeader) {
                        return (
                          <p key={i} className="mt-4 mb-1 text-xs font-bold uppercase tracking-wide text-zinc-900">
                            {trimmed}
                          </p>
                        );
                      }
                      if (isSubHeader) {
                        return (
                          <p key={i} className="mt-3 mb-1 text-[11px] font-bold uppercase tracking-wide text-zinc-800">
                            {trimmed}
                          </p>
                        );
                      }
                      if (isBullet) {
                        return (
                          <p key={i} className="pl-4 text-[11px] leading-[1.6] text-zinc-600">
                            <span className="mr-1.5">•</span>
                            {trimmed.slice(1).trim()}
                          </p>
                        );
                      }
                      return (
                        <p key={i} className="text-[11px] leading-[1.6] text-zinc-600">
                          {trimmed}
                        </p>
                      );
                    })}
                  </div>

                  {/* Signature section */}
                  <div className="mt-10 print:break-inside-avoid">
                    <div className="border-t border-zinc-300 pt-4">
                      <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                        Member Signature
                      </p>
                      <div className="mt-2 flex items-end justify-between">
                        <div>
                          {a.signature_image && (
                            <img
                              src={a.signature_image}
                              alt="Signature"
                              className="h-20"
                            />
                          )}
                          <div className="mt-1 w-48 border-t border-zinc-400" />
                          <p className="mt-1 text-xs font-semibold text-zinc-700">
                            {a.signed_name || memberName}
                          </p>
                        </div>
                        <div className="text-right text-xs text-zinc-500">
                          <p><span className="text-zinc-400">Date: </span>{formatDateTime(a.signed_at || a.accepted_at)}</p>
                          <p><span className="text-zinc-400">Method: </span>{a.accepted_by_method === "magic_link" ? "WhatsApp Link" : "Tablet Signature"}</p>
                          {a.signed_ip && <p><span className="text-zinc-400">IP: </span>{a.signed_ip}</p>}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

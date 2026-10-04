import { getSigningTokenInfo } from "@/lib/actions/signing";
import { SignForm } from "@/components/members/sign-form";
import { PrintButton } from "@/components/terms/print-button";
import { notFound } from "next/navigation";

// token-gated personal links must never be cached — their state (expired/
// used/voided) changes underneath
export const dynamic = "force-dynamic";

export default async function SignPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const tokenInfo = await getSigningTokenInfo(token);

  if (!tokenInfo) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
        <div className="max-w-md rounded-xl bg-white p-8 text-center ring-1 ring-zinc-200/60">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-red-100">
            <svg className="h-7 w-7 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>
          <h1 className="mt-4 text-lg font-bold text-zinc-900">Invalid Link</h1>
          <p className="mt-1 text-sm text-zinc-500">
            This signing link is not valid. Please contact the gym for a new link.
          </p>
        </div>
      </div>
    );
  }

  const isUsed = !!tokenInfo.used_at;
  const isExpired = new Date(tokenInfo.expires_at) < new Date();

  if (isUsed || isExpired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
        <div className="max-w-md rounded-xl bg-white p-8 text-center ring-1 ring-zinc-200/60">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
            <svg className="h-7 w-7 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h1 className="mt-4 text-lg font-bold text-zinc-900">
            {isUsed ? "Already Signed" : "Link Expired"}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {isUsed
              ? "You have already signed these terms. No further action needed."
              : "This signing link has expired. Please contact the gym for a new link."}
          </p>
        </div>
      </div>
    );
  }

  const member = tokenInfo.members as any;
  const terms = tokenInfo.terms_versions as any;
  const gym = tokenInfo.gyms as any;
  const memberName = `${member?.first_name ?? ""} ${member?.last_name ?? ""}`.trim();

  return (
    <div className="min-h-screen bg-zinc-50 print:bg-white">
      <style>{`@page { size: A4; margin: 10mm }`}</style>
      <div className="mx-auto max-w-2xl px-4 py-8">
        <div className="mb-6 hidden text-center print:block">
          <h1 className="text-xl font-bold text-zinc-900">{gym?.name ?? "Gym"}</h1>
          <p className="mt-0.5 text-sm text-zinc-500">Digital Terms & Conditions Signing</p>
        </div>

        <div className="mb-5 rounded-xl bg-white p-5 ring-1 ring-zinc-200/60">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-zinc-900">{terms?.title}</h2>
              <p className="text-xs text-zinc-400">Version {terms?.version} · {terms?.category === "swimming" ? "Swimming Pool Rules" : "Gym Terms"}</p>
            </div>
            <div className="print:hidden">
              <PrintButton label="Download Terms (PDF)" />
            </div>
          </div>
          <div className="mt-3 max-h-64 overflow-y-auto rounded-lg bg-zinc-50 p-4 print:max-h-none print:overflow-visible print:bg-white print:p-0">
            <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-zinc-600">
              {terms?.body}
            </pre>
          </div>
        </div>

        <div className="mb-5 rounded-lg bg-blue-50 px-4 py-3 print:hidden">
          <p className="text-sm text-blue-700">
            <strong>Member:</strong> {memberName}
          </p>
          <p className="mt-0.5 text-xs text-blue-600">
            Please read the terms above, then sign below.
          </p>
        </div>

        <SignForm
          token={token}
          memberName={memberName}
          termsTitle={terms?.title ?? "Terms"}
          termsVersion={terms?.version ?? "1.0"}
          gymName={gym?.name ?? "the gym"}
        />
      </div>
    </div>
  );
}

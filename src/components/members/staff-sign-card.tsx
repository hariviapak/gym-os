"use client";

import { useState, useTransition } from "react";
import { SignaturePad } from "@/components/members/signature-pad";
import { submitSignatureStaff } from "@/lib/actions/signing";

interface StaffSignCardProps {
  memberId: string;
  gymId: string;
  termsVersionId: string;
  termsTitle: string;
  termsVersion: string;
  termsBody: string;
  category: string;
  memberName: string;
  alreadySigned?: boolean;
  signedAt?: string;
  signatureImage?: string | null;
  signedName?: string | null;
}

export function StaffSignCard({
  memberId,
  gymId,
  termsVersionId,
  termsTitle,
  termsVersion,
  termsBody,
  category,
  memberName,
  alreadySigned,
  signedAt,
  signatureImage,
  signedName,
}: StaffSignCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [signature, setSignature] = useState<string | null>(null);
  const [signedNameInput, setSignedNameInput] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(!!alreadySigned);
  const [showSig, setShowSig] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!signature) {
      setError("Please draw a signature.");
      return;
    }
    if (!signedNameInput.trim()) {
      setError("Please type the member's full name.");
      return;
    }

    startTransition(async () => {
      const result = await submitSignatureStaff(
        memberId,
        termsVersionId,
        signature,
        signedNameInput.trim(),
        gymId
      );
      if (result.success) {
        setDone(true);
        setExpanded(false);
      } else {
        setError(result.error || "Failed to submit.");
      }
    });
  };

  if (done) {
    return (
      <div className="rounded-xl bg-white p-5 ring-1 ring-zinc-200/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-green-100">
              <svg className="h-4 w-4 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </span>
            <div>
              <h3 className="text-sm font-semibold text-zinc-900">{termsTitle}</h3>
              <p className="text-xs text-zinc-400">
                v{termsVersion} · {category === "swimming" ? "Swimming Pool Rules" : "Gym Terms"} · Signed {signedAt ?? "just now"}
              </p>
            </div>
          </div>
          {signatureImage && (
            <button
              type="button"
              onClick={() => setShowSig(!showSig)}
              className="text-xs font-medium text-zinc-500 hover:text-zinc-900"
            >
              {showSig ? "Hide" : "View"} Signature
            </button>
          )}
        </div>
        {showSig && signatureImage && (
          <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-2">
            <img src={signatureImage} alt="Signature" className="mx-auto h-20" />
            {signedName && <p className="mt-1 text-center text-xs text-zinc-500">{signedName}</p>}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-white p-5 ring-1 ring-zinc-200/60">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-amber-100">
            <svg className="h-4 w-4 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </span>
          <div>
            <h3 className="text-sm font-semibold text-zinc-900">{termsTitle}</h3>
            <p className="text-xs text-zinc-400">v{termsVersion} · {category === "swimming" ? "Swimming Pool Rules" : "Gym Terms"} · Pending</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-800"
        >
          {expanded ? "Cancel" : "Sign Now"}
        </button>
      </div>

      {!expanded && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-2 text-xs text-zinc-400 hover:text-zinc-700"
        >
          Read terms →
        </button>
      )}

      {expanded && (
        <div className="mt-4 space-y-4">
          <div className="max-h-48 overflow-y-auto rounded-lg bg-zinc-50 p-3">
            <pre className="whitespace-pre-wrap font-sans text-xs leading-relaxed text-zinc-600">
              {termsBody}
            </pre>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
          )}

          <div>
            <label className="block text-xs font-medium text-zinc-600">Member&rsquo;s Full Name</label>
            <input
              type="text"
              value={signedNameInput}
              onChange={(e) => setSignedNameInput(e.target.value)}
              placeholder={memberName}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-600">Signature</label>
            <p className="mb-1.5 text-xs text-zinc-400">Hand the device to the member to sign</p>
            <SignaturePad onChange={setSignature} />
          </div>

          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-1 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
            />
            <span className="text-xs text-zinc-600">
              The member has read and agrees to these terms.
            </span>
          </label>

          <button
            type="button"
            onClick={handleSubmit}
            disabled={isPending || !signature || !signedNameInput.trim() || !agreed}
            className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isPending ? "Submitting..." : "Submit Signature"}
          </button>
        </div>
      )}
    </div>
  );
}

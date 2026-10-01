"use client";

import { useState, useTransition } from "react";
import { SignaturePad } from "@/components/members/signature-pad";
import { submitSignatureFromToken } from "@/lib/actions/signing";
import Link from "next/link";

interface SignFormProps {
  token: string;
  memberName: string;
  termsTitle: string;
  termsVersion: string;
  gymName: string;
}

export function SignForm({ token, memberName, termsTitle, termsVersion, gymName }: SignFormProps) {
  const [signature, setSignature] = useState<string | null>(null);
  const [signedName, setSignedName] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!signature) {
      setError("Please draw your signature above.");
      return;
    }
    if (!signedName.trim()) {
      setError("Please type your full name.");
      return;
    }
    if (!agreed) {
      setError("Please check the box to confirm you agree.");
      return;
    }

    startTransition(async () => {
      const result = await submitSignatureFromToken(token, signature, signedName.trim());
      if (result.success) {
        setDone(true);
      } else {
        setError(result.error || "Something went wrong. Please try again.");
      }
    });
  };

  if (done) {
    return (
      <div className="mx-auto max-w-md rounded-xl bg-white p-8 text-center ring-1 ring-zinc-200/60">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
          <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 className="mt-4 text-lg font-bold text-zinc-900">Signature Recorded!</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Thank you, {memberName}. Your digital signature for <strong>{termsTitle}</strong> has been recorded.
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          The gym has saved a copy of the signed document.
        </p>
        <Link
          href={`/sign/${token}/copy`}
          className="mt-4 inline-block rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          Download Signed Copy (PDF) →
        </Link>
        <p className="mt-3 text-xs text-zinc-400">
          You can close this page now.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-md space-y-5 print:hidden">
      {error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="rounded-xl bg-white p-5 ring-1 ring-zinc-200/60">
        <label className="block text-xs font-medium text-zinc-600">
          Full Name
        </label>
        <input
          type="text"
          value={signedName}
          onChange={(e) => setSignedName(e.target.value)}
          placeholder={memberName}
          className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        />
      </div>

      <div className="rounded-xl bg-white p-5 ring-1 ring-zinc-200/60">
        <label className="block text-xs font-medium text-zinc-600">
          Signature
        </label>
        <p className="mb-2 text-xs text-zinc-400">Draw your signature below</p>
        <SignaturePad onChange={setSignature} />
      </div>

      <div className="rounded-xl bg-white p-5 ring-1 ring-zinc-200/60">
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
          />
          <span className="text-sm text-zinc-600">
            I, <strong>{signedName || "..."}</strong>, have read and agree to the{" "}
            <strong>{termsTitle}</strong> (v{termsVersion}) of {gymName}. My signature above represents my legally binding agreement.
          </span>
        </label>
      </div>

      <button
        type="submit"
        disabled={isPending || !signature || !signedName.trim() || !agreed}
        className="w-full rounded-lg bg-zinc-900 px-6 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isPending ? "Submitting..." : "Submit Signature"}
      </button>
    </form>
  );
}

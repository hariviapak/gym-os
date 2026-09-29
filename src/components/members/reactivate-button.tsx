"use client";

import { useFormStatus } from "react-dom";
import { reactivateMembership } from "@/lib/actions/memberships";

export function SubmitTiny({ label, pendingLabel, className }: { label: string; pendingLabel: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingLabel : label}
    </button>
  );
}

export function ReactivateButton({ membershipId, onDone }: { membershipId: string; onDone?: () => void }) {
  return (
    <form action={reactivateMembership.bind(null, membershipId)} onSubmit={() => onDone?.()}>
      <SubmitTiny
        label="Reactivate"
        pendingLabel="Reactivating…"
        className="block w-full px-3 py-1.5 text-left text-xs text-green-700 transition hover:bg-green-50"
      />
    </form>
  );
}

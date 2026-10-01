"use client";

import { useState } from "react";
import { cancelMembership } from "@/lib/actions/memberships";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatCurrency } from "@/lib/utils";

export function CancelMembershipModal({
  membershipId,
  packageName,
  amountPaid,
  forceOpen,
  onClose,
}: {
  membershipId: string;
  packageName: string;
  amountPaid: number;
  forceOpen?: boolean;
  onClose?: () => void;
}) {
  const [openState, setOpenState] = useState(false);
  const isControlled = forceOpen !== undefined;
  const open = isControlled ? forceOpen : openState;
  const setOpen = (v: boolean) => {
    if (!v && isControlled) onClose?.();
    else setOpenState(v);
  };
  const [refund, setRefund] = useState(amountPaid > 0 ? String(amountPaid) : "0");

  const refundVal = Math.max(0, parseFloat(refund) || 0);

  return (
    <>
      {!isControlled && (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-medium text-zinc-400 transition hover:bg-red-50 hover:text-red-600"
        title="Cancel this membership (optional refund)"
      >
        Cancel
      </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-zinc-900">Cancel Membership</h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-1 text-sm text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <p className="mb-4 text-sm text-zinc-500">
              Cancel <span className="font-medium text-zinc-900">{packageName}</span>? The member can re-enroll in
              this service later.
            </p>

            <form action={cancelMembership.bind(null, membershipId)} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-600">Reason (optional)</label>
                <input
                  name="reason"
                  placeholder="e.g. wrongly added, member request…"
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>

              <div className="rounded-lg bg-amber-50 p-3 ring-1 ring-amber-100">
                <label className="block text-xs font-medium text-zinc-600">Refund amount (₹)</label>
                <input
                  name="refund_amount"
                  type="number"
                  step="0.01"
                  min={0}
                  value={refund}
                  onChange={(e) => setRefund(e.target.value)}
                  disabled={amountPaid <= 0}
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 disabled:bg-zinc-100 disabled:text-zinc-400"
                />
                <p className="mt-1 text-[11px] text-zinc-500">
                  {amountPaid > 0
                    ? `Paid on this membership: ${formatCurrency(amountPaid)}. Set 0 for no refund — partial refunds are fine.`
                    : "Nothing was paid on this membership — no refund needed."}
                </p>
              </div>

              <div className="flex justify-end gap-3 border-t border-zinc-100 pt-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
                >
                  Keep Membership
                </button>
                <SubmitButton
                  className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
                  label="Cancelling..."
                >
                  {refundVal > 0 ? `Cancel + Refund ${formatCurrency(refundVal)}` : "Cancel Membership"}
                </SubmitButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

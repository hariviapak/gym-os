"use client";

import { useState, useRef } from "react";
import { updatePayment } from "@/lib/actions/payments";
import { SubmitButton } from "@/components/ui/submit-button";

export function PaymentEditModal({
  paymentId,
  currentAmount,
  currentMode,
  currentReferenceNote,
}: {
  paymentId: string;
  currentAmount: number;
  currentMode: string;
  currentReferenceNote: string | null;
}) {
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const boundAction = updatePayment.bind(null, paymentId);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-blue-600 hover:underline"
      >
        Edit
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900">Edit Payment</h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form action={boundAction} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-600">Amount *</label>
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  required
                  min={0.01}
                  defaultValue={currentAmount}
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600">Mode</label>
                <select
                  name="mode"
                  defaultValue={currentMode}
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                >
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="card">Card</option>
                  <option value="bank_transfer">Bank Transfer</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600">Reference Note</label>
                <input
                  name="reference_note"
                  defaultValue={currentReferenceNote ?? ""}
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  placeholder="UTR, transaction ID, etc."
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-zinc-200 pt-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <SubmitButton
                  className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                  label="Saving..."
                >
                  Save Changes
                </SubmitButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

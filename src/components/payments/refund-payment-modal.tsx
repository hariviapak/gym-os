"use client";

import { useState } from "react";
import { refundPayment } from "@/lib/actions/payments";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatCurrency } from "@/lib/utils";

interface PaymentInfo {
  id: string;
  amount: number;
  mode: string;
}

export function RefundPaymentModal({ payment, onClose }: { payment: PaymentInfo; onClose: () => void }) {
  const [amount, setAmount] = useState(String(payment.amount));

  const refundVal = Math.min(payment.amount, Math.max(0, parseFloat(amount) || 0));

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">Refund Payment</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900" aria-label="Close">
            ✕
          </button>
        </div>

        <p className="mb-4 text-sm text-zinc-500">
          Refund against the {formatCurrency(payment.amount)} {payment.mode} payment. Refunds don&apos;t change the membership — use
          &quot;Cancel&quot; on the membership if the service itself is being removed.
        </p>

        <form action={refundPayment} className="space-y-4">
          <input type="hidden" name="payment_id" value={payment.id} />
          <div>
            <label className="block text-xs font-medium text-zinc-600">Refund amount (₹)</label>
            <input
              name="amount"
              type="number"
              step="0.01"
              min={0}
              max={payment.amount}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
            <p className="mt-1 text-[11px] text-zinc-400">
              Partial refunds are fine — enter less than {formatCurrency(payment.amount)}.
            </p>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">Reason</label>
            <input
              name="reason"
              placeholder="e.g. duplicate charge, member request…"
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
          </div>
          <div className="flex justify-end gap-3 border-t border-zinc-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              Cancel
            </button>
            <SubmitButton
              className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
              label="Refunding..."
            >
              Refund {formatCurrency(refundVal)}
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}

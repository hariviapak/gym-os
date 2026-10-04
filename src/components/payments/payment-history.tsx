"use client";

import { useState } from "react";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/utils";
import { PopoverMenu } from "@/components/ui/popover-menu";
import { PaymentEditModal } from "@/components/payments/payment-edit-modal";
import { voidReceiptForm } from "@/lib/actions/payments";
import { RefundPaymentModal } from "@/components/payments/refund-payment-modal";

interface PaymentRow {
  id: string;
  amount: number;
  mode: string;
  referenceNote: string | null;
  paymentDate: string;
  receiptNo: number | null;
  receiptId: string | null;
  voided: boolean;
}

// Collapsible payment history with per-payment corrections
export function PaymentHistory({ memberId, memberPhone, payments }: { memberId: string; memberPhone: string; payments: PaymentRow[] }) {
  const [open, setOpen] = useState(false);
  const [refundFor, setRefundFor] = useState<PaymentRow | null>(null);

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs font-semibold text-blue-700 transition hover:text-blue-900"
      >
        {open ? "Hide payment history" : `View payment history (${payments.length})`}
      </button>

      {open && (
        <div className="mt-3 space-y-1.5">
          {payments.length === 0 && <p className="text-xs text-zinc-400">No payments recorded.</p>}
          {payments.map((p) => (
            <div key={p.id} className="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-1.5">
              <div className="min-w-0">
                <p className="whitespace-nowrap text-xs font-semibold text-zinc-900">
                  {formatCurrency(p.amount)}
                  <span className="ml-1.5 font-normal text-zinc-400">
                    {p.mode} · {formatDate(p.paymentDate)}
                    {p.receiptNo !== null && ` · R#${p.receiptNo}`}
                  </span>
                </p>
                {p.voided && <p className="text-[10px] font-semibold uppercase text-red-500">receipt voided</p>}
                {p.referenceNote && <p className="truncate text-[10px] text-zinc-400">{p.referenceNote}</p>}
              </div>
              <div className="shrink-0">
                <PopoverMenu
                  panelClassName="w-44"
                  trigger={({ toggle }) => (
                    <button
                      type="button"
                      onClick={toggle}
                      className="rounded px-2 py-1.5 text-xs text-zinc-400 transition hover:bg-zinc-200 hover:text-zinc-700"
                    >
                      ⋯
                    </button>
                  )}
                >
                  <div className="py-1">
                    {p.receiptId && (
                      <Link
                        href={`/dashboard/receipts/${p.receiptId}`}
                        className="block w-full px-3 py-1.5 text-left text-xs font-semibold text-zinc-900 transition hover:bg-zinc-50"
                      >
                        View receipt →
                      </Link>
                    )}
                    <div className="px-2 py-1">
                        <PaymentEditModal
                          paymentId={p.id}
                          currentAmount={p.amount}
                          currentMode={p.mode}
                          currentReferenceNote={p.referenceNote}
                        />
                      </div>
                    {!p.voided && p.receiptId && (
                      <form action={voidReceiptForm} className="px-2">
                        <input type="hidden" name="receipt_id" value={p.receiptId} />
                        <input type="hidden" name="reason" value="Voided from member profile" />
                        <button
                          type="submit"
                          className="w-full rounded px-2 py-1.5 text-left text-xs text-zinc-700 transition hover:bg-zinc-50"
                        >
                          Void receipt
                        </button>
                      </form>
                    )}
                    {!p.voided && (
                      <button
                        type="button"
                        onClick={() => setRefundFor(p)}
                        className="block w-full px-3 py-1.5 text-left text-xs text-zinc-700 transition hover:bg-zinc-50"
                      >
                        Refund / Partial refund…
                      </button>
                    )}
                  </div>
                </PopoverMenu>
              </div>
            </div>
          ))}
          <Link
            href={`/dashboard/payments?q=${encodeURIComponent(memberPhone)}`}
            className="inline-block text-[11px] font-medium text-zinc-500 transition hover:text-zinc-900"
          >
            View all payments →
          </Link>
        </div>
      )}

      {refundFor && (
        <RefundPaymentModal payment={refundFor} onClose={() => setRefundFor(null)} />
      )}
    </div>
  );
}

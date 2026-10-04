import { getReceiptTokenInfo } from "@/lib/actions/receipts";
import { PrintButton } from "@/components/receipts/receipt-actions";
import { formatCurrency, formatDate } from "@/lib/utils";
import Link from "next/link";

// Public, token-gated receipt view — members open this from WhatsApp (no
// login). 90-day expiry; voided receipts carry a permanent VOIDED mark so
// old links can never masquerade as valid proof of payment.
// token-gated personal links must never be cached — their state (expired/
// used/voided) changes underneath
export const dynamic = "force-dynamic";

export default async function PublicReceiptPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const info = await getReceiptTokenInfo(token);

  if (!info) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
        <div className="max-w-md rounded-xl bg-white p-8 text-center ring-1 ring-zinc-200/60">
          <h1 className="text-lg font-bold text-zinc-900">Receipt not found</h1>
          <p className="mt-1 text-sm text-zinc-500">
            This link is not valid. Please ask the gym to resend your receipt.
          </p>
        </div>
      </div>
    );
  }

  if (info.expired) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-50 p-4">
        <div className="max-w-md rounded-xl bg-white p-8 text-center ring-1 ring-zinc-200/60">
          <h1 className="text-lg font-bold text-zinc-900">Link expired</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Receipt links are valid for 90 days. Please ask the gym to resend your receipt.
          </p>
        </div>
      </div>
    );
  }

  const r = info.receipt as any;
  const member = r.members;
  const pkg = r.memberships?.packages;
  const payment = r.payments;
  const voided = !!r.voided_at;
  const memberName = `${member?.first_name ?? ""} ${member?.last_name ?? ""}`.trim();

  return (
    <div className="min-h-screen bg-zinc-100 py-6 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 10mm }`}</style>

      {/* screen-only toolbar */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 print:hidden">
        <span className="text-xs font-medium text-zinc-400">{info.gym?.name ?? "Gym"} · Official Receipt</span>
        <PrintButton label="Download PDF" />
      </div>

      <div className="mx-auto w-full max-w-[560px] bg-white px-5 py-8 text-zinc-900 shadow-lg sm:px-8 print:px-0 print:py-0 print:shadow-none">
        <div className="print-doc relative">
          {/* VOIDED watermark */}
          {voided && (
            <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
              <span className="-rotate-12 text-6xl font-black tracking-widest text-red-500/20 print:text-red-500/30">
                VOIDED
              </span>
            </div>
          )}

          {/* header */}
          <div className="border-b-4 border-zinc-900 pb-4 text-center">
            <h1 className="text-xl font-bold tracking-tight">{info.gym?.name ?? "Gym"}</h1>
            {info.gym?.address && <p className="mt-0.5 text-xs text-zinc-500">{info.gym.address}</p>}
            {info.gym?.phone && <p className="text-xs text-zinc-500">Phone: {info.gym.phone}</p>}
            <div className="mx-auto mt-3 w-16 border-t-2 border-zinc-900" />
            <h2 className="mt-3 text-lg font-semibold">Payment Receipt</h2>
            <p className="text-xs text-zinc-400">
              Receipt #{r.receipt_no} · {formatDate(payment?.payment_date ?? r.created_at)}
            </p>
          </div>

          {/* body */}
          <div className="mt-6 space-y-1.5 text-sm">
            <div className="flex justify-between border-b border-zinc-100 py-1.5">
              <span className="text-zinc-500">Member</span>
              <span className="font-semibold">{memberName}</span>
            </div>
            {pkg?.name && (
              <div className="flex justify-between border-b border-zinc-100 py-1.5">
                <span className="text-zinc-500">Package</span>
                <span className="font-semibold">
                  {pkg.name}
                  {pkg.duration_days ? ` (${pkg.duration_days} days)` : ""}
                </span>
              </div>
            )}
            <div className="flex justify-between border-b border-zinc-100 py-1.5">
              <span className="text-zinc-500">Amount</span>
              <span className="font-semibold">{formatCurrency(Number(r.amount))}</span>
            </div>
            {Number(r.gst_amount) > 0 && (
              <div className="flex justify-between border-b border-zinc-100 py-1.5">
                <span className="text-zinc-500">GST</span>
                <span className="font-semibold">{formatCurrency(Number(r.gst_amount))}</span>
              </div>
            )}
            <div className="flex justify-between py-1.5 text-base">
              <span className="font-semibold">Total paid</span>
              <span className="font-bold">{formatCurrency(Number(r.total_amount))}</span>
            </div>
            <div className="flex justify-between border-t border-zinc-200 py-1.5 text-xs text-zinc-500">
              <span>Mode</span>
              <span className="font-medium capitalize">{(payment?.mode ?? "cash").replace("_", " ")}</span>
            </div>
            {payment?.reference_note && (
              <div className="flex justify-between py-1 text-xs text-zinc-500">
                <span>Reference</span>
                <span className="font-medium">{payment.reference_note}</span>
              </div>
            )}
          </div>

          {voided && (
            <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 print:bg-white print:ring-1 print:ring-red-200">
              This receipt was voided on {formatDate(r.voided_at)} and is not a valid proof of payment.
            </p>
          )}

          {/* footer */}
          <div className="mt-8 border-t border-zinc-200 pt-3 text-center text-[10px] text-zinc-400 print:hidden">
            <p>This receipt was shared securely by the gym. Keep it for your records.</p>
          </div>
          <p className="sr-only">
            <Link href="/login">792 Fitness Studio</Link>
          </p>
        </div>
      </div>
    </div>
  );
}

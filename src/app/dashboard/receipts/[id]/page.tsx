import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDateTime } from "@/lib/utils";
import { notFound } from "next/navigation";
import Link from "next/link";
import { PrintButton } from "@/components/receipts/receipt-actions";
import { VoidReceiptButton } from "@/components/receipts/void-receipt-button";
import { sendReceiptToMember } from "@/lib/actions/receipts";
import { SubmitButton } from "@/components/ui/submit-button";

export default async function ReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
// zero-network session read: the middleware already verified this session,
  // and RLS enforces all data access regardless of where it was checked
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, role")
    .eq("id", user!.id)
    .single();

  const gymId = userData!.gym_id;
  const canVoid = ["owner", "admin", "manager"].includes(userData!.role);

  const [{ data: receipt }, { data: gym }, { data: settings }] = await Promise.all([
    supabase
      .from("receipts")
      .select("*, members(first_name, last_name, phone, email), memberships(packages(name, duration_days)), payments!receipts_payment_id_fkey(mode, reference_note, payment_date)")
      .eq("id", id)
      .eq("gym_id", gymId)
      .single(),
    supabase.from("gyms").select("*").eq("id", gymId).single(),
    supabase.from("gym_settings").select("receipt_prefix").eq("gym_id", gymId).single(),
  ]);

  if (!receipt) notFound();

  // Group payment annexure: per-member share breakdown from the group's
  // memberships (in group mode one payment row carries the full amount)
  let groupMembersRows: Array<any> = [];
  if (receipt.payment_group_id) {
    const { data: gm } = await supabase
      .from("memberships")
      .select("id, amount_paid, total_amount, payment_status, members(first_name, last_name)")
      .eq("payment_group_id", receipt.payment_group_id)
      .eq("gym_id", gymId)
      .order("created_at", { ascending: true });
    groupMembersRows = gm ?? [];
  }
  const groupPayments = groupMembersRows;

  const isVoided = !!receipt.voided_at;
  const prefix = settings?.receipt_prefix ?? "RCT";
  const member = receipt.members as any;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Action bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link
          href="/dashboard/payments"
          className="text-sm font-medium text-zinc-600 hover:text-zinc-900"
        >
          ← Back to Payments
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          {member?.phone && !isVoided && (
            <form action={sendReceiptToMember.bind(null, receipt.id)}>
              <SubmitButton
                className="rounded-lg bg-green-50 px-3 py-2 text-sm font-semibold text-green-700 ring-1 ring-green-200 transition hover:bg-green-100"
                label="Opening…"
              >
                Send to member
              </SubmitButton>
            </form>
          )}
          {canVoid && !isVoided && <VoidReceiptButton receiptId={receipt.id} />}
          <PrintButton />
        </div>
      </div>

      {/* Receipt */}
      <div className="rounded-xl bg-white p-8 shadow-sm ring-1 ring-zinc-200 print:shadow-none print:ring-0">
        {/* Header */}
        <div className="flex flex-col items-center text-center">
          {gym?.logo_url && (
            <img
              src={gym.logo_url}
              alt={gym.name}
              className="mb-2 h-16 w-16 rounded-lg object-contain print:h-12 print:w-12"
            />
          )}
          <h1 className="text-2xl font-bold text-zinc-900">{gym?.name}</h1>
          {gym?.address && <p className="text-sm text-zinc-500">{gym.address}</p>}
          <div className="mt-1 flex items-center justify-center gap-3 text-xs text-zinc-400">
            {gym?.phone && <span>{gym.phone}</span>}
            {gym?.email && <span>{gym.email}</span>}
            {gym?.gstin && <span>GSTIN: {gym.gstin}</span>}
          </div>
        </div>

        <div className="my-6 border-t border-dashed border-zinc-300" />

        {/* Receipt meta */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">Receipt No.</p>
            <p className="text-lg font-bold text-zinc-900">
              {prefix}-{String(receipt.receipt_no).padStart(4, "0")}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">Date</p>
            <p className="text-sm text-zinc-900">{formatDateTime(receipt.created_at)}</p>
          </div>
        </div>

        {isVoided && (
          <div className="mt-4 rounded-lg bg-red-50 px-4 py-2 text-center">
            <p className="text-sm font-bold uppercase tracking-wider text-red-700">Voided</p>
            <p className="text-xs text-red-600">
              {receipt.void_reason} · {formatDateTime(receipt.voided_at)}
            </p>
          </div>
        )}

        {/* Member */}
        <div className="mt-6">
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">
            {groupPayments.length > 1 ? "Group Payment — Billed To" : "Received From"}
          </p>
          <p className="text-sm font-semibold text-zinc-900">
            {receipt.billed_to ?? `${receipt.members?.first_name ?? ""} ${receipt.members?.last_name ?? ""}`.trim()}
          </p>
          {receipt.billed_to && groupPayments.length < 2 && (
            <p className="text-xs text-zinc-500">
              {receipt.members?.first_name} {receipt.members?.last_name} · {receipt.members?.phone}
            </p>
          )}
          {!receipt.billed_to && <p className="text-xs text-zinc-500">{receipt.members?.phone}</p>}

          {/* Group annexure: per-member breakdown */}
          {groupPayments.length > 1 && (
            <div className="mt-3 rounded-lg bg-zinc-50 p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                Members covered ({groupPayments.length})
              </p>
              <ul className="mt-1.5 space-y-1">
                {groupPayments.map((gp: any, i: number) => (
                  <li key={gp.id ?? i} className="flex items-center justify-between text-xs">
                    <span className="text-zinc-700">
                      {gp.members ? [gp.members.first_name, gp.members.last_name].filter(Boolean).join(" ") : "—"}
                    </span>
                    <span className="font-medium text-zinc-900">
                      {formatCurrency(Number(gp.amount_paid))} / {formatCurrency(Number(gp.total_amount))}
                      {gp.payment_status !== "paid" && (
                        <span className="ml-1 font-normal text-amber-600">{gp.payment_status}</span>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Details */}
        <div className="mt-6">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs font-medium uppercase tracking-wider text-zinc-400">
                <th className="pb-2">Description</th>
                <th className="pb-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-zinc-100">
                <td className="py-3 text-sm text-zinc-900">
                  {receipt.memberships?.packages?.name ?? "Payment"}
                  {receipt.memberships?.packages?.duration_days && (
                    <span className="ml-1 text-xs text-zinc-400">
                      ({receipt.memberships.packages.duration_days} days)
                    </span>
                  )}
                </td>
                <td className="py-3 text-right text-sm text-zinc-900">
                  {formatCurrency(Number(receipt.amount))}
                </td>
              </tr>
              {Number(receipt.discount_amount) > 0 && (
                <tr className="border-b border-zinc-100">
                  <td className="py-2 text-sm text-red-600">
                    Discount
                    {receipt.discount_reason && (
                      <span className="ml-1 text-xs text-zinc-400">({receipt.discount_reason})</span>
                    )}
                  </td>
                  <td className="py-2 text-right text-sm text-red-600">
                    -{formatCurrency(Number(receipt.discount_amount))}
                  </td>
                </tr>
              )}
              {Number(receipt.gst_amount) > 0 && (
                <tr className="border-b border-zinc-100">
                  <td className="py-2 text-sm text-zinc-500">GST</td>
                  <td className="py-2 text-right text-sm text-zinc-500">
                    {formatCurrency(Number(receipt.gst_amount))}
                  </td>
                </tr>
              )}
              <tr>
                <td className="py-3 text-sm font-bold text-zinc-900">Total</td>
                <td className="py-3 text-right text-sm font-bold text-zinc-900">
                  {formatCurrency(Number(receipt.total_amount))}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Payment mode */}
        <div className="mt-6 flex items-center justify-between text-sm">
          <div>
            <span className="text-zinc-400">Payment Mode: </span>
            <span className="font-medium text-zinc-900 uppercase">{receipt.payments?.[0]?.mode ?? "—"}</span>
          </div>
          {receipt.payments?.[0]?.reference_note && (
            <div>
              <span className="text-zinc-400">Reference: </span>
              <span className="font-medium text-zinc-900">{receipt.payments[0].reference_note}</span>
            </div>
          )}
        </div>

        <div className="my-6 border-t border-dashed border-zinc-300" />

        {/* Footer */}
        <p className="text-center text-xs text-zinc-400">
          This is a computer-generated receipt. Thank you for your business!
        </p>
      </div>
    </div>
  );
}

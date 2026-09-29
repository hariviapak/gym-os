import { createClient } from "@/lib/supabase/server";
import { recordPayment } from "@/lib/actions/payments";
import { formatCurrency } from "@/lib/utils";
import { SubmitButton } from "@/components/ui/submit-button";
import Link from "next/link";
import { MemberSearchBox, CollectBalanceButton } from "@/components/payments/payment-interactive";

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ member_id?: string; error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id")
    .eq("id", user!.id)
    .single();

  const gymId = userData!.gym_id;
  const params = await searchParams;

  let selectedMember: any = null;
  let balanceDue: number | null = null;
  let activeMembership: any = null;

  if (params.member_id) {
    const { data: member } = await supabase
      .from("members")
      .select("id, first_name, last_name, phone, email")
      .eq("id", params.member_id)
      .eq("gym_id", gymId)
      .single();

    if (member) {
      selectedMember = member;

      const { data: ms } = await supabase
        .from("memberships")
        .select("id, amount, gst_amount, total_amount, amount_paid, payment_status, packages(name)")
        .eq("member_id", member.id)
        .eq("gym_id", gymId)
        .in("status", ["active"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (ms && ms.payment_status !== "paid") {
        activeMembership = ms;
        balanceDue = Number(ms.total_amount) - Number(ms.amount_paid);
      }
    }
  }

  const { data: recentMembers } = await supabase
    .from("members")
    .select("id, first_name, last_name, phone")
    .eq("gym_id", gymId)
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Collect Payment</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Record a payment for an existing member
        </p>
      </div>

      {params.error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {params.error}
        </div>
      )}

      {/* Member selector */}
      {!selectedMember && (
        <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900">Select Member</h2>
          <MemberSearchBox members={recentMembers ?? []} />
        </div>
      )}

      {/* Payment form */}
      {selectedMember && (
        <form action={recordPayment} className="space-y-6">
          <input type="hidden" name="member_id" value={selectedMember.id} />
          {activeMembership && (
            <input type="hidden" name="membership_id" value={activeMembership.id} />
          )}

          {/* Member info */}
          <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">
                  {selectedMember.first_name} {selectedMember.last_name}
                </h2>
                <p className="text-sm text-zinc-500">{selectedMember.phone}</p>
              </div>
              <Link
                href="/dashboard/payments/new"
                className="text-xs font-medium text-zinc-500 hover:text-zinc-900"
              >
                Change member
              </Link>
            </div>
          </div>

          {/* Balance due banner */}
          {balanceDue !== null && balanceDue > 0 && (
            <div className="rounded-xl bg-amber-50 p-5 ring-1 ring-amber-200">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-amber-900">Balance Due</p>
                  <p className="text-2xl font-bold text-amber-900">{formatCurrency(balanceDue)}</p>
                  {activeMembership && (
                    <p className="mt-1 text-xs text-amber-700">
                      {activeMembership.packages?.name} · Paid {formatCurrency(Number(activeMembership.amount_paid))} of {formatCurrency(Number(activeMembership.total_amount))}
                    </p>
                  )}
                </div>
                <CollectBalanceButton balanceDue={balanceDue} />
              </div>
            </div>
          )}

          {/* Payment details */}
          <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
            <h2 className="mb-4 text-lg font-semibold text-zinc-900">Payment Details</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-600">Amount (₹) *</label>
                <input
                  id="amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  required
                  min={1}
                  defaultValue={balanceDue?.toFixed(2) ?? ""}
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600">Payment Mode</label>
                <select
                  name="payment_mode"
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
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  placeholder="UTR, transaction ID, etc."
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <Link
              href="/dashboard/payments"
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              Cancel
            </Link>
            <SubmitButton
              className="rounded-lg bg-zinc-900 px-6 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
              label="Recording..."
            >
              Record Payment & Generate Receipt
            </SubmitButton>
          </div>
        </form>
      )}
    </div>
  );
}

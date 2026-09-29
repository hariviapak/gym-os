"use client";

import { useState } from "react";
import { SubmitButton } from "@/components/ui/submit-button";
import { PhoneLookup, type QuickMember } from "@/components/payments/phone-lookup";
import { quickPass } from "@/lib/actions/quick-pass";
import { formatCurrency, todayIST } from "@/lib/utils";

export function QuickPassForm({
  packages,
  members,
  gstMode = "exclusive",
}: {
  packages: { id: string; name: string; amount: number; type: string; duration_days: number; gst_rate: number }[];
  members: QuickMember[];
  gstMode?: string;
}) {
  const [selectedMember, setSelectedMember] = useState<QuickMember | null>(null);
  const [phone, setPhone] = useState("");
  const [confirmNew, setConfirmNew] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<string>("");
  const [discountAmount, setDiscountAmount] = useState<number>(0);

  // Existing members whose phone matches what was typed (digits-based, since
  // stored phones use different formats). Identity is the member id, never
  // the phone — staff must explicitly pick or confirm creating a new member.
  const typedDigits = phone.replace(/\D/g, "");
  const phoneMatches =
    !selectedMember && typedDigits.length >= 4
      ? members.filter((m) => {
          const stored = m.phone.replace(/\D/g, "");
          return stored.endsWith(typedDigits.slice(-10)) || typedDigits.endsWith(stored.slice(-10));
        })
      : [];

  const dayPasses = packages.filter((p) => p.type === "day_pass" || p.type === "trial");
  const memberships = packages.filter((p) => p.type === "membership");

  const pkg = packages.find((p) => p.id === selectedPackage);
  const pkgAmount = pkg ? Number(pkg.amount) : 0;
  const effectivePrice = Math.max(0, pkgAmount - discountAmount);

  let amount: number;
  let gstAmount: number;
  let totalAmount: number;

  if (pkg) {
    if (gstMode === "inclusive") {
      totalAmount = effectivePrice;
      amount = Number((effectivePrice / (1 + pkg.gst_rate / 100)).toFixed(2));
      gstAmount = Number((totalAmount - amount).toFixed(2));
    } else {
      amount = effectivePrice;
      gstAmount = Number((amount * (pkg.gst_rate / 100)).toFixed(2));
      totalAmount = amount + gstAmount;
    }
  } else {
    amount = 0;
    gstAmount = 0;
    totalAmount = 0;
  }

  return (
    <form action={quickPass} className="space-y-6">
      {/* Step 1: Phone / Member lookup */}
      <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900">
          <span className="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-xs text-white">1</span>
          Phone Number
        </h2>
        <PhoneLookup
          members={members}
          onSelect={(member, ph) => {
            setSelectedMember(member);
            setPhone(ph);
            if (!member) setConfirmNew(false);
          }}
        />

        {/* Hidden / conditional fields */}
        {selectedMember ? (
          <input type="hidden" name="member_id" value={selectedMember.id} />
        ) : (
          <>
            <input type="hidden" name="phone" value={phone} />
            {phone && phoneMatches.length > 0 && !confirmNew && (
              <div className="mt-3 rounded-lg bg-amber-50 p-3 ring-1 ring-amber-200">
                <p className="text-xs font-medium text-amber-900">
                  This number matches an existing member. Pick one, or confirm a new member:
                </p>
                <div className="mt-2 space-y-1">
                  {phoneMatches.slice(0, 3).map((m) => (
                    <div key={m.id} className="flex items-center justify-between gap-2">
                      <span className="text-sm text-amber-900">
                        {m.first_name} {m.last_name ?? ""} <span className="text-amber-600">· {m.phone}</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedMember(m);
                          setConfirmNew(false);
                        }}
                        className="whitespace-nowrap rounded-md bg-amber-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-800"
                      >
                        Use
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmNew(true)}
                  className="mt-2 text-xs font-semibold text-amber-900 underline underline-offset-2 hover:text-amber-700"
                >
                  Create as new member →
                </button>
              </div>
            )}
            {phone && (phoneMatches.length === 0 || confirmNew) && (
              <div className="mt-3">
                <label className="block text-xs font-medium text-zinc-600">
                  First Name * {confirmNew && <span className="text-amber-600">(new member)</span>}
                </label>
                <input
                  name="first_name"
                  required
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  placeholder="Enter name"
                />
              </div>
            )}
            {confirmNew && <input type="hidden" name="create_new" value="1" />}
          </>
        )}
      </section>

      {/* Step 2: Package selection */}
      {phone && (
        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900">
            <span className="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-xs text-white">2</span>
            Select Package
          </h2>

          {dayPasses.length > 0 && (
            <div className="mb-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-400">Day Passes & Trials</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {dayPasses.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPackage(p.id)}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition ${
                      selectedPackage === p.id
                        ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900"
                        : "border-zinc-200 hover:border-zinc-300"
                    }`}
                  >
                    <div>
                      <span className="text-sm font-medium text-zinc-900">{p.name}</span>
                      <span className="ml-1 text-xs text-zinc-400">{p.duration_days}d</span>
                    </div>
                    <span className="text-sm font-semibold text-zinc-900">
                      {p.amount === 0 ? "FREE" : formatCurrency(p.amount)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {memberships.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-400">Memberships</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {memberships.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedPackage(p.id)}
                    className={`flex items-center justify-between rounded-lg border px-3 py-2.5 text-left transition ${
                      selectedPackage === p.id
                        ? "border-zinc-900 bg-zinc-50 ring-1 ring-zinc-900"
                        : "border-zinc-200 hover:border-zinc-300"
                    }`}
                  >
                    <div>
                      <span className="text-sm font-medium text-zinc-900">{p.name}</span>
                      <span className="ml-1 text-xs text-zinc-400">{p.duration_days}d</span>
                    </div>
                    <span className="text-sm font-semibold text-zinc-900">
                      {formatCurrency(p.amount)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <input type="hidden" name="package_id" value={selectedPackage} />
        </section>
      )}

      {/* Step 3: Payment */}
      {selectedPackage && pkg && (
        <section className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
          <h2 className="mb-4 text-lg font-semibold text-zinc-900">
            <span className="mr-2 flex h-6 w-6 items-center justify-center rounded-full bg-zinc-900 text-xs text-white">3</span>
            Payment
          </h2>

          {/* Amount summary */}
          <div className="mb-4 rounded-lg bg-zinc-50 px-4 py-3">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-500">Package</span>
              <span className="font-medium text-zinc-900">{pkg.name}</span>
            </div>
            <div className="mt-1 flex justify-between text-sm">
              <span className="text-zinc-500">Duration</span>
              <span className="font-medium text-zinc-900">{pkg.duration_days} day{pkg.duration_days === 1 ? "" : "s"}</span>
            </div>
            {discountAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-zinc-500">Discount</span>
                <span className="text-red-600">-{formatCurrency(discountAmount)}</span>
              </div>
            )}
            {gstAmount > 0 && (
              <>
                <div className="mt-1 flex justify-between text-sm">
                  <span className="text-zinc-500">Base</span>
                  <span className="text-zinc-900">{formatCurrency(amount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-zinc-500">GST ({pkg.gst_rate}%)</span>
                  <span className="text-zinc-900">{formatCurrency(gstAmount)}</span>
                </div>
                {gstMode === "inclusive" && (
                  <p className="mt-1 text-xs text-zinc-400">GST is inclusive in the package price</p>
                )}
              </>
            )}
            <div className="mt-2 flex justify-between border-t border-zinc-200 pt-2 text-sm font-bold">
              <span className="text-zinc-900">Total</span>
              <span className="text-zinc-900">{formatCurrency(totalAmount)}</span>
            </div>
          </div>

          <input type="hidden" name="start_date" value={todayIST()} />

          {pkgAmount > 0 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-zinc-600">Discount (optional)</label>
                <input
                  name="discount_amount"
                  type="number"
                  step="0.01"
                  min={0}
                  max={pkgAmount}
                  value={discountAmount || ""}
                  onChange={(e) => setDiscountAmount(Math.min(parseFloat(e.target.value) || 0, pkgAmount))}
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  placeholder="0"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-zinc-600">Discount Reason</label>
                <input
                  name="discount_reason"
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  placeholder="Referral, seasonal, etc."
                  disabled={discountAmount === 0}
                />
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-medium text-zinc-600">
                Payment Amount {totalAmount === 0 && "(Free)"}
              </label>
              <input
                key={`${selectedPackage}-${discountAmount}`}
                name="payment_amount"
                type="number"
                step="0.01"
                min={0}
                max={totalAmount}
                defaultValue={totalAmount.toFixed(2)}
                disabled={totalAmount === 0}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 disabled:bg-zinc-50 disabled:text-zinc-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-zinc-600">Payment Mode</label>
              <select
                name="payment_mode"
                disabled={totalAmount === 0}
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 disabled:bg-zinc-50"
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="card">Card</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-600">Reference Note (optional)</label>
              <input
                name="reference_note"
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                placeholder="UTR, transaction ID, etc."
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-zinc-600">Referred By (optional)</label>
              <input
                name="referred_by"
                className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                placeholder="Member name or phone who referred"
              />
            </div>
          </div>
        </section>
      )}

      {/* Submit */}
      {selectedPackage && (
        <div className="flex flex-col items-end gap-2">
          <SubmitButton
            disabled={!selectedMember && phoneMatches.length > 0 && !confirmNew}
            className="rounded-lg bg-zinc-900 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-40"
            label="Processing..."
          >
            {totalAmount === 0 ? "Issue Pass" : "Collect Payment & Issue Pass"}
          </SubmitButton>
          {!selectedMember && phoneMatches.length > 0 && !confirmNew && (
            <p className="text-xs text-amber-600">
              Pick a member or confirm “Create as new member” above to continue
            </p>
          )}
        </div>
      )}
    </form>
  );
}

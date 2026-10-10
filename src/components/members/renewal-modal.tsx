"use client";

import { useState, useRef } from "react";
import { renewMembership } from "@/lib/actions/memberships";
import { formatCurrency, formatDate } from "@/lib/utils";
import { useUser, canBackdateFreely } from "@/components/layout/user-context";
import { SubmitButton } from "@/components/ui/submit-button";

interface PackageInfo {
  id: string;
  name: string;
  amount: number;
  duration_days: number;
  gst_rate: number;
  type: string;
  service_type?: string;
}

export interface CurrentPlan {
  id: string;
  serviceType?: string;
  name: string;
  endDate: string;
  daysLeft: number;
}

export function RenewalModal({
  memberId,
  packages,
  gstMode,
  currentPackageId,
  currentEndDate,
  currentPackageName,
  currentServiceType,
  currentPlans,
  daysLeft,
  variant = "default",
  forceOpen,
  onClose,
}: {
  memberId: string;
  packages: PackageInfo[];
  gstMode: string;
  currentPackageId?: string;
  currentEndDate?: string;
  currentPackageName?: string;
  currentServiceType?: string;
  currentPlans?: CurrentPlan[];
  daysLeft?: number | null;
  variant?: "default" | "primary" | "urgent";
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const [selectedPackageId, setSelectedPackageId] = useState(currentPackageId ?? "");
  const [discountAmount, setDiscountAmount] = useState<number>(0);

  const pkg = packages.find((p) => p.id === selectedPackageId);
  const pkgAmount = pkg ? Number(pkg.amount) : 0;
  const effectivePrice = Math.max(0, pkgAmount - discountAmount);

  // The current plan of the SAME service as the selected package — with dual
  // memberships, renewing swim must show the swim plan, not the gym one
  const relevantPlan = pkg
    ? (currentPlans ?? []).find(
        (c) =>
          !c.serviceType ||
          !pkg.service_type ||
          c.serviceType === pkg.service_type ||
          c.serviceType === "both" ||
          pkg.service_type === "both"
      )
    : undefined;

  // mirror the server's auto start rules: renewals queue after the current
  // plan ends; add-ons / trials / day passes start today
  // impure date math lives in a lazy useState initializer (runs once per
  // mount) so the compiler keeps render pure
  const [todayStr] = useState(() => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10));
  const [minStart] = useState(
    () => new Date(Date.now() - 7 * 86400000 + 5.5 * 3600000).toISOString().slice(0, 10)
  );
  // owner/admin can backdate arbitrarily (recording real history); everyone
  // else keeps the 7-day guard — server re-checks regardless
  const { role } = useUser();
  const freeBackdate = canBackdateFreely(role);
  const isRenewalQueued = !!(
    pkg &&
    pkg.type === "membership" &&
    relevantPlan &&
    relevantPlan.endDate >= todayStr
  );
  const computedStart = isRenewalQueued ? relevantPlan.endDate : todayStr;
  // tracked per selected package so the value resets when the package
  // changes (the input used to remount via key for the same effect)
  const [startEdit, setStartEdit] = useState<{ pkgId: string; value: string }>({ pkgId: "", value: "" });
  const startStr = startEdit.pkgId === selectedPackageId && startEdit.value ? startEdit.value : computedStart;
  // mirror the server's end-date math for the already-expired hint
  const accessDays = pkg
    ? pkg.type === "day_pass" || pkg.type === "trial"
      ? pkg.duration_days - 1
      : pkg.duration_days
    : 0;
  let endFromStart: string | null = null;
  if (pkg && startStr) {
    const d = new Date(`${startStr}T00:00:00+05:30`);
    d.setDate(d.getDate() + accessDays);
    endFromStart = d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  }
  const alreadyEnded = !!(endFromStart && endFromStart < todayStr);

  let amount = 0;
  let gstAmount = 0;
  let totalAmount = 0;

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
  }

  const buttonClass =
    variant === "urgent"
      ? "whitespace-nowrap rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
      : variant === "primary"
        ? "whitespace-nowrap rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-blue-700"
        : "whitespace-nowrap rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50";

  return (
    <>
      {!isControlled && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={buttonClass}
        >
          {variant === "urgent" ? "Renew" : "Renew / Add Service"}
        </button>
      )}

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
              <h2 className="text-lg font-bold text-zinc-900">Renew / Add Service</h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {(currentPlans ?? []).length > 1 && (
              <p className="mb-2 text-xs text-zinc-500">
                Member has {currentPlans?.length} active plans — the current plan below follows the package you pick.
              </p>
            )}
            {(currentPlans ?? []).length > 0 && (
              <div className="mb-4 rounded-lg bg-blue-50 px-4 py-2 text-sm">
                {pkg ? (
                  relevantPlan ? (
                    (() => {
                      // running vs expired current plan — date-based, because
                      // daysUntil is -0 for plans that ended yesterday
                      const planRunning = relevantPlan.endDate >= todayStr;
                      const svc = relevantPlan.serviceType === "swimming" ? "Swim" : relevantPlan.serviceType === "both" ? "Gym+Swim" : "Gym";
                      return (
                        <>
                          <span className="text-blue-600">{planRunning ? "Current" : "Last"} {svc}: </span>
                          <span className="font-medium text-blue-900">{relevantPlan.name}</span>
                          <span className="ml-2 text-blue-500">
                            · {planRunning ? "ends" : "ended"} {formatDate(relevantPlan.endDate)}
                            {planRunning && relevantPlan.daysLeft <= 7 ? ` (${relevantPlan.daysLeft}d left)` : ""}
                          </span>
                          {pkg.type === "membership" && relevantPlan.serviceType === pkg.service_type && planRunning && (
                            <span className="ml-1 text-blue-400">— renewal queues after it</span>
                          )}
                          {pkg.type === "membership" && relevantPlan.serviceType === pkg.service_type && !planRunning && (
                            <span className="ml-1 text-blue-400">— expired, new plan starts today</span>
                          )}
                          {pkg.type !== "membership" && <span className="ml-1 text-blue-400">— starts today</span>}
                          {pkg.type === "membership" && relevantPlan.serviceType !== pkg.service_type && (
                            <span className="ml-1 text-blue-400">— add-on, starts today</span>
                          )}
                        </>
                      );
                    })()
                  ) : (
                    <span className="text-blue-600">
                      No current {pkg.service_type === "swimming" ? "swim" : pkg.service_type === "both" ? "combo" : "gym"} plan —
                      it will start today.
                    </span>
                  )
                ) : (
                  <span className="text-blue-600">
                    {currentPlans?.length} active plan{(currentPlans?.length ?? 0) === 1 ? "" : "s"}
                  </span>
                )}
              </div>
            )}

            <form action={renewMembership} className="space-y-4">
              <input type="hidden" name="member_id" value={memberId} />

              <div>
                <label className="block text-xs font-medium text-zinc-600">Start date *</label>
                <input
                  name="start_date"
                  type="date"
                  value={startStr}
                  min={freeBackdate ? undefined : minStart}
                  onChange={(e) => setStartEdit({ pkgId: selectedPackageId, value: e.target.value })}
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
                <p className="mt-1 text-xs text-zinc-400">
                  {isRenewalQueued
                    ? `Prefilled to queue after your current plan ends (${formatDate(computedStart)}).`
                    : "Prefilled to start today."}{" "}
                  {freeBackdate
                    ? "Adjust freely — you can backdate to record a member's real history."
                    : "Adjust only if the real start differs — backdating is capped at 7 days."}
                </p>
                {alreadyEnded && (
                  <p className="mt-1 text-xs font-medium text-amber-700">
                    Ends {formatDate(endFromStart!)} — already expired · record-keeping only
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600">Package *</label>
                <select
                  name="package_id"
                  required
                  value={selectedPackageId}
                  onChange={(e) => setSelectedPackageId(e.target.value)}
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                >
                  <option value="">Select a package...</option>
                  {(["gym", "swimming", "both"] as const).map((sk) => {
                    const groupPkgs = packages.filter((p) =>
                      sk === "gym" ? !p.service_type || p.service_type === "gym" : p.service_type === sk
                    );
                    if (groupPkgs.length === 0) return null;
                    return (
                      <optgroup key={sk} label={sk === "gym" ? "Gym" : sk === "swimming" ? "Swimming" : "Gym + Swimming"}>
                        {groupPkgs.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} — {formatCurrency(p.amount)} ({p.duration_days}d)
                          </option>
                        ))}
                      </optgroup>
                    );
                  })}
                </select>
              </div>

              {pkg && (
                <div className="rounded-lg bg-zinc-50 px-4 py-3">
                  <div className="flex justify-between text-sm">
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
                    <span className="text-zinc-900">Total Payable</span>
                    <span className="text-zinc-900">{formatCurrency(totalAmount)}</span>
                  </div>
                </div>
              )}

              {pkg && pkgAmount > 0 && (
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

              {pkg && (
                <p className="text-xs text-blue-600">
                  {pkg.type === "membership" && relevantPlan
                    ? `Renewal: new period starts ${formatDate(relevantPlan.endDate)} (after ${relevantPlan.name} ends).`
                    : pkg.type === "membership"
                      ? `Add-on: starts TODAY and runs alongside the current membership.`
                      : `Starts TODAY — trials and day passes don't queue behind running memberships.`}
                </p>
              )}

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-medium text-zinc-600">
                    Payment Amount {totalAmount === 0 && pkg && "(Free)"}
                  </label>
                  <input
                    key={`${selectedPackageId}-${discountAmount}`}
                    name="payment_amount"
                    type="number"
                    step="0.01"
                    min={0}
                    defaultValue={totalAmount.toFixed(2)}
                    disabled={totalAmount === 0 && !!pkg}
                    className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 disabled:bg-zinc-50 disabled:text-zinc-400"
                  />
                  <p className="mt-1 text-[11px] text-zinc-400">
                    Enter less than {formatCurrency(totalAmount)} for partial payment — the rest stays pending (collect later via Collect Payment).
                  </p>
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
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-zinc-600">Reference Note</label>
                  <input
                    name="reference_note"
                    className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    placeholder="UTR, transaction ID, etc."
                  />
                </div>
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
                  Renew Membership
                </SubmitButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

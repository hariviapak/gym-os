"use client";

import { useEffect, useState } from "react";
import { formatCurrency, todayIST } from "@/lib/utils";

interface PackageInfo {
  id: string;
  name: string;
  amount: number;
  duration_days: number;
  gst_rate: number;
  type: string;
  service_type: string;
  is_group_package: boolean;
}

interface MemberOption {
  id: string;
  first_name: string;
  last_name: string | null;
  phone: string;
}

interface TermsInfo {
  id: string;
  title: string;
  category: string;
}

interface GroupMember {
  key: string;
  id?: string;
  newMember?: { first_name: string; last_name: string; phone: string };
  name: string;
  phone: string;
  amount: number;
}

const SERVICE_GROUPS: Array<{ key: string; label: string }> = [
  { key: "gym", label: "Gym" },
  { key: "swimming", label: "Swimming" },
  { key: "both", label: "Gym + Swimming" },
];

export interface GroupState {
  isGroup: boolean;
  hasPackage: boolean;
  participantCount: number;
  splitValid: boolean;
  collectedValid: boolean;
}

export function PackagePaymentSection({
  packages,
  gstMode,
  members = [],
  terms = [],
  primaryMemberName = "",
  groupStateRef,
}: {
  packages: PackageInfo[];
  gstMode: string;
  members?: MemberOption[];
  terms?: TermsInfo[];
  primaryMemberName?: string;
  groupStateRef?: { current: GroupState };
}) {
  const [selectedPackageId, setSelectedPackageId] = useState<string>("");
  const [discountAmount, setDiscountAmount] = useState<number>(0);
  const [groupSearch, setGroupSearch] = useState("");
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [splitEdited, setSplitEdited] = useState(false);
  const [addMode, setAddMode] = useState<"existing" | "new">("existing");
  const [quickFirst, setQuickFirst] = useState("");
  const [quickLast, setQuickLast] = useState("");
  const [quickPhone, setQuickPhone] = useState("");
  const [quickLookupResult, setQuickLookupResult] = useState<{ forDigits: string; name: string | null } | null>(null);
  const [groupCollected, setGroupCollected] = useState("");
  const [receiptMode, setReceiptMode] = useState<"group" | "individual">("group");
  const [groupBillName, setGroupBillName] = useState("");

  const pkg = packages.find((p) => p.id === selectedPackageId);
  const pkgAmount = pkg ? Number(pkg.amount) : 0;
  const effectivePrice = Math.max(0, pkgAmount - discountAmount);

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

  const isGroupPkg = !!pkg?.is_group_package;
  const allParticipants = isGroupPkg
    ? [{ id: "__primary__", name: primaryMemberName || "New member", phone: "", amount: 0 }, ...groupMembers]
    : [];
  const participantCount = allParticipants.length;
  const defaultShare = participantCount > 0 ? Math.round((totalAmount / participantCount) * 100) / 100 : 0;

  // Split: even by default; when edited, primary member absorbs the remainder
  const shares: number[] = allParticipants.map((_, i) => {
    if (!splitEdited) {
      if (i === 0 && participantCount > 1) {
        return Math.round((totalAmount - defaultShare * (participantCount - 1)) * 100) / 100;
      }
      return defaultShare;
    }
    if (i === 0) {
      const others = groupMembers.reduce((s, g) => s + (g.amount || 0), 0);
      return Math.round((totalAmount - others) * 100) / 100;
    }
    return groupMembers[i - 1].amount || 0;
  });

  const sharesSum = shares.reduce((a, b) => a + b, 0);
  const splitValid = !isGroupPkg || participantCount < 2 || Math.abs(sharesSum - totalAmount) < 0.01;

  // Amount collected now (defaults to the full total). Anything not collected
  // stays pending and is distributed across members in order.
  const collected =
    isGroupPkg ? (groupCollected === "" ? totalAmount : Math.max(0, parseFloat(groupCollected) || 0)) : 0;
  const collectedValid = !isGroupPkg || collected <= totalAmount + 0.01;
  let remaining = collected;
  const paidPreview = shares.map((s) => {
    const paid = Math.min(s, remaining);
    remaining = Math.round((remaining - paid) * 100) / 100;
    return Math.round(paid * 100) / 100;
  });

  useEffect(() => {
    if (groupStateRef) {
      groupStateRef.current = {
        isGroup: isGroupPkg,
        hasPackage: !!pkg,
        participantCount,
        splitValid,
        collectedValid,
      };
    }
  }, [isGroupPkg, !!pkg, participantCount, splitValid, collectedValid, groupStateRef]);

  // Terms relevant to the selected package's service
  const relevantTerms = pkg
    ? (terms ?? []).filter((t) =>
        pkg.service_type === "swimming"
          ? t.category === "swimming"
          : pkg.service_type === "both"
            ? true
            : t.category === "gym"
      )
    : [];

  // Warn when the quick-added phone already exists (admin decides; adding
  // still works and creates a separate member — phone is not identity)
  const quickDigits = quickPhone.replace(/\D/g, "");
  const quickLookup = quickDigits.length >= 10 ? quickDigits : null;
  const quickPhoneOwner =
    quickLookup && quickLookupResult?.forDigits === quickLookup ? quickLookupResult.name : null;

  useEffect(() => {
    if (!quickLookup) return;
    const d = quickLookup;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/members/lookup?phone=${encodeURIComponent(d)}`);
        const data = await res.json();
        setQuickLookupResult({ forDigits: d, name: data.found ? data.member?.name ?? null : null });
      } catch {
        setQuickLookupResult({ forDigits: d, name: null });
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [quickLookup]);

  const memberResults = (members ?? []).filter((m) => {
    if (!groupSearch.trim()) return false;
    const q = groupSearch.toLowerCase();
    return (
      (m.first_name?.toLowerCase().includes(q) ||
        m.last_name?.toLowerCase().includes(q) ||
        m.phone?.includes(q.replace(/\D/g, ""))) &&
      !groupMembers.some((g) => g.id === m.id)
    );
  });

  const addGroupMember = (m: MemberOption) => {
    setGroupMembers((prev) => [
      ...prev,
      { key: m.id, id: m.id, name: [m.first_name, m.last_name].filter(Boolean).join(" "), phone: m.phone, amount: 0 },
    ]);
    setGroupSearch("");
  };

  const addQuickMember = () => {
    if (!quickFirst.trim() || !quickPhone.replace(/\D/g, "")) return;
    setGroupMembers((prev) => [
      ...prev,
      {
        key: `new-${Date.now()}-${prev.length}`,
        name: [quickFirst, quickLast].filter(Boolean).join(" "),
        phone: quickPhone,
        newMember: { first_name: quickFirst, last_name: quickLast, phone: quickPhone },
        amount: 0,
      },
    ]);
    setQuickFirst("");
    setQuickLast("");
    setQuickPhone("");
  };

  const removeGroupMember = (key: string) => {
    setGroupMembers((prev) => prev.filter((g) => g.key !== key));
  };

  const updateShare = (index: number, value: number) => {
    setSplitEdited(true);
    if (index === 0) return; // primary absorbs remainder
    setGroupMembers((prev) =>
      prev.map((g, i) => (i === index - 1 ? { ...g, amount: Math.max(0, value) } : g))
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-medium text-zinc-600">Package *</label>
        <select
          name="package_id"
          required
          value={selectedPackageId}
          onChange={(e) => {
            const next = packages.find((p) => p.id === e.target.value);
            setSelectedPackageId(e.target.value);
            setDiscountAmount(0);
            // Keep group members when switching between family packages —
            // the split recalculates for the new total automatically.
            if (!next?.is_group_package) {
              setGroupMembers([]);
              setSplitEdited(false);
            }
          }}
          className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        >
          <option value="">Select a package...</option>
          {SERVICE_GROUPS.map((sg) => {
            const groupPkgs = packages.filter((p) =>
              sg.key === "gym" ? p.service_type === "gym" : p.service_type === sg.key
            );
            if (groupPkgs.length === 0) return null;
            return (
              <optgroup key={sg.key} label={sg.label}>
                {groupPkgs.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {formatCurrency(p.amount)} ({p.duration_days}d){p.is_group_package ? " · Family" : ""}
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
            <span className="text-zinc-900">{isGroupPkg ? "Group Total" : "Total Payable"}</span>
            <span className="text-zinc-900">{formatCurrency(totalAmount)}</span>
          </div>
        </div>
      )}

      {/* Group members panel for family/group packages */}
      {isGroupPkg && (
        <div className="space-y-4 rounded-lg border border-violet-200 bg-violet-50/50 p-4">
          <div>
            <p className="text-sm font-semibold text-violet-900">
              Group members ({participantCount}){participantCount < 2 && " — add at least 1 more"}
            </p>
            <p className="mt-0.5 text-xs text-violet-700">
              The new member is included automatically. Add existing members or create new ones (e.g. spouse, kids).
            </p>
          </div>

          {/* Add: existing / new toggle */}
          <div className="flex gap-1 rounded-lg bg-white p-1 ring-1 ring-violet-200 w-fit">
            <button
              type="button"
              onClick={() => setAddMode("existing")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                addMode === "existing" ? "bg-violet-600 text-white" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              Existing member
            </button>
            <button
              type="button"
              onClick={() => setAddMode("new")}
              className={`rounded-md px-3 py-1.5 text-xs font-medium transition ${
                addMode === "new" ? "bg-violet-600 text-white" : "text-zinc-600 hover:bg-zinc-100"
              }`}
            >
              + New member
            </button>
          </div>

          {addMode === "existing" ? (
            <div>
              <input
                value={groupSearch}
                onChange={(e) => setGroupSearch(e.target.value)}
                className="block w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                placeholder="Search by name or phone..."
              />
              {memberResults.length > 0 && (
                <div className="mt-1 max-h-40 overflow-auto rounded-lg border border-violet-200 bg-white">
                  {memberResults.slice(0, 8).map((m) => (
                    <button
                      type="button"
                      key={m.id}
                      onClick={() => addGroupMember(m)}
                      className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-violet-50"
                    >
                      <span className="font-medium text-zinc-900">
                        {[m.first_name, m.last_name].filter(Boolean).join(" ")}
                      </span>
                      <span className="text-xs text-zinc-400">{m.phone}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-2 rounded-lg bg-white p-3 ring-1 ring-violet-200 sm:grid-cols-3">
              <input
                value={quickFirst}
                onChange={(e) => setQuickFirst(e.target.value)}
                placeholder="First name *"
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
              <input
                value={quickLast}
                onChange={(e) => setQuickLast(e.target.value)}
                placeholder="Last name"
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
              <div className="flex gap-2">
                <input
                  value={quickPhone}
                  onChange={(e) => setQuickPhone(e.target.value)}
                  placeholder="Phone *"
                  className="w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
                <button
                  type="button"
                  onClick={addQuickMember}
                  disabled={!quickFirst.trim() || !quickPhone.replace(/\D/g, "")}
                  className="shrink-0 rounded-lg bg-violet-600 px-3 text-xs font-semibold text-white transition hover:bg-violet-700 disabled:bg-zinc-200 disabled:text-zinc-400"
                >
                  Add
                </button>
              </div>
              {quickPhoneOwner && (
                <p className="col-span-1 rounded-lg bg-amber-50 px-3 py-1.5 text-[11px] text-amber-800 ring-1 ring-amber-200 sm:col-span-3">
                  This phone is already used by <strong>{quickPhoneOwner}</strong>. If that&apos;s this person, add them
                  from the &quot;Existing member&quot; tab — adding here creates a <strong>separate new member</strong>.
                </p>
              )}
            </div>
          )}

          {/* Split editor */}
          {participantCount >= 2 && (
            <div className="mt-3 space-y-1.5">
              <div className="flex items-center justify-between text-xs font-medium text-violet-700">
                <span>Payment split (even by default)</span>
                <span className={splitValid ? "" : "text-red-600"}>
                  {formatCurrency(sharesSum)} / {formatCurrency(totalAmount)}
                </span>
              </div>
              {allParticipants.map((p, i) => (
                <div key={p.id} className="flex items-center gap-2">
                  <span className="flex-1 truncate text-sm text-zinc-800">
                    {p.name}
                    {i === 0 && <span className="ml-1 text-xs text-zinc-400">(new)</span>}
                    {i > 0 && groupMembers[i - 1]?.newMember && (
                      <span className="ml-1 rounded bg-green-50 px-1 py-px text-[9px] font-semibold uppercase text-green-700">new</span>
                    )}
                  </span>
                  {i > 0 && (
                    <button
                      type="button"
                      onClick={() => removeGroupMember(groupMembers[i - 1].key)}
                      className="text-xs text-zinc-400 hover:text-red-600"
                    >
                      ✕
                    </button>
                  )}
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-zinc-400">₹</span>
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      value={shares[i]}
                      disabled={i === 0}
                      onChange={(e) => updateShare(i, parseFloat(e.target.value) || 0)}
                      className="w-24 rounded-md border border-violet-200 bg-white px-2 py-1 text-sm focus:border-violet-500 focus:outline-none disabled:bg-violet-50 disabled:text-violet-500"
                    />
                    {paidPreview[i] !== shares[i] && (
                      <span className="text-[10px] text-zinc-400">→ {formatCurrency(paidPreview[i])} paid</span>
                    )}
                  </div>
                </div>
              ))}
              {!splitValid && (
                <p className="text-xs font-medium text-red-600">
                  Split must add up to {formatCurrency(totalAmount)}. The new member absorbs the remainder automatically.
                </p>
              )}
            </div>
          )}

          {/* Amount collected now (pending support) */}
          {participantCount >= 2 && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-medium text-violet-700">Amount collected now (₹)</label>
                <input
                  type="number"
                  step="0.01"
                  min={0}
                  max={totalAmount}
                  value={groupCollected}
                  onChange={(e) => setGroupCollected(e.target.value)}
                  placeholder={totalAmount.toFixed(2)}
                  className="mt-1 block w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
                <input type="hidden" name="group_amount_collected" value={collected.toFixed(2)} />
                <p className="mt-1 text-[11px] text-zinc-500">
                  {collected >= totalAmount
                    ? "Fully paid"
                    : `Leaves ${formatCurrency(Math.max(0, totalAmount - collected))} pending`}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-violet-700">Receipt</label>
                <div className="mt-1 space-y-1">
                  <label className="flex items-center gap-2 text-xs text-zinc-700">
                    <input
                      type="radio"
                      name="group_receipt_mode"
                      value="group"
                      checked={receiptMode === "group"}
                      onChange={() => setReceiptMode("group")}
                      className="accent-violet-600"
                    />
                    One receipt for the whole group
                  </label>
                  <label className="flex items-center gap-2 text-xs text-zinc-700">
                    <input
                      type="radio"
                      name="group_receipt_mode"
                      value="individual"
                      checked={receiptMode === "individual"}
                      onChange={() => setReceiptMode("individual")}
                      className="accent-violet-600"
                    />
                    Individual receipt per member ({participantCount})
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Name on the group receipt */}
          {participantCount >= 2 && receiptMode === "group" && (
            <div>
              <label className="block text-xs font-medium text-violet-700">Name on receipt (Billed To)</label>
              <input
                name="group_bill_name"
                value={groupBillName}
                onChange={(e) => setGroupBillName(e.target.value)}
                placeholder={`${primaryMemberName || "Family"} & Family`}
                className="mt-1 block w-full rounded-lg border border-violet-200 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
              <p className="mt-1 text-[11px] text-zinc-400">
                e.g. &quot;Verma Family&quot; — the receipt shows this name with a per-member breakdown.
              </p>
            </div>
          )}

          {/* hidden payload for the server action */}
          <input
            type="hidden"
            name="group_members"
            value={
              isGroupPkg && participantCount >= 2
                ? JSON.stringify(
                    allParticipants.map((p, i) =>
                      p.id === "__primary__"
                        ? { id: null, new: null, amount: shares[i] }
                        : { id: p.id ?? null, new: groupMembers[i - 1]?.newMember ?? null, amount: shares[i] }
                    )
                  )
                : ""
            }
          />
        </div>
      )}

      {pkg && pkgAmount > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-zinc-600">Discount Amount (optional)</label>
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
          <label className="block text-xs font-medium text-zinc-600">Membership Start Date *</label>
          <input
            name="start_date"
            type="date"
            defaultValue={todayIST()}
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
          <p className="mt-1 text-xs text-zinc-400">Set actual start date for existing members.</p>
        </div>
        {!isGroupPkg && (
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
          </div>
        )}
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
        <div className="sm:col-span-2">
          <label className="block text-xs font-medium text-zinc-600">Bill To (optional)</label>
          <input
            name="billed_to"
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            placeholder="e.g. Rajesh Kumar (father) — if someone other than the member pays / needs the receipt in their name"
          />
          <p className="mt-1 text-xs text-zinc-400">
            The receipt shows this name as &quot;Billed To&quot; along with the member. Leave empty to bill the member.
          </p>
        </div>
      </div>

      {pkg && relevantTerms.length > 0 && (
        <div className="rounded-lg bg-blue-50 px-3 py-2">
          <p className="text-xs text-blue-700">
            After enrollment, this member signs ({pkg.service_type === "swimming" ? "Swimming Pool Rules" : pkg.service_type === "both" ? "Gym T&C + Swimming Pool Rules" : "Gym T&C"}):
          </p>
          <ul className="mt-1.5 space-y-0.5">
            {relevantTerms.map((t) => (
              <li key={t.id} className="text-xs text-blue-700">
                • <strong>{t.title}</strong>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

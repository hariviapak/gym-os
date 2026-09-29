"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import {
  formatDate,
  formatCurrency,
  daysUntil,
  serviceLabel,
  buildWhatsAppUrl,
} from "@/lib/utils";
import { MemberAvatar } from "@/components/members/member-avatar";
import { RenewalModal } from "@/components/members/renewal-modal";
import { ExtendModal } from "@/components/members/extend-modal";
import { CancelMembershipModal } from "@/components/members/cancel-membership-modal";
import { PopoverMenu } from "@/components/ui/popover-menu";

export interface MemberPlan {
  id: string;
  serviceType: string;
  name: string;
  endDate: string;
  daysLeft: number;
  amountPaid: number;
  paymentStatus: string;
}

export interface MemberRow {
  id: string;
  firstName: string;
  lastName: string | null;
  phone: string;
  photoUrl: string | null;
  groupName: string | null;
  plans: MemberPlan[];
  morePlans: number;
  payment: { due: number; paidCount: number; pendingCount: number };
  expiry: { date: string; days: number } | null;
  status: { label: string; cls: string };
  flags: { isExpiring: boolean; isExpired: boolean; hasDue: boolean; hasActive: boolean };
}

interface MembersTableProps {
  rows: MemberRow[];
  packages: any[];
  gstMode: string;
  sortCol: string;
  sortOrder: string;
  baseParams: Record<string, string | undefined>;
}

export function MembersTable({ rows, packages, gstMode, sortCol, sortOrder, baseParams }: MembersTableProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [copied, setCopied] = useState(false);
  const [showReminders, setShowReminders] = useState(false);

  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const toggleAll = () => {
    if (selected.size === rows.length) setSelected(new Set());
    else setSelected(new Set(rows.map((r) => r.id)));
  };

  const selectedRows = rows.filter((r) => selected.has(r.id));

  const copyPhones = async () => {
    const phones = selectedRows.map((r) => r.phone).filter(Boolean).join(", ");
    try {
      await navigator.clipboard.writeText(phones);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard unavailable
    }
  };

  const exportSelected = () => {
    const header = "Name,Phone,Status,Memberships,Payment,Expiry,Group\n";
    const lines = selectedRows.map((r) =>
      [
        name(r),
        r.phone,
        r.status.label,
        r.plans.map((p) => p.name).join(" | "),
        r.payment.due > 0 ? `${formatCurrency(r.payment.due)} due` : r.plans.length ? "Paid" : "—",
        r.expiry ? r.expiry.date : "",
        r.groupName ?? "",
      ]
        .map((v) => `"${String(v).replaceAll('"', '""')}"`)
        .join(",")
    );
    const blob = new Blob([header + lines.join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "members.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const sortLink = (col: string, label: string) => {
    const newOrder = sortCol === col && sortOrder === "asc" ? "desc" : "asc";
    const p = new URLSearchParams(
      Object.entries(baseParams).filter(([, v]) => v !== undefined) as [string, string][]
    );
    p.set("sort", col);
    p.set("order", newOrder);
    return (
      <Link href={`/dashboard/members?${p.toString()}`} className="flex items-center gap-1 hover:text-zinc-900">
        {label} {sortCol === col && (sortOrder === "asc" ? "↑" : "↓")}
      </Link>
    );
  };

  const name = (r: MemberRow) => [r.firstName, r.lastName].filter(Boolean).join(" ");

  return (
    <>
      {/* Bulk bar */}
      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl bg-zinc-900 px-4 py-3 text-sm text-white">
          <span className="font-semibold">{selected.size} selected</span>
          <button onClick={copyPhones} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium transition hover:bg-white/20">
            {copied ? "Copied!" : "Copy Phones"}
          </button>
          <button onClick={() => setShowReminders(true)} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium transition hover:bg-white/20">
            WhatsApp Reminders
          </button>
          <button onClick={exportSelected} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-medium transition hover:bg-white/20">
            Export Selected
          </button>
          <button onClick={() => setSelected(new Set())} className="ml-auto text-xs text-zinc-300 transition hover:text-white">
            Clear selection
          </button>
        </div>
      )}

      {/* Reminders modal */}
      {showReminders && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-zinc-900">Send Renewal Reminders</h3>
              <button onClick={() => setShowReminders(false)} className="text-sm text-zinc-400 transition hover:text-zinc-900">
                Done
              </button>
            </div>
            <p className="mb-3 text-xs text-zinc-500">
              Click each member to open their WhatsApp chat with a pre-filled renewal reminder.
            </p>
            <div className="divide-y divide-zinc-100">
              {selectedRows.map((r) => {
                const plan = r.plans[0];
                const message = r.flags.isExpired
                  ? `Hi ${r.firstName}, your ${plan?.name ?? "membership"} has expired. Renew to continue your training!`
                  : `Hi ${r.firstName}, your ${plan?.name ?? "membership"} expires on ${formatDate(r.expiry?.date ?? "")} (${r.expiry?.days ?? 0} days left). Renew soon to keep your streak going!`;
                return (
                  <div key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-900">{name(r)}</p>
                      <p className="text-xs text-zinc-400">{r.phone}</p>
                    </div>
                    <a
                      href={buildWhatsAppUrl(r.phone, message)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-emerald-700"
                    >
                      Open Chat
                    </a>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-xl bg-white ring-1 ring-zinc-200/60 lg:block">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50/50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
              <th className="w-10 px-4 py-3">
                <input
                  type="checkbox"
                  checked={rows.length > 0 && selected.size === rows.length}
                  onChange={toggleAll}
                  className="h-4 w-4 rounded border-zinc-300 accent-zinc-900"
                  aria-label="Select all"
                />
              </th>
              <th className="px-4 py-3">{sortLink("first_name", "Member")}</th>
              <th className="px-4 py-3">Memberships</th>
              <th className="px-4 py-3">Payment</th>
              <th className="px-4 py-3">{sortLink("end_date", "Expiry")}</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-zinc-400">
                  No members found.{" "}
                  <Link href="/dashboard/members/new" className="font-medium text-zinc-900 underline">
                    Enroll a new member
                  </Link>
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className={`transition hover:bg-zinc-50 ${selected.has(r.id) ? "bg-zinc-50" : ""}`}>
                  <td className="px-4 py-2.5">
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      className="h-4 w-4 rounded border-zinc-300 accent-zinc-900"
                      aria-label={`Select ${name(r)}`}
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <Link href={`/dashboard/members/${r.id}`} className="flex items-center gap-2.5 hover:underline">
                      <MemberAvatar firstName={r.firstName} lastName={r.lastName} photoUrl={r.photoUrl} size="xs" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-zinc-900">{name(r)}</span>
                        <span className="block text-xs text-zinc-400">{r.phone}</span>
                      </span>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">
                    {r.plans.length === 0 ? (
                      <span className="text-xs text-zinc-400">—</span>
                    ) : (
                      <div className="space-y-0.5">
                        {r.plans.slice(0, 2).map((p) => (
                          <div key={p.id} className="flex items-center gap-1.5 whitespace-nowrap">
                            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-blue-700">
                              {serviceLabel(p.serviceType)}
                            </span>
                            <span className="text-xs text-zinc-700">{p.name}</span>
                          </div>
                        ))}
                        {r.plans.length > 2 && (
                          <span className="text-xs text-zinc-400">+{r.plans.length - 2} more</span>
                        )}
                      </div>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-sm">
                    {r.payment.due > 0.01 ? (
                      <span className="font-semibold text-amber-700">
                        {formatCurrency(r.payment.due)} due
                        {r.payment.paidCount > 0 && (
                          <span className="ml-1 font-normal text-zinc-400">· {r.payment.paidCount} paid</span>
                        )}
                      </span>
                    ) : r.payment.pendingCount > 0 ? (
                      <span className="text-amber-600">Pending</span>
                    ) : r.payment.paidCount > 0 ? (
                      <span className="text-zinc-400">Paid</span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-sm">
                    {r.expiry ? (
                      <span className={r.expiry.days <= 0 ? "text-red-600" : r.expiry.days <= 3 ? "text-orange-600" : "text-zinc-600"}>
                        {formatDate(r.expiry.date)}
                        <span className="ml-1 text-xs text-zinc-400">{r.expiry.days}d</span>
                      </span>
                    ) : (
                      <span className="text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.status.cls}`}>{r.status.label}</span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <RowAction row={r} packages={packages} gstMode={gstMode} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Mobile / tablet cards */}
      <div className="space-y-2 lg:hidden">
        {rows.length === 0 ? (
          <div className="rounded-xl bg-white p-6 text-center ring-1 ring-zinc-200/60">
            <p className="text-sm text-zinc-400">No members found.</p>
          </div>
        ) : (
          rows.map((r) => (
            <div key={r.id} className="rounded-xl bg-white p-3 ring-1 ring-zinc-200/60">
              <div className="flex items-center gap-3">
                <Link href={`/dashboard/members/${r.id}`}>
                  <MemberAvatar firstName={r.firstName} lastName={r.lastName} photoUrl={r.photoUrl} size="sm" />
                </Link>
                <Link href={`/dashboard/members/${r.id}`} className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-zinc-900">
                    {name(r)}
                    {r.groupName && <span className="ml-1.5 text-[10px] font-medium text-violet-600">{r.groupName}</span>}
                  </p>
                  <p className="truncate text-xs text-zinc-400">
                    {r.phone}
                    {r.plans[0] && ` · ${r.plans[0].name}`}
                    {r.plans.length > 1 && ` +${r.plans.length - 1}`}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${r.status.cls}`}>{r.status.label}</span>
                    {r.payment.due > 0.01 && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
                        {formatCurrency(r.payment.due)} due
                      </span>
                    )}
                    {r.expiry && (
                      <span className="text-[10px] text-zinc-400">
                        {r.expiry.days <= 0 ? "expired" : `${r.expiry.days}d`} · {formatDate(r.expiry.date)}
                      </span>
                    )}
                  </div>
                </Link>
              </div>
              <div className="mt-2 flex justify-end">
                <RowAction row={r} packages={packages} gstMode={gstMode} />
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

// ONE contextual action per row: urgent → Renew/Collect, otherwise Manage ▾
function RowAction({ row, packages, gstMode }: { row: MemberRow; packages: any[]; gstMode: string }) {
  const [activeModal, setActiveModal] = useState<"renew" | "extend" | "cancel" | null>(null);

  const currentPlans = row.plans.map((p) => ({
    id: p.id,
    serviceType: p.serviceType,
    name: p.name,
    endDate: p.endDate,
    daysLeft: p.daysLeft,
  }));

  const openModal = (m: "renew" | "extend" | "cancel") => {
    setActiveModal(m);
  };

  const menuButton =
    "block w-full whitespace-nowrap px-3 py-1.5 text-left text-xs text-zinc-700 transition hover:bg-zinc-50";

  return (
    <div className="relative inline-block text-left">
      {/* Urgent contextual button */}
      {row.flags.isExpiring || row.flags.isExpired ? (
        <button
          type="button"
          onClick={() => openModal("renew")}
          className="whitespace-nowrap rounded-lg bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800"
        >
          Renew
        </button>
      ) : row.flags.hasDue ? (
        <Link
          href={`/dashboard/payments/new?member_id=${row.id}`}
          className="whitespace-nowrap rounded-lg bg-amber-600 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-amber-700"
        >
          Collect
        </Link>
      ) : (
        <PopoverMenu
          panelClassName="w-52"
          trigger={({ toggle }) => (
            <button
              type="button"
              onClick={toggle}
              className="whitespace-nowrap rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50"
            >
              Manage ▾
            </button>
          )}
        >
          <div>
            <Link href={`/dashboard/members/${row.id}`} className={`${menuButton} font-semibold`}>
              Open profile
            </Link>
            <button type="button" onClick={() => openModal("renew")} className={menuButton}>
              Renew / Add Service
            </button>
            {row.flags.hasActive && (
              <button type="button" onClick={() => openModal("extend")} className={menuButton}>
                Extend
              </button>
            )}
            {row.flags.hasDue && (
              <Link href={`/dashboard/payments/new?member_id=${row.id}`} className={menuButton}>
                Collect Payment
              </Link>
            )}
            {row.flags.hasActive && (
              <button type="button" onClick={() => openModal("cancel")} className={menuButton}>
                Cancel Membership…
              </button>
            )}
            <div className="my-1 border-t border-zinc-100" />
            <Link href={`/dashboard/members/${row.id}#freeze`} className={menuButton}>
              Freeze / Unfreeze
            </Link>
          </div>
        </PopoverMenu>
      )}

      {/* urgent rows still get full access via a small chevron */}
      {(row.flags.isExpiring || row.flags.isExpired || row.flags.hasDue) && (
        <PopoverMenu
          panelClassName="w-52"
          trigger={({ toggle }) => (
            <button
              type="button"
              onClick={toggle}
              className="ml-1 whitespace-nowrap rounded-lg border border-zinc-300 px-2.5 py-2 text-xs text-zinc-500 transition hover:bg-zinc-50"
              title="More actions"
            >
              ▾
            </button>
          )}
        >
          <div>
            <Link href={`/dashboard/members/${row.id}`} className={`${menuButton} font-semibold`}>
              Open profile
            </Link>
            <button type="button" onClick={() => openModal("renew")} className={menuButton}>
              Renew / Add Service
            </button>
            {row.flags.hasActive && (
              <button type="button" onClick={() => openModal("extend")} className={menuButton}>
                Extend
              </button>
            )}
            {row.flags.hasDue && (
              <Link href={`/dashboard/payments/new?member_id=${row.id}`} className={menuButton}>
                Collect Payment
              </Link>
            )}
            {row.flags.hasActive && (
              <button type="button" onClick={() => openModal("cancel")} className={menuButton}>
                Cancel Membership…
              </button>
            )}
            <div className="my-1 border-t border-zinc-100" />
            <Link href={`/dashboard/members/${row.id}#freeze`} className={menuButton}>
              Freeze / Unfreeze
            </Link>
          </div>
        </PopoverMenu>
      )}

      {/* Modals — controlled, opened from the menu / urgent button */}
      {activeModal === "renew" && (
        <RenewalModal
          memberId={row.id}
          packages={packages}
          gstMode={gstMode}
          currentPlans={currentPlans}
          variant="default"
          forceOpen
          onClose={() => setActiveModal(null)}
        />
      )}
      {activeModal === "extend" && (
        <ExtendModal
          memberId={row.id}
          currentPlans={currentPlans.map((p) => ({ id: p.id, name: p.name, serviceType: p.serviceType, endDate: p.endDate }))}
          forceOpen
          onClose={() => setActiveModal(null)}
        />
      )}
      {activeModal === "cancel" && row.plans[0] && (
        <CancelMembershipModal
          membershipId={row.plans[0].id}
          packageName={row.plans[0].name}
          amountPaid={row.plans[0].amountPaid}
          forceOpen
          onClose={() => setActiveModal(null)}
        />
      )}
    </div>
  );
}

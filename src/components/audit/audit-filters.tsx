"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DateFilterPill } from "@/components/ui/date-filter-pill";

export function AuditFilters({ entityType, from, to }: { entityType: string; from: string; to: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const apply = (key: string, value: string) => {
    const p = new URLSearchParams(Array.from(params.entries()));
    if (value && value !== "all") p.set(key, value);
    else p.delete(key);
    p.delete("page");
    startTransition(() => {
      router.replace(p.size ? `?${p.toString()}` : "?", { scroll: false });
    });
  };

  const selectCls =
    "rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900";

  return (
    <div className={`flex flex-wrap items-center gap-2 transition-opacity ${pending ? "opacity-70" : ""}`} aria-busy={pending}>
      <select defaultValue={entityType} onChange={(e) => apply("entity_type", e.target.value)} className={selectCls}>
        <option value="all">All Entities</option>
        <option value="members">Members</option>
        <option value="memberships">Memberships</option>
        <option value="payments">Payments</option>
        <option value="receipts">Receipts</option>
        <option value="packages">Packages</option>
        <option value="users">Users</option>
        <option value="gyms">Gyms</option>
      </select>
      <DateFilterPill param="from" label="From" onApply={(v) => apply("from", v)} />
      <DateFilterPill param="to" label="To" onApply={(v) => apply("to", v)} />
      {(entityType !== "all" || from || to) && (
        <button
          type="button"
          onClick={() => startTransition(() => router.replace("?", { scroll: false }))}
          className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-500 transition hover:bg-zinc-50"
        >
          Clear
        </button>
      )}
      {pending && <span className="text-xs font-medium text-zinc-500">Updating…</span>}
    </div>
  );
}

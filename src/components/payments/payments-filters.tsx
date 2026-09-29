"use client";

import { useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SearchInput } from "@/components/ui/search-input";
import { DateFilterPill } from "@/components/ui/date-filter-pill";

// Payments filters: debounced search + auto-applying mode/date pills
export function PaymentsFilters({ defaultMode }: { defaultMode: string }) {
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
    <div className={`flex flex-wrap items-center gap-2 transition-opacity ${pending ? "opacity-60" : ""}`} aria-busy={pending}>
      <div className="min-w-[220px] flex-1">
        <SearchInput placeholder="Search by reference, phone, or member…" />
      </div>
      <select
        defaultValue={defaultMode}
        onChange={(e) => apply("mode", e.target.value)}
        className={selectCls}
      >
        <option value="all">All Modes</option>
        <option value="cash">Cash</option>
        <option value="upi">UPI</option>
        <option value="card">Card</option>
        <option value="bank_transfer">Bank Transfer</option>
      </select>
      <DateFilterPill param="from" label="From" onApply={(v) => apply("from", v)} />
      <DateFilterPill param="to" label="To" onApply={(v) => apply("to", v)} />
      {pending && (
        <span className="text-xs font-medium text-zinc-500">Updating…</span>
      )}
    </div>
  );
}

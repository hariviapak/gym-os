"use client";

import { useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SearchInput } from "@/components/ui/search-input";

const statusTabs = [
  { label: "All", value: "all" },
  { label: "Active", value: "active" },
  { label: "Expiring", value: "expiring" },
  { label: "Frozen", value: "frozen" },
  { label: "Cancelled", value: "cancelled" },
  { label: "Deactivated", value: "deactivated" },
  { label: "Blacklisted", value: "blacklisted" },
];

const expiryTabs = [
  { label: "All", value: "all" },
  { label: "Expired", value: "expired" },
  { label: "This Week", value: "week" },
  { label: "This Month", value: "month" },
];

// Members filters: every tap runs in a non-blocking transition with an
// optimistic active chip, so buttons respond instantly on mobile networks.
// Chip rows scroll horizontally on mobile (no wrapping walls of buttons).
export function MemberSearch() {
  const router = useRouter();
  const params = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [tap, setTap] = useState<{ key: string; value: string } | null>(null);

  // clear the optimistic chip when the transition commits (render-phase
  // reset — no effect, no cascading renders)
  const [prevPending, setPrevPending] = useState(isPending);
  if (prevPending !== isPending) {
    setPrevPending(isPending);
    if (!isPending) setTap(null);
  }

  function updateParam(key: string, value: string) {
    const current = new URLSearchParams(Array.from(params.entries()));
    if (value && value !== "all") {
      current.set(key, value);
    } else {
      current.delete(key);
    }
    current.delete("page");
    setTap({ key, value });
    startTransition(() => {
      router.replace(`/dashboard/members?${current.toString()}`, { scroll: false });
    });
  }

  // search input is debounced + transition-based (SearchInput)

  const statusFilter = tap?.key === "status" ? tap.value : params.get("status") ?? "all";
  const expiryFilter = tap?.key === "filter" ? tap.value : params.get("filter") ?? "all";
  const query = params.get("q") ?? "";

  const rowCls =
    "flex gap-1.5 overflow-x-auto px-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-wrap md:overflow-x-visible md:px-0";

  const chip = (active: boolean) =>
    `shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition ${
      active
        ? "bg-zinc-900 text-white"
        : "bg-white text-zinc-500 ring-1 ring-zinc-200/60 hover:bg-zinc-50"
    }`;

  return (
    <div className="space-y-2.5">
      <SearchInput defaultValue={query} placeholder="Search by name or phone..." />

      <div className={`space-y-2 transition-opacity ${isPending ? "opacity-70" : ""}`} aria-busy={isPending}>
        <div className="flex items-center gap-2">
          <span className="hidden shrink-0 text-xs font-medium text-zinc-400 md:inline">Status:</span>
          <div className={rowCls}>
            {statusTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => updateParam("status", tab.value)}
                className={chip(statusFilter === tab.value)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden shrink-0 text-xs font-medium text-zinc-400 md:inline">Expiry:</span>
          <div className={rowCls}>
            {expiryTabs.map((tab) => (
              <button
                key={tab.value}
                type="button"
                onClick={() => updateParam("filter", tab.value)}
                className={chip(expiryFilter === tab.value)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {isPending && <p className="text-xs font-medium text-zinc-500">Updating…</p>}
      </div>
    </div>
  );
}

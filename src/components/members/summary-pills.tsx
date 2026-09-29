"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// Members summary strip as instant transition buttons (was: plain links with
// no pending feedback — felt dead on slow networks).
export function SummaryPills({
  stats,
  count,
  statusFilter,
}: {
  stats: any;
  count?: number | null;
  statusFilter: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [tap, setTap] = useState<string | null>(null);

  // clear the optimistic pill when the transition commits (render-phase reset)
  const [prevPending, setPrevPending] = useState(isPending);
  if (prevPending !== isPending) {
    setPrevPending(isPending);
    if (!isPending) setTap(null);
  }

  const active = tap ?? statusFilter;

  const go = (s: string) => {
    setTap(s);
    startTransition(() => {
      router.replace(`/dashboard/members?status=${s}`, { scroll: false });
    });
  };

  const pills = [
    { label: "Active", value: stats?.active_count, status: "active" },
    { label: "Expiring", value: stats?.expiring_count, status: "expiring" },
    { label: "Expired", value: stats?.expired_count, status: "expired" },
    { label: "Frozen", value: stats?.frozen_count, status: "frozen" },
  ];

  return (
    <div
      className={`flex flex-wrap items-center gap-2 text-xs transition-opacity ${isPending ? "opacity-70" : ""}`}
      aria-busy={isPending}
    >
      <span className="font-semibold text-zinc-900">{stats?.total_members ?? count ?? 0} members</span>
      {pills.map((p) =>
        p.value ? (
          <button
            key={p.label}
            type="button"
            onClick={() => go(p.status)}
            className={`rounded-full px-3 py-1.5 font-semibold transition ${
              active === p.status
                ? "bg-zinc-900 text-white"
                : "bg-white text-zinc-600 ring-1 ring-zinc-200/60 hover:bg-zinc-50"
            }`}
          >
            {p.value} {p.label}
          </button>
        ) : null
      )}
      {Number(stats?.outstanding ?? 0) > 0 && (
        <span className="rounded-full bg-amber-50 px-3 py-1.5 font-semibold text-amber-700 ring-1 ring-amber-200">
          ₹{Number(stats.outstanding).toLocaleString("en-IN")} outstanding
        </span>
      )}
    </div>
  );
}

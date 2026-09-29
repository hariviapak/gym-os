"use client";

import { useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

// Auto-applying filter select: preserves the global date range + other
// filters, resets pagination. Instant, no submit button.
export function ReportSelect({
  param,
  allLabel,
  options,
}: {
  param: string;
  allLabel: string;
  options: Array<{ value: string; label: string }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [, startTransition] = useTransition();

  return (
    <select
      defaultValue={params.get(param) ?? "all"}
      onChange={(e) => {
        const p = new URLSearchParams(Array.from(params.entries()));
        const v = e.target.value;
        if (v === "all") p.delete(param);
        else p.set(param, v);
        p.delete("page");
        startTransition(() => router.replace(p.size ? `${pathname}?${p.toString()}` : pathname, { scroll: false }));
      }}
      className="max-w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
    >
      <option value="all">{allLabel}</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

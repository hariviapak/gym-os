"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

// ONE global date range for all reports. Presets are computed IST-side; the
// chosen range is carried in the URL (preset/from/to) so every drill-down,
// filter and export uses exactly the same period.
const PRESETS = [
  { key: "today", label: "Today" },
  { key: "week", label: "This Week" },
  { key: "month", label: "This Month" },
  { key: "quarter", label: "This Quarter" },
  { key: "year", label: "This Year" },
];

export function DateRangePicker() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [customOpen, setCustomOpen] = useState(false);

  const activePreset = params.get("preset") ?? "month";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";

  const apply = (updates: Record<string, string | null>) => {
    const p = new URLSearchParams(Array.from(params.entries()));
    Object.entries(updates).forEach(([k, v]) => (v === null ? p.delete(k) : p.set(k, v)));
    p.delete("page"); // filters reset pagination
    startTransition(() => router.replace(p.size ? `${pathname}?${p.toString()}` : pathname, { scroll: false }));
  };

  const applyPreset = (preset: string) => {
    const now = new Date();
    const istToday = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
    const anchor = new Date(`${istToday}T12:00:00+05:30`);
    const y = Number(istToday.slice(0, 4));
    const m = Number(istToday.slice(5, 7));
    let fromStr = istToday;
    if (preset === "week") {
      const monday = new Date(anchor);
      monday.setUTCDate(anchor.getUTCDate() - ((anchor.getUTCDay() + 6) % 7));
      fromStr = monday.toISOString().slice(0, 10);
    } else if (preset === "month") fromStr = `${y}-${String(m).padStart(2, "0")}-01`;
    else if (preset === "quarter") {
      const qm = Math.floor((m - 1) / 3) * 3 + 1;
      fromStr = `${y}-${String(qm).padStart(2, "0")}-01`;
    } else if (preset === "year") fromStr = `${y}-01-01`;
    apply({ preset, from: fromStr, to: istToday });
  };

  const selectCls =
    "rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900";

  return (
    <div className={`flex flex-wrap items-center gap-2 transition-opacity ${pending ? "opacity-60" : ""}`} aria-busy={pending}>
      <div className="-mx-1 flex gap-1 overflow-x-auto px-1 md:overflow-visible">
        {PRESETS.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => applyPreset(p.key)}
            className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              activePreset === p.key
                ? "bg-zinc-900 text-white"
                : "bg-white text-zinc-600 ring-1 ring-zinc-200/60 hover:bg-zinc-50"
            }`}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setCustomOpen((v) => !v)}
          className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
            activePreset === "custom"
              ? "bg-zinc-900 text-white"
              : "bg-white text-zinc-600 ring-1 ring-zinc-200/60 hover:bg-zinc-50"
          }`}
        >
          {activePreset === "custom" ? `${from} → ${to}` : "Custom"}
        </button>
      </div>
      {customOpen && activePreset !== "custom" && (
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const f = (new FormData(e.currentTarget).get("from") as string) || "";
            const t = (new FormData(e.currentTarget).get("to") as string) || "";
            if (f && t) {
              apply({ preset: "custom", from: f, to: t });
              setCustomOpen(false);
            }
          }}
        >
          <input type="date" name="from" defaultValue={from} required className={selectCls} title="Start date" />
          <span className="text-xs text-zinc-400">to</span>
          <input type="date" name="to" defaultValue={to} required className={selectCls} title="End date" />
          <button type="submit" className="rounded-lg bg-zinc-900 px-3 py-2 text-xs font-semibold text-white hover:bg-zinc-800">
            Apply
          </button>
        </form>
      )}
    </div>
  );
}

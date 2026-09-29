"use client";

import { PopoverMenu } from "@/components/ui/popover-menu";

// The single export action for reports. The server computes the exact export
// URLs (date range + current filters already encoded) — this component only
// presents them.
export function ExportMenu({ options }: { options: Array<{ label: string; href: string; primary?: boolean }> }) {
  return (
    <PopoverMenu
      panelClassName="w-56"
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          className="whitespace-nowrap rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          Export Report ▾
        </button>
      )}
    >
      <div className="py-1">
        {options.map((o) => (
          <a
            key={o.label}
            href={o.href}
            className={`block px-3 py-1.5 text-left text-xs transition hover:bg-zinc-50 ${
              o.primary ? "font-semibold text-zinc-900" : "text-zinc-700"
            }`}
          >
            {o.label}
          </a>
        ))}
      </div>
    </PopoverMenu>
  );
}

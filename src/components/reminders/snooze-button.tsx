"use client";

import { PopoverMenu } from "@/components/ui/popover-menu";
import { snoozeReminder } from "@/lib/actions/reminders";

// ⏰ per reminder row — parks the row until it returns (3/7/30 days)
export function SnoozeButton({ memberId, section }: { memberId: string; section: string }) {
  const item = "block w-full px-3 py-1.5 text-left text-xs text-zinc-700 transition hover:bg-zinc-50";
  return (
    <PopoverMenu
      panelClassName="w-44"
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          title="Snooze this reminder"
          className="shrink-0 rounded-lg bg-zinc-100 px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-200 hover:text-zinc-700"
        >
          ⏰
        </button>
      )}
    >
      <div className="py-1">
        <p className="px-3 py-1 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Snooze for</p>
        {[3, 7, 30].map((d) => (
          <form key={d} action={snoozeReminder.bind(null, memberId, section, d)}>
            <button type="submit" className={item}>
              {d} days
            </button>
          </form>
        ))}
      </div>
    </PopoverMenu>
  );
}

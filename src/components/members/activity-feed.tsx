"use client";

import { useState } from "react";
import { formatDateTime } from "@/lib/utils";

interface Event {
  id: string;
  event_type: string;
  title: string;
  description: string | null;
  created_at: string;
}

// Compact recent activity — full history on demand
export function ActivityFeed({ events }: { events: Event[] }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? events : events.slice(0, 6);

  return (
    <div>
      <div className="space-y-3">
        {visible.length === 0 && <p className="text-xs text-zinc-400">No activity yet.</p>}
        {visible.map((e) => (
          <div key={e.id} className="flex gap-2.5">
            <span className="mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full bg-zinc-300" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-snug text-zinc-800">{e.title}</p>
              {e.description && <p className="mt-0.5 break-words text-xs leading-snug text-zinc-400">{e.description}</p>}
              <p className="mt-0.5 text-[10px] text-zinc-400">{formatDateTime(e.created_at)}</p>
            </div>
          </div>
        ))}
      </div>
      {events.length > 6 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 text-xs font-semibold text-blue-700 transition hover:text-blue-900"
        >
          {expanded ? "Show less" : `View all activity (${events.length})`}
        </button>
      )}
    </div>
  );
}

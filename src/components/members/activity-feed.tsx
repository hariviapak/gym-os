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
      <div className="space-y-2">
        {visible.length === 0 && <p className="text-xs text-zinc-400">No activity yet.</p>}
        {visible.map((e) => (
          <div key={e.id} className="flex items-baseline gap-3 text-sm">
            <span className="w-32 shrink-0 whitespace-nowrap text-xs text-zinc-400">
              {formatDateTime(e.created_at).split(",")[1]?.trim()}
            </span>
            <span className="text-zinc-800">{e.title}</span>
            {e.description && <span className="truncate text-xs text-zinc-400">{e.description}</span>}
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

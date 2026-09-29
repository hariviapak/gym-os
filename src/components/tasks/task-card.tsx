"use client";

import { useState } from "react";
import { formatDate } from "@/lib/utils";
import { completeTask } from "@/lib/actions/tasks";
import { SubmitButton } from "@/components/ui/submit-button";
import { Icon } from "@/components/ui/icons";

interface TaskCardProps {
  task: any;
  today: string;
}

const priorityColors: Record<string, string> = {
  high: "bg-red-100 text-red-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-zinc-100 text-zinc-600",
};

const typeIcons: Record<string, string> = {
  maintenance: "settings",
  supply: "package",
  cleaning: "zap",
  custom: "check-square",
};

export function TaskCard({ task, today }: TaskCardProps) {
  const [expanded, setExpanded] = useState(false);

  const isOverdue =
    task.status === "pending" && task.due_date && task.due_date < today;
  const isDueToday =
    task.status === "pending" && task.due_date === today;

  return (
    <div
      className={`rounded-xl bg-white ring-1 ring-zinc-200/60 transition ${
        isOverdue ? "border-l-4 border-l-red-400" : ""
      }`}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start justify-between gap-4 p-4 text-left"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Icon
              name={typeIcons[task.type] ?? "check-square"}
              className="h-4 w-4 shrink-0 text-zinc-400"
            />
            <h3 className={`text-sm font-semibold text-zinc-900 ${
              task.status === "done" ? "line-through opacity-60" : ""
            }`}>
              {task.title}
            </h3>
          </div>
          {!expanded && task.description && (
            <p className="mt-1 line-clamp-1 pl-6 text-xs text-zinc-500">{task.description}</p>
          )}
          <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${priorityColors[task.priority] ?? priorityColors.low}`}>
              {task.priority}
            </span>
            {task.assigned_to_user && (
              <span className="text-xs text-zinc-400">
                → {task.assigned_to_user.name}
              </span>
            )}
            {task.due_date && (
              <span className={`text-xs font-medium ${
                isOverdue ? "text-red-600" : isDueToday ? "text-amber-600" : "text-zinc-400"
              }`}>
                {isOverdue ? "Overdue · " : isDueToday ? "Due today · " : "Due "}
                {formatDate(task.due_date)}
              </span>
            )}
            {task.status === "done" && task.completed_by_user && (
              <span className="text-xs text-zinc-400">
                ✓ {task.completed_by_user.name} · {formatDate(task.completed_at)}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {task.status === "pending" && !expanded && (
            <span className="text-xs font-medium text-zinc-300">Mark Done →</span>
          )}
          <Icon
            name="check-square"
            className={`h-4 w-4 text-zinc-300 transition ${expanded ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {expanded && (
        <div className="border-t border-zinc-100 px-4 py-3">
          {task.description && (
            <p className="mb-3 text-sm text-zinc-600">{task.description}</p>
          )}

          <div className="mb-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <div>
              <span className="text-zinc-400">Type: </span>
              <span className="font-medium text-zinc-600 capitalize">{task.type}</span>
            </div>
            <div>
              <span className="text-zinc-400">Priority: </span>
              <span className="font-medium text-zinc-600 capitalize">{task.priority}</span>
            </div>
            {task.assigned_to_user && (
              <div>
                <span className="text-zinc-400">Assigned to: </span>
                <span className="font-medium text-zinc-600">{task.assigned_to_user.name}</span>
              </div>
            )}
            {task.created_by_user && (
              <div>
                <span className="text-zinc-400">Created by: </span>
                <span className="font-medium text-zinc-600">{task.created_by_user.name}</span>
              </div>
            )}
            {task.due_date && (
              <div>
                <span className="text-zinc-400">Due: </span>
                <span className="font-medium text-zinc-600">{formatDate(task.due_date)}</span>
              </div>
            )}
            {task.status === "done" && task.completed_at && (
              <div>
                <span className="text-zinc-400">Completed: </span>
                <span className="font-medium text-zinc-600">{formatDate(task.completed_at)}</span>
              </div>
            )}
            {task.status === "done" && task.completed_by_user && (
              <div>
                <span className="text-zinc-400">Done by: </span>
                <span className="font-medium text-zinc-600">{task.completed_by_user.name}</span>
              </div>
            )}
          </div>

          {task.notes && task.status === "done" && (
            <p className="mb-3 rounded-lg bg-zinc-50 px-3 py-2 text-xs italic text-zinc-500">&ldquo;{task.notes}&rdquo;</p>
          )}

          {task.status === "pending" && (
            <form action={completeTask.bind(null, task.id)} className="flex items-center gap-2">
              <input
                name="notes"
                type="text"
                placeholder="Completion note (optional)..."
                className="flex-1 rounded-lg border border-zinc-200 px-3 py-1.5 text-xs focus:border-zinc-300 focus:outline-none focus:ring-1 focus:ring-zinc-300"
              />
              <SubmitButton
                className="rounded-lg bg-zinc-900 px-4 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-800"
                label="..."
              >
                Mark Done
              </SubmitButton>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

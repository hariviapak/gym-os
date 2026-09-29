"use client";

import { useState } from "react";
import { createTask } from "@/lib/actions/tasks";
import { SubmitButton } from "@/components/ui/submit-button";

interface StaffMember {
  id: string;
  name: string;
}

export function TaskForm({ staff }: { staff: StaffMember[] }) {
  const [open, setOpen] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-800"
      >
        + New Task
      </button>
    );
  }

  return (
    <form action={createTask} className="space-y-3 rounded-xl bg-white p-4 ring-1 ring-zinc-200/60">
      <input
        name="title"
        type="text"
        required
        placeholder="Task title..."
        className="block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
      />
      <textarea
        name="description"
        rows={2}
        placeholder="Description (optional)..."
        className="block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
      />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-zinc-500">Type</label>
          <select
            name="type"
            className="mt-0.5 block w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            defaultValue="custom"
          >
            <option value="maintenance">Maintenance</option>
            <option value="supply">Supply</option>
            <option value="cleaning">Cleaning</option>
            <option value="custom">Custom</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Priority</label>
          <select
            name="priority"
            className="mt-0.5 block w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            defaultValue="medium"
          >
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-zinc-500">Assign to</label>
          <select
            name="assigned_to"
            className="mt-0.5 block w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          >
            <option value="">Unassigned</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-zinc-500">Due date</label>
          <input
            name="due_date"
            type="date"
            className="mt-0.5 block w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
          />
        </div>
      </div>
      <div className="flex gap-2">
        <SubmitButton
          className="flex-1 rounded-lg bg-zinc-900 px-3 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
          label="Creating..."
        >
          Create Task
        </SubmitButton>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-zinc-200 px-3 py-2 text-sm font-medium text-zinc-500 transition hover:bg-zinc-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

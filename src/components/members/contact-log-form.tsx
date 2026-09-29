"use client";

import { useState } from "react";
import { logContact } from "@/lib/actions/contacts";
import { SubmitButton } from "@/components/ui/submit-button";

export function ContactLogForm({ memberId, defaultOpen = false }: { memberId: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-200"
      >
        + Log Contact
      </button>
    );
  }

  return (
    <form action={logContact.bind(null, memberId)} className="space-y-2">
      <select
        name="method"
        className="block w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        defaultValue="whatsapp"
      >
        <option value="call">Phone Call</option>
        <option value="whatsapp">WhatsApp</option>
        <option value="visit">In-person Visit</option>
      </select>
      <input
        name="note"
        type="text"
        className="block w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        placeholder="Quick note..."
      />
      <div className="flex gap-2">
        <SubmitButton
          className="flex-1 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-800"
          label="..."
        >
          Log
        </SubmitButton>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-500 transition hover:bg-zinc-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

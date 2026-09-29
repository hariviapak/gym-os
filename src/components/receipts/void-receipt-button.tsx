"use client";

import { useState } from "react";
import { voidReceiptForm } from "@/lib/actions/payments";
import { SubmitButton } from "@/components/ui/submit-button";

export function VoidReceiptButton({ receiptId }: { receiptId: string }) {
  const [showForm, setShowForm] = useState(false);

  if (!showForm) {
    return (
      <button
        onClick={() => setShowForm(true)}
        className="rounded-lg bg-red-50 px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-100"
      >
        Void Receipt
      </button>
    );
  }

  return (
    <form action={voidReceiptForm} className="flex items-center gap-2">
      <input type="hidden" name="receipt_id" value={receiptId} />
      <input
        name="reason"
        type="text"
        required
        placeholder="Reason for voiding..."
        className="rounded-lg border border-red-300 px-3 py-2 text-sm focus:border-red-600 focus:outline-none focus:ring-1 focus:ring-red-600"
        autoFocus
      />
      <SubmitButton
        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
        label="Voiding..."
      >
        Confirm Void
      </SubmitButton>
      <button
        type="button"
        onClick={() => setShowForm(false)}
        className="rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-50"
      >
        Cancel
      </button>
    </form>
  );
}

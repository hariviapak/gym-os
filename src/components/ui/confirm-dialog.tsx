"use client";

import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

// In-app confirmation dialog (portal modal). Native window.confirm is
// SILENTLY SUPPRESSED in iOS standalone web apps (home-screen PWAs) — it
// returns false and the action quietly cancels, so every confirm in the app
// must render as real UI.
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "Confirm",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  if (typeof document !== "undefined" && !mounted) setMounted(true);
  if (!open || !mounted) return null;

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close dialog"
        className="fixed inset-0 z-[90] cursor-default bg-black/50"
        onClick={onCancel}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="fixed left-1/2 top-1/2 z-[95] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-zinc-200"
      >
        <h3 className="text-base font-bold text-zinc-900">{title}</h3>
        {body && <div className="mt-2 text-sm text-zinc-600">{body}</div>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-50 ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-zinc-900 hover:bg-zinc-800"
            }`}
          >
            {busy ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </>,
    document.body
  );
}

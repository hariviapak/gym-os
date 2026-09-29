"use client";

import Link from "next/link";

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
    >
      Print Receipt
    </button>
  );
}

export function BackToPaymentsLink() {
  return (
    <Link
      href="/dashboard/payments"
      className="text-sm font-medium text-zinc-600 hover:text-zinc-900"
    >
      ← Back to Payments
    </Link>
  );
}

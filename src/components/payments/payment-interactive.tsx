"use client";

import Link from "next/link";

export function MemberSearchBox({
  members,
}: {
  members: { id: string; first_name: string; last_name: string | null; phone: string }[];
}) {
  return (
    <div>
      <input
        type="text"
        placeholder="Search by name or phone..."
        className="block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        onInput={(e) => {
          const query = e.currentTarget.value.toLowerCase();
          const rows = document.querySelectorAll("[data-member-row]");
          rows.forEach((row) => {
            const text = row.textContent?.toLowerCase() ?? "";
            (row as HTMLElement).style.display = text.includes(query) ? "" : "none";
          });
        }}
      />
      <div className="mt-3 max-h-80 overflow-y-auto rounded-lg border border-zinc-200">
        {members.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-400">No members found.</p>
        ) : (
          members.map((m) => (
            <Link
              key={m.id}
              href={`/dashboard/payments/new?member_id=${m.id}`}
              data-member-row
              className="flex items-center justify-between border-b border-zinc-100 px-4 py-2.5 text-sm hover:bg-zinc-50"
            >
              <span className="font-medium text-zinc-900">
                {m.first_name} {m.last_name}
              </span>
              <span className="text-zinc-500">{m.phone}</span>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

export function CollectBalanceButton({ balanceDue }: { balanceDue: number }) {
  return (
    <button
      type="button"
      onClick={() => {
        const input = document.getElementById("amount") as HTMLInputElement;
        if (input) input.value = balanceDue.toFixed(2);
      }}
      className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-amber-700"
    >
      Collect Full Balance
    </button>
  );
}

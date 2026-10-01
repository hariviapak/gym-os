import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/utils";
import { parseDateRange, rangeParams, fetchPayments } from "@/lib/reports";
import { DrillHeader } from "@/components/reports/drill-header";
import { ReportSelect } from "@/components/reports/report-select";
import { ReportPagination } from "@/components/reports/pagination";
import { SearchInput } from "@/components/ui/search-input";

// Revenue Details — every payment collected in the selected period, with the
// same filters the export uses.
const PAGE_SIZE = 50;

export default async function ReportPaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | undefined }>;
}) {
  const supabase = await createClient();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id")
    .eq("id", (await supabase.auth.getSession()).data.session!.user.id)
    .single();
  const gymId = userData!.gym_id;

  const sp = await searchParams;
  const range = parseDateRange(sp);
  const q = sp.q ?? "";
  const mode = sp.mode ?? "all";
  const status = sp.status ?? "all";
  const page = Math.max(1, parseInt(sp.page ?? "1") || 1);

  const columns =
    "id, amount, mode, reference_note, payment_date, members(first_name, last_name, phone), users!payments_created_by_fkey(name), receipts!receipts_payment_id_fkey(receipt_no, voided_at)";

  const { data: payments, count } = await fetchPayments(supabase, gymId, range, { q, mode, status }, columns, page, PAGE_SIZE);

  const rp = rangeParams(range);
  const filterParams = { ...rp, q: q || undefined, mode: mode !== "all" ? mode : undefined, status: status !== "all" ? status : undefined };
  const exportQs = new URLSearchParams(Object.entries(filterParams).reduce((a, [k, v]) => (v ? { ...a, [k]: v } : a), {} as Record<string, string>)).toString();
  const rangeQs = new URLSearchParams(rp).toString();

  return (
    <div className="space-y-5">
      <DrillHeader
        title="Revenue Details"
        description="Payments collected in the selected period. Voided receipts are marked."
        range={range}
        exportOptions={[
          { label: "Export Payments (current filters)", href: `/api/export/report-payments?${exportQs}`, primary: true },
          { label: "Expenses", href: `/api/export/report-expenses?${rangeQs}` },
          { label: "Memberships", href: `/api/export/report-memberships?${rangeQs}` },
          { label: "Member Growth", href: `/api/export/report-members?${rangeQs}` },
          { label: "Full Report (summary)", href: `/api/export/report-full?${rangeQs}` },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[220px] flex-1">
          <SearchInput defaultValue={q} placeholder="Search by member, phone, or reference…" />
        </div>
        <ReportSelect
          param="mode"
          allLabel="All Methods"
          options={[
            { value: "cash", label: "Cash" },
            { value: "upi", label: "UPI" },
            { value: "card", label: "Card" },
            { value: "bank_transfer", label: "Bank Transfer" },
            { value: "other", label: "Other" },
          ]}
        />
        <ReportSelect
          param="status"
          allLabel="All Statuses"
          options={[
            { value: "collected", label: "Collected" },
            { value: "voided", label: "Voided" },
          ]}
        />
      </div>

      <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-zinc-200/60">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50/50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Reference</th>
              <th className="px-4 py-3">Recorded By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {(payments ?? []).length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-zinc-400">
                  No payments match your filters.
                </td>
              </tr>
            )}
            {(payments ?? []).map((p: any) => {
              const voided = p.receipts?.[0]?.voided_at;
              return (
                <tr key={p.id} className={voided ? "text-zinc-400" : ""}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-sm">{formatDate(p.payment_date)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <Link href={`/dashboard/members/${p.members?.first_name ? p.member_id ?? "" : p.member_id}`} className="text-sm text-zinc-800 hover:underline">
                      {p.members?.first_name} {p.members?.last_name ?? ""}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-sm text-zinc-500">{p.members?.phone ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right text-sm font-semibold text-zinc-900">
                    {formatCurrency(p.amount)}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-sm capitalize text-zinc-600">{p.mode}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    {p.receipts?.[0] ? (
                      <span className={`text-xs font-medium ${voided ? "text-red-600" : "text-green-700"}`}>
                        {voided ? `Voided (#${p.receipts[0].receipt_no})` : `Collected (#${p.receipts[0].receipt_no})`}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-400">Collected</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-sm text-zinc-500">{p.reference_note || "—"}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-sm text-zinc-500">{p.users?.name ?? "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ReportPagination
        page={page}
        pageSize={PAGE_SIZE}
        total={count ?? 0}
        basePath="/dashboard/reports/payments"
        params={{ ...rp, q: q || undefined, mode: mode !== "all" ? mode : undefined, status: status !== "all" ? status : undefined }}
      />
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { formatCurrency, formatDate } from "@/lib/utils";
import { parseDateRange, rangeParams, fetchRenewals } from "@/lib/reports";
import { DrillHeader } from "@/components/reports/drill-header";
import { ReportPagination } from "@/components/reports/pagination";
import { SearchInput } from "@/components/ui/search-input";

// Renewals: membership renewal events in the period, joined to the new
// membership they created. Paginated on the events (the source of truth for
// "renewed in period").
const PAGE_SIZE = 50;

export default async function ReportRenewalsPage({
  searchParams,
}: {
  searchParams: Promise<{ [k: string]: string | undefined }>;
}) {
  const supabase = await createClient();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id")
    .eq("id", (await supabase.auth.getUser()).data.user!.id)
    .single();
  const gymId = userData!.gym_id;

  const sp = await searchParams;
  const range = parseDateRange(sp);
  const q = sp.q ?? "";
  const page = Math.max(1, parseInt(sp.page ?? "1") || 1);

  const columns = "id, member_id, metadata, created_at, members(first_name, last_name, phone)";
  const { data: events, count } = await fetchRenewals(supabase, gymId, range, q, columns, page, PAGE_SIZE);

  // fetch the renewed memberships for this page
  const msIds = (events ?? []).map((e: any) => e.metadata?.membership_id).filter(Boolean);
  const { data: memberships } = msIds.length
    ? await supabase
        .from("memberships")
        .select("id, package_name, start_date, end_date, total_amount, amount_paid, packages(name)")
        .in("id", msIds)
    : { data: [] };
  const msById = new Map((memberships ?? []).map((ms: any) => [ms.id, ms]));

  const rp = rangeParams(range);
  const active = { ...rp, q: q || undefined };
  const exportQs = new URLSearchParams(Object.entries(active).reduce((a, [k, v]) => (v ? { ...a, [k]: v } : a), {} as Record<string, string>)).toString();
  const rangeQs = new URLSearchParams(rp).toString();

  return (
    <div className="space-y-5">
      <DrillHeader
        title="Renewals"
        description="Memberships renewed in the selected period."
        range={range}
        exportOptions={[
          { label: "Export Renewals (current filters)", href: `/api/export/report-renewals?${exportQs}`, primary: true },
          { label: "Memberships", href: `/api/export/report-memberships?${rangeQs}` },
          { label: "Full Report (summary)", href: `/api/export/report-full?${rangeQs}` },
        ]}
      />

      <div className="max-w-sm">
        <SearchInput defaultValue={q} placeholder="Search by member or phone…" />
      </div>

      <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-zinc-200/60">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50/50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-3">Renewed On</th>
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Package</th>
              <th className="px-4 py-3">New Period</th>
              <th className="px-4 py-3 text-right">Value</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {(events ?? []).length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-zinc-400">
                  No renewals recorded during this period.
                </td>
              </tr>
            )}
            {(events ?? []).map((ev: any) => {
              const ms = msById.get(ev.metadata?.membership_id);
              return (
                <tr key={ev.id}>
                  <td className="whitespace-nowrap px-4 py-2.5 text-sm">{formatDate(ev.created_at)}</td>
                  <td className="whitespace-nowrap px-4 py-2.5">
                    <Link href={`/dashboard/members/${ev.member_id}`} className="text-sm text-zinc-800 hover:underline">
                      {ev.members?.first_name} {ev.members?.last_name ?? ""}
                    </Link>
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-sm text-zinc-500">{ev.members?.phone ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-sm text-zinc-800">
                    {ms?.package_name ?? ms?.packages?.name ?? "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-sm text-zinc-600">
                    {ms ? `${formatDate(ms.start_date)} → ${formatDate(ms.end_date)}` : "—"}
                  </td>
                  <td className="whitespace-nowrap px-4 py-2.5 text-right text-sm font-semibold text-zinc-900">
                    {ms ? formatCurrency(ms.total_amount) : "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <ReportPagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} basePath="/dashboard/reports/renewals" params={active} />
    </div>
  );
}

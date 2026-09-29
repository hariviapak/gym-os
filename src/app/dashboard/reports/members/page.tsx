import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { parseDateRange, rangeParams, fetchNewMembers } from "@/lib/reports";
import { DrillHeader } from "@/components/reports/drill-header";
import { ReportPagination } from "@/components/reports/pagination";
import { SearchInput } from "@/components/ui/search-input";

// Member Growth — unique members created in the selected period.
const PAGE_SIZE = 50;

export default async function ReportMembersPage({
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

  const { data: members, count } = await fetchNewMembers(
    supabase,
    gymId,
    range,
    { q },
    "id, first_name, last_name, phone, gender, status, created_at",
    page,
    PAGE_SIZE
  );

  const rp = rangeParams(range);
  const active = { ...rp, q: q || undefined };
  const exportQs = new URLSearchParams(Object.entries(active).reduce((a, [k, v]) => (v ? { ...a, [k]: v } : a), {} as Record<string, string>)).toString();
  const rangeQs = new URLSearchParams(rp).toString();

  return (
    <div className="space-y-5">
      <DrillHeader
        title="Member Growth"
        description="Unique members created in the selected period."
        range={range}
        exportOptions={[
          { label: "Export Member Growth (current filters)", href: `/api/export/report-members?${exportQs}`, primary: true },
          { label: "Revenue / Payments", href: `/api/export/report-payments?${rangeQs}` },
          { label: "Full Report (summary)", href: `/api/export/report-full?${rangeQs}` },
        ]}
      />

      <div className="max-w-sm">
        <SearchInput defaultValue={q} placeholder="Search by name or phone…" />
      </div>

      <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-zinc-200/60">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50/50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Gender</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {(members ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-zinc-400">
                  No new members joined during this period.
                </td>
              </tr>
            )}
            {(members ?? []).map((m: any) => (
              <tr key={m.id}>
                <td className="whitespace-nowrap px-4 py-2.5">
                  <Link href={`/dashboard/members/${m.id}`} className="text-sm text-zinc-800 hover:underline">
                    {m.first_name} {m.last_name ?? ""}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-sm text-zinc-500">{m.phone ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-sm capitalize text-zinc-500">{m.gender || "—"}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-sm text-zinc-600">{formatDate(m.created_at)}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-sm capitalize text-zinc-600">{m.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ReportPagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} basePath="/dashboard/reports/members" params={active} />
    </div>
  );
}

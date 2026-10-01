import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { formatCurrency, formatDate, serviceLabel } from "@/lib/utils";
import { parseDateRange, rangeParams, fetchMemberships } from "@/lib/reports";
import { DrillHeader } from "@/components/reports/drill-header";
import { ReportSelect } from "@/components/reports/report-select";
import { ReportPagination } from "@/components/reports/pagination";
import { SearchInput } from "@/components/ui/search-input";

// Membership report drill-down. basis=created (default) = enrollments made
// in the period; basis=ending = memberships whose end date falls in the
// period. Both drive the same export.
const PAGE_SIZE = 50;

export default async function ReportMembershipsPage({
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
  const basis = sp.basis === "ending" ? "ending" : "created";
  const q = sp.q ?? "";
  const packageId = sp.package ?? "all";
  const status = sp.status ?? "all";
  const serviceType = sp.service_type ?? "all";
  const page = Math.max(1, parseInt(sp.page ?? "1") || 1);

  const columns =
    "id, member_id, package_id, package_name, status, payment_status, start_date, end_date, total_amount, amount_paid, created_at, packages(name, type, service_type), members(first_name, last_name, phone)";

  const { data: memberships, count } = await fetchMemberships(
    supabase,
    gymId,
    range,
    basis,
    { q, packageId, status, serviceType },
    columns,
    page,
    PAGE_SIZE
  );

  const { data: packages } = await supabase
    .from("packages")
    .select("id, name")
    .eq("gym_id", gymId)
    .order("sort_order");

  const rp = rangeParams(range);
  const active = {
    ...rp,
    basis: basis === "ending" ? "ending" : undefined,
    q: q || undefined,
    package: packageId !== "all" ? packageId : undefined,
    status: status !== "all" ? status : undefined,
    service_type: serviceType !== "all" ? serviceType : undefined,
  };
  const exportQs = new URLSearchParams(
    Object.entries(active).reduce((a, [k, v]) => (v ? { ...a, [k]: v } : a), {} as Record<string, string>)
  ).toString();
  const rangeQs = new URLSearchParams(rp).toString();

  const title = basis === "ending" ? "Memberships Ending" : "New Enrollments";
  const description =
    basis === "ending"
      ? "Memberships whose end date falls in the selected period (cancelled excluded)."
      : "Memberships created in the selected period.";

  return (
    <div className="space-y-5">
      <DrillHeader
        title={title}
        description={description}
        range={range}
        exportOptions={[
          {
            label: `Export ${basis === "ending" ? "Memberships (ending)" : "Memberships"} (current filters)`,
            href: `/api/export/report-memberships?${exportQs}`,
            primary: true,
          },
          { label: "Package Sales", href: `/api/export/report-memberships?${exportQs}&cols=sales` },
          { label: "Revenue / Payments", href: `/api/export/report-payments?${rangeQs}` },
          { label: "Member Growth", href: `/api/export/report-members?${rangeQs}` },
          { label: "Full Report (summary)", href: `/api/export/report-full?${rangeQs}` },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[200px] flex-1 md:min-w-[220px]">
          <SearchInput defaultValue={q} placeholder="Search by member, phone, or package…" />
        </div>
        <ReportSelect
          param="basis"
          allLabel="Created in period"
          options={[{ value: "ending", label: "Ending in period" }]}
        />
        <ReportSelect
          param="package"
          allLabel="All Packages"
          options={(packages ?? []).map((p: any) => ({ value: p.id, label: p.name }))}
        />
        <ReportSelect
          param="status"
          allLabel="All Statuses"
          options={[
            { value: "active", label: "Active" },
            { value: "frozen", label: "Frozen" },
            { value: "expired", label: "Expired" },
            { value: "upgraded", label: "Upgraded" },
            { value: "cancelled", label: "Cancelled" },
          ]}
        />
        <ReportSelect
          param="service_type"
          allLabel="All Types"
          options={[
            { value: "gym", label: "Gym" },
            { value: "swimming", label: "Swimming" },
            { value: "both", label: "Both" },
          ]}
        />
      </div>

      <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-zinc-200/60">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50/50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-3">Member</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Package</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">{basis === "ending" ? "Ends" : "Start"} → End</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Payment</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {(memberships ?? []).length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-8 text-center text-sm text-zinc-400">
                  No new enrollments during this period.
                </td>
              </tr>
            )}
            {(memberships ?? []).map((ms: any) => (
              <tr key={ms.id} className={ms.status === "cancelled" ? "text-zinc-400" : ""}>
                <td className="whitespace-nowrap px-4 py-2.5">
                  <Link href={`/dashboard/members/${ms.member_id}`} className="text-sm text-zinc-800 hover:underline">
                    {ms.members?.first_name} {ms.members?.last_name ?? ""}
                  </Link>
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-sm text-zinc-500">{ms.members?.phone ?? "—"}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-sm text-zinc-800">
                  {ms.package_name ?? ms.packages?.name ?? "—"}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-sm capitalize text-zinc-500">
                  {serviceLabel(ms.packages?.service_type ?? "gym")}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-sm text-zinc-600">
                  {formatDate(ms.start_date)} → {formatDate(ms.end_date)}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-sm capitalize text-zinc-600">
                  {ms.status === "frozen" ? "Frozen" : ms.status}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right text-sm font-semibold text-zinc-900">
                  {formatCurrency(ms.total_amount)}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-sm capitalize text-zinc-500">{ms.payment_status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ReportPagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} basePath="/dashboard/reports/memberships" params={active} />
    </div>
  );
}

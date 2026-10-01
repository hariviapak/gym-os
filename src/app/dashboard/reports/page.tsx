import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate } from "@/lib/utils";
import Link from "next/link";
import { parseDateRange, rangeFromBound, rangeToBound, rangeParams } from "@/lib/reports";
import { DateRangePicker } from "@/components/reports/date-range-picker";
import { ExportMenu } from "@/components/reports/export-menu";

// REPORTS OVERVIEW — "pick a period, understand the numbers, drill into why".
// Calm hierarchy: Financial Overview → Membership Activity → Package
// Performance. Every number is a link into its underlying records. All
// sections share ONE date range; exports carry the same range.
export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string; preset?: string }>;
}) {
  const supabase = await createClient();
// zero-network session read: the middleware already verified this session,
  // and RLS enforces all data access regardless of where it was checked
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, role")
    .eq("id", user!.id)
    .single();

  if (!["owner", "admin", "manager"].includes(userData!.role)) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-zinc-400">You don&apos;t have access to reports.</p>
      </div>
    );
  }

  const gymId = userData!.gym_id;
  const range = parseDateRange(await searchParams);
  const rp = rangeParams(range);
  const qs = new URLSearchParams(rp).toString();

  const [payments, expenses, newEnrollments, renewals, ending, newMembers, deletedMembers, outstandingMs, packageSales] =
    await Promise.all([
      supabase
        .from("payments")
        .select("amount, mode, receipts!receipts_payment_id_fkey(voided_at)")
        .eq("gym_id", gymId)
        .gte("payment_date", range.from)
        .lte("payment_date", range.to),
      supabase
        .from("expenses")
        .select("amount, category_id, expense_categories(name)")
        .eq("gym_id", gymId)
        .gte("expense_date", range.from)
        .lte("expense_date", range.to),
      supabase
        .from("memberships")
        .select("id", { count: "exact", head: true })
        .eq("gym_id", gymId)
        .gte("created_at", rangeFromBound(range.from))
        .lte("created_at", rangeToBound(range.to)),
      supabase
        .from("member_events")
        .select("id", { count: "exact", head: true })
        .eq("gym_id", gymId)
        .eq("event_type", "renewal")
        .gte("created_at", rangeFromBound(range.from))
        .lte("created_at", rangeToBound(range.to)),
      supabase
        .from("memberships")
        .select("id", { count: "exact", head: true })
        .eq("gym_id", gymId)
        .gte("end_date", range.from)
        .lte("end_date", range.to)
        .neq("status", "cancelled"),
      supabase
        .from("members")
        .select("id", { count: "exact", head: true })
        .eq("gym_id", gymId)
        .gte("created_at", rangeFromBound(range.from))
        .lte("created_at", rangeToBound(range.to)),
      supabase
        .from("audit_logs")
        .select("id", { count: "exact", head: true })
        .eq("gym_id", gymId)
        .eq("action", "member.deleted")
        .gte("created_at", rangeFromBound(range.from))
        .lte("created_at", rangeToBound(range.to)),
      supabase
        .from("memberships")
        .select("total_amount, amount_paid")
        .eq("gym_id", gymId)
        .eq("status", "active")
        .in("payment_status", ["partial", "pending"])
        .range(0, 9999),
      supabase
        .from("memberships")
        .select("package_id, package_name, total_amount, packages(name)")
        .eq("gym_id", gymId)
        .gte("created_at", rangeFromBound(range.from))
        .lte("created_at", rangeToBound(range.to))
        .range(0, 4999),
    ]);

  // ---- financial overview ----
  const validPayments = (payments.data ?? []).filter((p: any) => !p.receipts?.[0]?.voided_at);
  const revenue = validPayments.reduce((s: number, p: any) => s + Number(p.amount), 0);
  const totalExpenses = (expenses.data ?? []).reduce((s: number, e: any) => s + Number(e.amount), 0);
  const netProfit = revenue - totalExpenses;
  const modeBreakdown: Record<string, { sum: number; count: number }> = {};
  validPayments.forEach((p: any) => {
    const m = modeBreakdown[p.mode] ?? { sum: 0, count: 0 };
    modeBreakdown[p.mode] = { sum: m.sum + Number(p.amount), count: m.count + 1 };
  });
  const outstanding = (outstandingMs.data ?? []).reduce(
    (s: number, ms: any) => s + Math.max(0, Number(ms.total_amount) - Number(ms.amount_paid)),
    0
  );

  // ---- membership activity ----
  const enrollmentsCount = newEnrollments.count ?? 0;
  const renewalsCount = renewals.count ?? 0;
  const endingCount = ending.count ?? 0;
  const newMembersCount = newMembers.count ?? 0;
  const deletedCount = deletedMembers.count ?? 0;
  const netGrowth = newMembersCount - deletedCount;

  // ---- package performance ----
  const pkgMap = new Map<string, { name: string; count: number; value: number }>();
  (packageSales.data ?? []).forEach((ms: any) => {
    const key = ms.package_id;
    const entry = pkgMap.get(key) ?? { name: ms.package_name ?? ms.packages?.name ?? "Unknown", count: 0, value: 0 };
    entry.count += 1;
    entry.value += Number(ms.total_amount);
    pkgMap.set(key, entry);
  });
  const pkgList = [...pkgMap.values()].sort((a, b) => b.value - a.value);

  const exportOptions = [
    { label: "Revenue / Payments", href: `/api/export/report-payments?${qs}` },
    { label: "Expenses", href: `/api/export/report-expenses?${qs}` },
    { label: "Memberships (enrollments)", href: `/api/export/report-memberships?${qs}` },
    { label: "Member Growth", href: `/api/export/report-members?${qs}` },
    { label: "Package Sales", href: `/api/export/report-memberships?${qs}&cols=sales` },
    { label: "Full Report (summary)", href: `/api/export/report-full?${qs}` },
  ];

  const card = "rounded-xl bg-white ring-1 ring-zinc-200/60";

  const metric = (
    label: string,
    value: string,
    sub?: string,
    href?: string
  ) => (
    <div className="flex items-center justify-between gap-3 py-2">
      <div>
        <p className="text-sm text-zinc-600">{label}</p>
        {sub && <p className="text-xs text-zinc-400">{sub}</p>}
      </div>
      {href ? (
        <Link href={href} className="whitespace-nowrap text-sm font-semibold text-zinc-900 hover:underline">
          {value} →
        </Link>
      ) : (
        <span className="whitespace-nowrap text-sm font-semibold text-zinc-900">{value}</span>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Reports</h1>
          <p className="mt-1 text-sm font-medium text-zinc-700">
            {formatDate(range.from)} – {formatDate(range.to)}
          </p>
        </div>
        <ExportMenu options={exportOptions} />
      </div>

      <DateRangePicker />

      {/* FINANCIAL OVERVIEW */}
      <section className={`${card} p-5`}>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-zinc-400">Financial Overview</h2>
        <p className="mb-2 text-xs text-zinc-400">
          Revenue = payments collected in this period. Net Profit = Revenue − Expenses.
        </p>
        <div className="grid grid-cols-1 gap-x-8 md:grid-cols-3">
          <div>
            {metric("Revenue", formatCurrency(revenue), `${validPayments.length} payments collected`, `/dashboard/reports/payments?${qs}`)}
            {metric("Expenses", formatCurrency(totalExpenses), `${expenses.data?.length ?? 0} recorded expenses`, `/dashboard/reports/expenses?${qs}`)}
            <div className="flex items-center justify-between gap-3 border-t border-zinc-100 py-2">
              <p className="text-sm text-zinc-600">Net Profit</p>
              <span className={`text-sm font-bold ${netProfit >= 0 ? "text-zinc-900" : "text-red-600"}`}>
                {formatCurrency(netProfit)}
              </span>
            </div>
          </div>
          <div>
            {metric("Outstanding dues", outstanding > 0 ? formatCurrency(outstanding) : "—", "current unpaid balances (all periods)")}
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Payment methods</p>
            {Object.entries(modeBreakdown).length === 0 ? (
              <p className="py-2 text-sm text-zinc-400">No revenue recorded for this period.</p>
            ) : (
              Object.entries(modeBreakdown)
                .sort(([, a], [, b]) => b.sum - a.sum)
                .map(([mode, v]) => (
                  <div key={mode} className="flex items-center justify-between py-1.5">
                    <span className="text-sm capitalize text-zinc-600">{mode.replace("_", " ")}</span>
                    <span className="text-sm text-zinc-800">
                      {formatCurrency(v.sum)} <span className="text-xs text-zinc-400">({v.count})</span>
                    </span>
                  </div>
                ))
            )}
          </div>
        </div>
      </section>

      {/* MEMBERSHIP ACTIVITY */}
      <section className={`${card} p-5`}>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-zinc-400">Membership Activity</h2>
        <p className="mb-2 text-xs text-zinc-400">
          Enrollments/Renewals count memberships (a member may hold more than one). Members count unique people.
        </p>
        <div className="grid grid-cols-1 gap-x-8 md:grid-cols-2">
          {metric("New enrollments", String(enrollmentsCount), "memberships created in this period", `/dashboard/reports/memberships?${qs}`)}
          {metric("Renewals", String(renewalsCount), "memberships renewed in this period", `/dashboard/reports/renewals?${qs}`)}
          {metric("Memberships ending", String(endingCount), "end dates fall in this period", `/dashboard/reports/memberships?${qs}&basis=ending`)}
          {metric("New members", String(newMembersCount), "unique members created in this period", `/dashboard/reports/members?${qs}`)}
          <div className="flex items-center justify-between gap-3 border-t border-zinc-100 py-2">
            <p className="text-sm text-zinc-600">
              Net member growth
              <span className="block text-xs text-zinc-400">new members − deleted members</span>
            </p>
            <span className="whitespace-nowrap text-sm font-semibold text-zinc-900">
              {netGrowth >= 0 ? "+" : ""}
              {netGrowth}
            </span>
          </div>
        </div>
      </section>

      {/* PACKAGE PERFORMANCE */}
      <section className={`${card} p-5`}>
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wider text-zinc-400">Package Performance</h2>
        <p className="mb-2 text-xs text-zinc-400">Memberships created in this period, by package. Value = billed totals.</p>
        {pkgList.length === 0 ? (
          <p className="text-sm text-zinc-400">No new enrollments during this period.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {pkgList.map((p) => (
              <Link
                key={p.name}
                href={`/dashboard/reports/memberships?${qs}&package=${pkgKey(packageSales.data ?? [], p.name)}`}
                className="flex items-center justify-between gap-3 py-2.5 transition hover:bg-zinc-50"
              >
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-zinc-800">{p.name}</span>
                <span className="whitespace-nowrap text-sm text-zinc-600">
                  {p.count} {p.count === 1 ? "enrollment" : "enrollments"}
                </span>
                <span className="whitespace-nowrap text-sm font-semibold text-zinc-900">{formatCurrency(p.value)} →</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function pkgKey(rows: any[], name: string): string {
  const row = rows.find((r: any) => (r.package_name ?? r.packages?.name) === name);
  return row?.package_id ?? "all";
}

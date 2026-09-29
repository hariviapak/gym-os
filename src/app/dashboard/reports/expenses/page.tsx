import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate } from "@/lib/utils";
import { parseDateRange, rangeParams, fetchExpenses } from "@/lib/reports";
import { DrillHeader } from "@/components/reports/drill-header";
import { ReportSelect } from "@/components/reports/report-select";
import { ReportPagination } from "@/components/reports/pagination";
import { SearchInput } from "@/components/ui/search-input";

// Expenses report drill-down — recorded expenses for the selected period.
const PAGE_SIZE = 50;

export default async function ReportExpensesPage({
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
  const categoryId = sp.category ?? "all";
  const page = Math.max(1, parseInt(sp.page ?? "1") || 1);

  const columns =
    "id, amount, title, description, expense_date, category_id, expense_categories(name), users!expenses_created_by_fkey(name)";

  const { data: expenses, count } = await fetchExpenses(supabase, gymId, range, { q, categoryId }, columns, page, PAGE_SIZE);

  const { data: categories } = await supabase.from("expense_categories").select("id, name").eq("gym_id", gymId).order("name");

  const rp = rangeParams(range);
  const active = { ...rp, q: q || undefined, category: categoryId !== "all" ? categoryId : undefined };
  const exportQs = new URLSearchParams(Object.entries(active).reduce((a, [k, v]) => (v ? { ...a, [k]: v } : a), {} as Record<string, string>)).toString();
  const rangeQs = new URLSearchParams(rp).toString();

  const pageTotal = (expenses ?? []).reduce((s: number, e: any) => s + Number(e.amount), 0);

  return (
    <div className="space-y-5">
      <DrillHeader
        title="Expenses"
        description="Recorded expenses for the selected period."
        range={range}
        exportOptions={[
          { label: "Export Expenses (current filters)", href: `/api/export/report-expenses?${exportQs}`, primary: true },
          { label: "Revenue / Payments", href: `/api/export/report-payments?${rangeQs}` },
          { label: "Full Report (summary)", href: `/api/export/report-full?${rangeQs}` },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[220px] flex-1">
          <SearchInput defaultValue={q} placeholder="Search by category, title, or description…" />
        </div>
        <ReportSelect
          param="category"
          allLabel="All Categories"
          options={(categories ?? []).map((c: any) => ({ value: c.id, label: c.name }))}
        />
      </div>

      <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-zinc-200/60">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-100 bg-zinc-50/50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3 text-right">Amount</th>
              <th className="px-4 py-3">Recorded By</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {(expenses ?? []).length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-zinc-400">
                  No expenses recorded for this period.
                </td>
              </tr>
            )}
            {(expenses ?? []).map((e: any) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap px-4 py-2.5 text-sm">{formatDate(e.expense_date)}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-sm text-zinc-800">{e.expense_categories?.name ?? "—"}</td>
                <td className="px-4 py-2.5 text-sm text-zinc-600">
                  {e.title || e.description || "—"}
                  {e.title && e.description && <span className="text-xs text-zinc-400"> · {e.description}</span>}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-right text-sm font-semibold text-zinc-900">
                  {formatCurrency(e.amount)}
                </td>
                <td className="whitespace-nowrap px-4 py-2.5 text-sm text-zinc-500">{e.users?.name ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {(expenses ?? []).length > 0 && (
          <p className="text-sm text-zinc-500">
            This page totals {formatCurrency(pageTotal)}
          </p>
        )}
        <ReportPagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} basePath="/dashboard/reports/expenses" params={active} />
      </div>
    </div>
  );
}

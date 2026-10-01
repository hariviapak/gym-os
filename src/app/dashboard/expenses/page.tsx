import { createClient } from "@/lib/supabase/server";
import { MobilePageHeader } from "@/components/ui/mobile-page-header";
import { formatCurrency, formatDate, todayIST } from "@/lib/utils";
import { addExpense, deleteExpense, updateExpense } from "@/lib/actions/expenses";
import { SubmitButton } from "@/components/ui/submit-button";
import Link from "next/link";

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; sort?: string; order?: string; edit?: string; error?: string }>;
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
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-zinc-400">You don&apos;t have access to expenses.</p>
      </div>
    );
  }

  const gymId = userData!.gym_id;
  const params = await searchParams;
  const page = Math.max(1, parseInt(params.page ?? "1"));
  const pageSize = 20;
  const sort = params.sort ?? "expense_date";
  const order = params.order ?? "desc";
  const editingId = params.edit ?? "";

  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const nextMonthDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const nextMonth = `${nextMonthDate.getFullYear()}-${String(nextMonthDate.getMonth() + 1).padStart(2, "0")}`;

  const [
    { data: expenses, count },
    { data: categories },
    { data: monthExpenses },
  ] = await Promise.all([
    supabase
      .from("expenses")
      .select("*, expense_categories(name, type)", { count: "exact" })
      .eq("gym_id", gymId)
      .order(sort, { ascending: order === "asc" })
      .range((page - 1) * pageSize, page * pageSize - 1),
    supabase
      .from("expense_categories")
      .select("*")
      .eq("gym_id", gymId)
      .eq("is_active", true)
      .order("name", { ascending: true }),
    supabase
      .from("expenses")
      .select("amount")
      .eq("gym_id", gymId)
      .gte("expense_date", `${currentMonth}-01`)
      .lt("expense_date", `${nextMonth}-01`),
  ]);

  const monthTotal = (monthExpenses ?? []).reduce(
    (sum: number, e: any) => sum + Number(e.amount),
    0
  );

  const sortUrl = (column: string) =>
    `/dashboard/expenses?${new URLSearchParams({
      ...params,
      sort: column,
      order: sort === column && order === "asc" ? "desc" : "asc",
      page: "1",
    }).toString()}`;

  return (
    <div className="space-y-6">
      <MobilePageHeader title="Expenses" />
      <div className="hidden md:block">
        <h1 className="text-2xl font-bold text-zinc-900">Expenses</h1>
        <p className="mt-1 text-sm text-zinc-500">
          {formatCurrency(monthTotal)} spent this month
        </p>
      </div>

      {params.error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {params.error}
        </div>
      )}

      {/* Add expense */}
      <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900">Add Expense</h2>
        <form action={addExpense} className="grid grid-cols-1 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          <input type="hidden" name="gym_id" value={gymId} />
          <div>
            <label className="block text-xs font-medium text-zinc-600">Title *</label>
            <input
              name="title"
              required
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              placeholder="Monthly rent"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">Category</label>
            <select
              name="category_id"
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            >
              {categories?.map((c: any) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">Amount (₹) *</label>
            <input
              name="amount"
              type="number"
              step="0.01"
              required
              min={0}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              placeholder="15000"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">Date</label>
            <input
              name="expense_date"
              type="date"
              defaultValue={todayIST()}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
          </div>
          <div className="sm:col-span-3 lg:col-span-3">
            <label className="block text-xs font-medium text-zinc-600">Description</label>
            <input
              name="description"
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              placeholder="Optional notes"
            />
          </div>
          <div className="flex items-end">
            <SubmitButton
              className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
              label="Adding..."
            >
              Add
            </SubmitButton>
          </div>
        </form>
      </div>

      {/* Expense list */}
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-zinc-200">
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">
                <Link href={sortUrl("amount")} className="inline-flex items-center gap-1 hover:text-zinc-900">
                  Amount
                  {sort === "amount" && <span>{order === "asc" ? "↑" : "↓"}</span>}
                </Link>
              </th>
              <th className="px-4 py-3">
                <Link href={sortUrl("expense_date")} className="inline-flex items-center gap-1 hover:text-zinc-900">
                  Date
                  {sort === "expense_date" && <span>{order === "asc" ? "↑" : "↓"}</span>}
                </Link>
              </th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {expenses?.length === 0 || !expenses ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-zinc-400">
                  No expenses recorded yet.
                </td>
              </tr>
            ) : (
              expenses.map((e: any) => {
                const isEditing = editingId === e.id;
                if (isEditing) {
                  return (
                    <tr key={e.id} className="bg-blue-50">
                      <td colSpan={5} className="px-4 py-4">
                        <form action={updateExpense.bind(null, e.id)} className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                          <div>
                            <label className="block text-xs font-medium text-zinc-600">Title *</label>
                            <input
                              name="title"
                              required
                              defaultValue={e.title}
                              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-zinc-600">Category</label>
                            <select
                              name="category_id"
                              defaultValue={e.category_id ?? ""}
                              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                            >
                              <option value="">Uncategorized</option>
                              {categories?.map((c: any) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-zinc-600">Amount (₹) *</label>
                            <input
                              name="amount"
                              type="number"
                              step="0.01"
                              required
                              min={0}
                              defaultValue={e.amount}
                              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-zinc-600">Date</label>
                            <input
                              name="expense_date"
                              type="date"
                              defaultValue={e.expense_date}
                              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                            />
                          </div>
                          <div className="sm:col-span-2 lg:col-span-4">
                            <label className="block text-xs font-medium text-zinc-600">Description</label>
                            <input
                              name="description"
                              defaultValue={e.description ?? ""}
                              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                            />
                          </div>
                          <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
                            <SubmitButton
                              className="rounded-lg bg-zinc-900 px-4 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800"
                              label="Saving..."
                            >
                              Save
                            </SubmitButton>
                            <Link
                              href="/dashboard/expenses"
                              className="rounded-lg border border-zinc-300 px-4 py-2 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50"
                            >
                              Cancel
                            </Link>
                          </div>
                        </form>
                      </td>
                    </tr>
                  );
                }
                return (
                  <tr key={e.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3 text-sm font-medium text-zinc-900">{e.title}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                        {e.expense_categories?.name ?? "Uncategorized"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold text-zinc-900">
                      {formatCurrency(e.amount)}
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600">
                      {formatDate(e.expense_date)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/dashboard/expenses?edit=${e.id}`}
                          className="text-xs text-zinc-500 hover:text-zinc-900"
                        >
                          Edit
                        </Link>
                        <form action={deleteExpense.bind(null, e.id)}>
                          <SubmitButton
                            className="text-xs text-red-600 hover:text-red-800"
                            label="Deleting..."
                            confirmMessage="Delete this expense?"
                          >
                            Delete
                          </SubmitButton>
                        </form>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Pagination */}
      {count && count > pageSize && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-500">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, count)} of {count}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/dashboard/expenses?${new URLSearchParams({ ...params, page: String(page - 1) }).toString()}`}
                className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
              >
                ← Previous
              </Link>
            )}
            {page * pageSize < count && (
              <Link
                href={`/dashboard/expenses?${new URLSearchParams({ ...params, page: String(page + 1) }).toString()}`}
                className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

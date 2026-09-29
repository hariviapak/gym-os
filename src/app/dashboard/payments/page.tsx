import { createClient } from "@/lib/supabase/server";
import { PaymentsFilters } from "@/components/payments/payments-filters";
import { redirect } from "next/navigation";
import { formatCurrency, formatDate, todayIST } from "@/lib/utils";
import Link from "next/link";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; mode?: string; from?: string; to?: string; page?: string; sort?: string; order?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, role")
    .eq("id", user!.id)
    .single();

  if (!["owner", "admin", "manager"].includes(userData!.role)) {
    redirect("/dashboard");
  }

  const gymId = userData!.gym_id;
  const params = await searchParams;
  const modeFilter = params.mode ?? "all";
  const page = Math.max(1, parseInt(params.page ?? "1"));
  const pageSize = 25;
  const allowedSorts = ["created_at", "payment_date", "amount", "member_id"];
  const sort = allowedSorts.includes(params.sort ?? "") ? (params.sort as string) : "created_at";
  const order = params.order === "asc" ? "asc" : "desc";

  const buildSortHref = (column: string) => {
    const newOrder = sort === column ? (order === "asc" ? "desc" : "asc") : "desc";
    return `/dashboard/payments?${new URLSearchParams({ ...params, sort: column, order: newOrder, page: "1" }).toString()}`;
  };

  // PostgREST can't filter embedded relations inside or(), so resolve matching
  // members once for the search term.
  let searchMemberIds: string[] | null = null;
  if (params.q) {
    const { data: matched } = await supabase
      .from("members")
      .select("id")
      .eq("gym_id", gymId)
      .or(
        `first_name.ilike.%${params.q}%,last_name.ilike.%${params.q}%,phone.ilike.%${params.q}%`
      )
      .limit(50);
    searchMemberIds = (matched ?? []).map((m) => m.id);
  }

  // One builder used twice (page + totals) so both always share the same filters
  const paymentsQuery = (columns: string, opts?: { count: "exact" }) => {
    let q = supabase.from("payments").select(columns, opts).eq("gym_id", gymId);
    if (params.q) {
      q = q.or(
        searchMemberIds?.length
          ? `reference_note.ilike.%${params.q}%,member_id.in.(${searchMemberIds.join(",")})`
          : `reference_note.ilike.%${params.q}%`
      );
    }
    if (modeFilter !== "all") q = q.eq("mode", modeFilter);
    if (params.from) q = q.gte("payment_date", params.from);
    if (params.to) q = q.lte("payment_date", params.to);
    return q;
  };

  const { data: payments, count } = await paymentsQuery(
    "id, amount, mode, reference_note, payment_date, created_at, member_id, membership_id, members(first_name, last_name, phone), receipts!receipts_payment_id_fkey(id, receipt_no, voided_at)",
    { count: "exact" }
  )
    .order(sort, { ascending: order === "asc" })
    .range((page - 1) * pageSize, page * pageSize - 1);

  // Totals reflect the WHOLE filtered set, not just the current page.
  const { data: allFiltered } = await paymentsQuery(
    "amount, payment_date, receipts!receipts_payment_id_fkey(voided_at)"
  )
    .order("created_at", { ascending: false })
    .range(0, 99999);
  const totalToday = (allFiltered ?? [])
    .filter((p: any) => p.payment_date === todayIST() && !p.receipts?.[0]?.voided_at)
    .reduce((sum: number, p: any) => sum + Number(p.amount), 0);
  const totalFiltered = (allFiltered ?? [])
    .filter((p: any) => !p.receipts?.[0]?.voided_at)
    .reduce((sum: number, p: any) => sum + Number(p.amount), 0);

  return (
    <div className="space-y-5">
      {/* Mobile: compact header. Desktop: full header. */}
      <div className="flex items-center justify-between md:hidden">
        <Link href="/dashboard" className="text-sm font-semibold text-zinc-500 transition hover:text-zinc-900">
          ← Payments
        </Link>
        <Link
          href="/dashboard/payments/new"
          className="rounded-lg bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800"
        >
          + Collect
        </Link>
      </div>
      <div className="hidden items-center justify-between md:flex">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Payments</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {formatCurrency(totalFiltered)} total · {formatCurrency(totalToday)} collected today
          </p>
        </div>
        <Link
          href="/dashboard/payments/new"
          className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
        >
          Collect Payment
        </Link>
      </div>

      <PaymentsFilters defaultMode={modeFilter} />
      <div className="flex flex-wrap gap-3">
        {(params.q || modeFilter !== "all" || params.from || params.to) && (
          <Link
            href="/dashboard/payments"
            className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-500 transition hover:bg-zinc-50"
          >
            Clear
          </Link>
        )}
        <Link
          href="/api/export/payments"
          className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
        >
          Export CSV
        </Link>
      </div>

      {/* Mobile / tablet: compact payment cards */}
      <div className="space-y-1.5 lg:hidden">
        {(payments ?? []).length === 0 && (
          <div className="rounded-xl bg-white p-6 text-center ring-1 ring-zinc-200/60">
            <p className="text-sm text-zinc-400">No payments match your filters.</p>
          </div>
        )}
        {(payments ?? []).map((p: any) => {
          const voided = p.receipts?.[0]?.voided_at;
          return (
            <div key={p.id} className={`flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2.5 ring-1 ring-zinc-200/60 ${voided ? "opacity-60" : ""}`}>
              <Link href={`/dashboard/members/${p.member_id}`} className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-zinc-900">
                  {p.members?.first_name} {p.members?.last_name ?? ""}
                </p>
                <p className="truncate text-xs text-zinc-400">
                  {formatDate(p.payment_date)} · <span className="capitalize">{p.mode}</span>
                  {p.receipts?.[0] && ` · R#${p.receipts[0].receipt_no}`}
                </p>
              </Link>
              <div className="shrink-0 text-right">
                <p className="text-sm font-bold text-zinc-900">{formatCurrency(p.amount)}</p>
                {voided ? (
                  <p className="text-[10px] font-semibold uppercase text-red-500">Voided</p>
                ) : (
                  <p className="text-[10px] font-medium uppercase text-zinc-400">Collected</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Desktop: table */}
      <div className="hidden overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-zinc-200 lg:block">
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-3">Receipt</th>
              <th className="px-4 py-3">
                <Link href={buildSortHref("member_id")} className="flex items-center gap-1 hover:text-zinc-900">
                  Member
                  {sort === "member_id" && <span>{order === "asc" ? "↑" : "↓"}</span>}
                </Link>
              </th>
              <th className="px-4 py-3">
                <Link href={buildSortHref("amount")} className="flex items-center gap-1 hover:text-zinc-900">
                  Amount
                  {sort === "amount" && <span>{order === "asc" ? "↑" : "↓"}</span>}
                </Link>
              </th>
              <th className="px-4 py-3">Mode</th>
              <th className="px-4 py-3">
                <Link href={buildSortHref("payment_date")} className="flex items-center gap-1 hover:text-zinc-900">
                  Date
                  {sort === "payment_date" && <span>{order === "asc" ? "↑" : "↓"}</span>}
                </Link>
              </th>
              <th className="px-4 py-3">Reference</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {payments?.length === 0 || !payments ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-zinc-400">
                  No payments recorded yet.
                </td>
              </tr>
            ) : (
              payments.map((p: any) => {
                const isVoided = p.receipts?.[0]?.voided_at;
                return (
                <tr key={p.id} className={`hover:bg-zinc-50 ${isVoided ? "opacity-50" : ""}`}>
                  <td className="px-4 py-3">
                    {p.receipts?.[0] ? (
                      <Link
                        href={`/dashboard/receipts/${p.receipts[0].id}`}
                        className="text-sm font-mono font-medium text-zinc-900 hover:underline"
                      >
                        #{p.receipts[0].receipt_no}
                        {isVoided && (
                          <span className="ml-1 text-xs text-red-600">(voided)</span>
                        )}
                      </Link>
                    ) : (
                      <span className="text-xs text-zinc-400">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/dashboard/members/${p.member_id}`}
                      className="text-sm font-medium text-zinc-900 hover:underline"
                    >
                      {p.members?.first_name} {p.members?.last_name}
                    </Link>
                    <p className="text-xs text-zinc-400">{p.members?.phone}</p>
                  </td>
                  <td className="px-4 py-3 text-sm font-semibold text-zinc-900">
                    {formatCurrency(p.amount)}
                  </td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600">
                      {p.mode}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-600">
                    {formatDate(p.payment_date)}
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-500">
                    {p.reference_note || "—"}
                  </td>
                </tr>
                );
              })
            )}
          </tbody>
        </table>
        </div>
      </div>

      {count !== null && count > pageSize && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-500">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, count)} of {count}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/dashboard/payments?${new URLSearchParams({ ...params, page: String(page - 1) }).toString()}`}
                className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
              >
                ← Previous
              </Link>
            )}
            {page * pageSize < count && (
              <Link
                href={`/dashboard/payments?${new URLSearchParams({ ...params, page: String(page + 1) }).toString()}`}
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

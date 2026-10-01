import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatCurrencyCompact, formatDate, todayIST, addDaysIST, monthStartIST } from "@/lib/utils";
import Link from "next/link";

// DASHBOARD = "What needs my attention?" — a calm traffic controller.
// It shows compact counts per category and routes the admin to the right
// workspace: communication goes to Reminders, business actions go to the
// member profile / module. It never lists members or duplicates the
// Reminders workflow.
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
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

  const gymId = userData!.gym_id;
  const userRole = userData!.role;
  const canSeeFinances = ["owner", "admin", "manager"].includes(userRole);
  const sp = await searchParams;
  const todayStr = todayIST();

  const [
    statsRes,
    collectedToday,
    monthRevenue,
    monthExpenses,
    voidedPayments,
    expiring7,
    dues,
    expiredBucket,
    recentPayments,
    overdueTasks,
    giftKits,
    lockerKeys,
  ] = await Promise.all([
    supabase.rpc("member_overview_stats", { p_gym_id: gymId }).single(),
    supabase.from("payments").select("id, amount").eq("gym_id", gymId).eq("payment_date", todayStr),
    supabase.from("payments").select("id, amount").eq("gym_id", gymId).gte("payment_date", monthStartIST()),
    supabase.from("expenses").select("amount").eq("gym_id", gymId).gte("expense_date", monthStartIST()),
    // voided receipts are excluded from every revenue figure (same rule as
    // the payments page + reports). PostgREST can't filter via the embedded
    // receipts relation, so resolve voided payment ids first.
    supabase.from("receipts").select("payment_id").eq("gym_id", gymId).not("voided_at", "is", null),
    supabase
      .from("memberships")
      .select("id", { count: "exact", head: true })
      .eq("gym_id", gymId)
      .eq("status", "active")
      .lte("start_date", todayStr)
      .gte("end_date", todayStr)
      .lte("end_date", addDaysIST(7)),
    supabase
      .from("memberships")
      .select("id, member_id, total_amount, amount_paid, members(first_name, last_name, phone)")
      .eq("gym_id", gymId)
      .eq("status", "active")
      .in("payment_status", ["partial", "pending"])
      .order("end_date", { ascending: true })
      .limit(50),
    supabase.rpc("member_bucket_ids", { p_gym_id: gymId }),
    supabase
      .from("payments")
      .select("id, amount, mode, payment_date, members(first_name, last_name)")
      .eq("gym_id", gymId)
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("gym_tasks")
      .select("id", { count: "exact", head: true })
      .eq("gym_id", gymId)
      .eq("status", "pending")
      .lte("due_date", todayStr),
    supabase
      .from("gift_kit_tasks")
      .select("id", { count: "exact", head: true })
      .eq("gym_id", gymId)
      .in("status", ["pending", "assigned"]),
    supabase.from("locker_keys").select("id, key_number, attention, status").eq("gym_id", gymId),
  ]);

  const stats = statsRes.data as any;

  // ---- derived values ----

  const voidedIds = new Set((voidedPayments.data ?? []).map((r: any) => r.payment_id));
  const revenue = (monthRevenue.data ?? [])
    .filter((p: any) => !voidedIds.has(p.id))
    .reduce((s: number, p: any) => s + Number(p.amount), 0);
  const collectedTodaySum = (collectedToday.data ?? [])
    .filter((p: any) => !voidedIds.has(p.id))
    .reduce((s: number, p: any) => s + Number(p.amount), 0);
  const expenses = (monthExpenses.data ?? []).reduce((s: number, e: any) => s + Number(e.amount), 0);

  // outstanding dues, summed per member
  const duesByMember = new Map<string, number>();
  (dues.data ?? []).forEach((d: any) => {
    const cur = (duesByMember.get(d.member_id) ?? 0) + Math.max(0, Number(d.total_amount) - Number(d.amount_paid));
    duesByMember.set(d.member_id, cur);
  });
  const duesMemberCount = [...duesByMember.values()].filter((v) => v > 0.01).length;
  const totalDue = [...duesByMember.values()].reduce((s, v) => s + v, 0);

  const expiredCount = ((expiredBucket.data ?? []) as any[]).filter((b) => b.bucket === "expired").length;
  const expiringCount = expiring7.count ?? 0;
  const overdueTaskCount = overdueTasks.count ?? 0;
  const giftKitCount = giftKits.count ?? 0;
  const flaggedKeys = (lockerKeys.data ?? []).filter((k: any) => k.attention).length;
  const keysAvailable = (lockerKeys.data ?? []).filter((k: any) => k.status === "available").length;
  const keysIssued = (lockerKeys.data ?? []).filter((k: any) => k.status === "issued").length;

  // ---- Needs Attention categories (only non-empty ones render) ----
  const categories: Array<{ label: string; count: number; descriptor?: string; href: string }> = [];
  if (duesMemberCount > 0)
    categories.push({
      label: "Payments due",
      count: duesMemberCount,
      descriptor: canSeeFinances ? formatCurrency(totalDue) : undefined,
      href: "/dashboard/reminders#dues",
    });
  if (expiringCount > 0)
    categories.push({ label: "Expiring within 7 days", count: expiringCount, href: "/dashboard/reminders#expiring-week" });
  if (expiredCount > 0)
    categories.push({ label: "Expired / needs renewal", count: expiredCount, href: "/dashboard/reminders#expired" });
  if (overdueTaskCount > 0)
    categories.push({ label: "Overdue tasks", count: overdueTaskCount, href: "/dashboard/tasks" });
  if (giftKitCount > 0)
    categories.push({ label: "Gift kits pending", count: giftKitCount, href: "/dashboard/reminders#gift-kits" });
  if (flaggedKeys > 0)
    categories.push({ label: "Locker keys need attention", count: flaggedKeys, href: "/dashboard/locker-keys?status=flagged" });

  const attentionItems = categories.reduce((s, c) => s + c.count, 0);
  const duesOrRenewals = duesMemberCount > 0 || expiringCount > 0 || expiredCount > 0;

  const cardClass = "rounded-xl bg-white ring-1 ring-zinc-200/60";

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Dashboard</h1>
          <p className="mt-0.5 text-sm text-zinc-500">Here&apos;s what needs your attention today.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/quick-pass" className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800">
            Quick Pass
          </Link>
        </div>
      </div>

      {sp.error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{sp.error}</div>}

      {/* KPI row — quiet, informational */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className={`${cardClass} p-4`}>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">Members</p>
          <p className="mt-1 text-xl font-bold text-zinc-900">{stats?.total_members ?? 0}</p>
        </div>
        <div className={`${cardClass} p-4`}>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">Active</p>
          <p className="mt-1 text-xl font-bold text-zinc-900">{stats?.active_count ?? 0}</p>
        </div>
        <div className={`${cardClass} p-4 ${expiringCount > 0 ? "ring-amber-200" : ""}`}>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">Expiring soon</p>
          <p className={`mt-1 text-xl font-bold ${expiringCount > 0 ? "text-amber-700" : "text-zinc-900"}`}>
            {stats?.expiring_count ?? 0}
          </p>
        </div>
        <div className={`${cardClass} p-4 ${totalDue > 0 ? "ring-amber-200" : ""}`}>
          <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">Outstanding</p>
          <p className={`mt-1 text-xl font-bold ${totalDue > 0 ? "text-amber-700" : "text-zinc-900"}`}>
            {canSeeFinances ? formatCurrency(totalDue) : "—"}
          </p>
        </div>
        {canSeeFinances && (
          <div className={`${cardClass} p-4`}>
            <p className="text-xs font-medium uppercase tracking-wider text-zinc-400">Collected today</p>
            <p className="mt-1 text-xl font-bold text-zinc-900">{formatCurrency(collectedTodaySum)}</p>
          </div>
        )}
      </div>

      {/* NEEDS ATTENTION — compact category counts; the admin is routed to the
          right workspace (Reminders for communication, module pages for ops). */}
      <div className={`${cardClass} p-5`}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Needs Attention</h2>
          {attentionItems > 0 && (
            <span className="rounded-full bg-zinc-900 px-2.5 py-0.5 text-xs font-bold text-white">
              {attentionItems} {attentionItems === 1 ? "item" : "items"}
            </span>
          )}
        </div>

        {categories.length === 0 ? (
          <div className="py-3">
            <p className="text-sm font-semibold text-green-700">✓ You&apos;re all caught up.</p>
            <p className="mt-0.5 text-sm text-zinc-500">
              No payments, renewals, tasks, gift kits, or locker issues need attention.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-zinc-100">
            {categories.map((c) => (
              <Link
                key={c.label}
                href={c.href}
                className="flex items-center justify-between gap-3 py-2.5 transition hover:bg-zinc-50"
              >
                <span className="flex min-w-0 items-center gap-2.5">
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800">{c.count}</span>
                  <span className="truncate text-sm font-medium text-zinc-800">{c.label}</span>
                  {c.descriptor && <span className="whitespace-nowrap text-xs font-semibold text-amber-700">{c.descriptor}</span>}
                </span>
                <span className="text-xs font-semibold text-blue-700">
                  {c.href.includes("reminders") ? "Reminders" : c.label.includes("Locker") ? "Locker keys" : "Tasks"} →
                </span>
              </Link>
            ))}
          </div>
        )}

        {duesOrRenewals && (
          <p className="mt-3 border-t border-zinc-100 pt-2.5 text-xs text-zinc-400">
            Communication happens on the{" "}
            <Link href="/dashboard/reminders" className="font-semibold text-blue-700 hover:underline">
              Reminders
            </Link>{" "}
            page — renewals and collections are done from the member profile.
          </p>
        )}
      </div>

      {/* Recent payments — quiet informational context for finance roles */}
      {canSeeFinances && (
        <div className={`${cardClass} p-5`}>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Recent Payments</h2>
            <Link href="/dashboard/payments" className="text-xs font-semibold text-blue-700 hover:text-blue-900">
              View all payments
            </Link>
          </div>
          <div className="divide-y divide-zinc-100">
            {(recentPayments.data ?? []).map((p: any) => (
              <div key={p.id} className="flex items-center justify-between gap-2 py-2">
                <span className="min-w-0 flex-1 truncate text-sm text-zinc-800">
                  {p.members?.first_name} {p.members?.last_name}
                  <span className="ml-1.5 text-xs text-zinc-400">{p.mode}</span>
                </span>
                <span className="whitespace-nowrap text-xs text-zinc-400">{formatDate(p.payment_date)}</span>
                <span className="whitespace-nowrap text-sm font-semibold text-zinc-900">{formatCurrency(Number(p.amount))}</span>
              </div>
            ))}
            {(recentPayments.data ?? []).length === 0 && <p className="text-xs text-zinc-400">No payments yet.</p>}
          </div>
        </div>
      )}

      {/* Monthly summary — labeled grid, reads well on mobile */}
      {canSeeFinances && (
        <div className={cardClass}>
          <div className="flex items-center justify-between px-5 pt-4">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">This month</span>
            <Link href="/dashboard/reports" className="text-xs font-semibold text-blue-700 transition hover:text-blue-900">
              Reports →
            </Link>
          </div>
          <div className="grid grid-cols-3 gap-2 px-5 pb-4 pt-2">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Revenue</p>
              <p className="truncate text-sm font-bold text-zinc-900 sm:text-base">{formatCurrencyCompact(revenue)}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Expenses</p>
              <p className="truncate text-sm font-bold text-zinc-900 sm:text-base">{formatCurrencyCompact(expenses)}</p>
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Net</p>
              <p className={`truncate text-sm font-bold sm:text-base ${revenue - expenses >= 0 ? "text-green-700" : "text-red-700"}`}>
                {formatCurrencyCompact(revenue - expenses)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Locker keys — quiet status line */}
      <div className={`${cardClass} flex flex-wrap items-center justify-between gap-2 px-5 py-4`}>
        <p className="text-sm text-zinc-600">
          <span className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Locker keys</span>{" "}
          <span className="ml-2">
            <span className="font-semibold text-zinc-900">{keysAvailable}</span> available ·{" "}
            <span className="font-semibold text-zinc-900">{keysIssued}</span> issued
          </span>
        </p>
        <Link href="/dashboard/locker-keys" className="text-xs font-semibold text-blue-700 hover:text-blue-900">
          Manage Locker Keys →
        </Link>
      </div>
    </div>
  );
}

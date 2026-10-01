import { createClient } from "@/lib/supabase/server";
import { daysUntil, todayIST, addDaysIST, deriveMemberStatus } from "@/lib/utils";
import { MembersTable, type MemberRow } from "@/components/members/members-table";
import { MemberSearch } from "@/components/members/member-search";
import { SummaryPills } from "@/components/members/summary-pills";
import Link from "next/link";
import ExportButton from "@/components/members/export-button";
import { MobilePageHeader } from "@/components/ui/mobile-page-header";

export default async function MembersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; filter?: string; page?: string; sort?: string; order?: string }>;
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
    .select("gym_id")
    .eq("id", user!.id)
    .single();

  const gymId = userData!.gym_id;
  const params = await searchParams;
  const query = params.q ?? "";
  const validStatus = ["all", "active", "expiring", "frozen", "cancelled", "deactivated", "blacklisted"];
  const statusFilter = validStatus.includes(params.status ?? "") ? params.status! : "all";
  const expiryFilter = params.filter ?? "all";
  const page = Math.max(1, parseInt(params.page ?? "1"));
  const pageSize = 25;
  const validSorts = ["first_name", "phone", "created_at", "end_date"];
  const sortCol = validSorts.includes(params.sort ?? "") ? params.sort! : "created_at";
  const sortOrder = params.order === "asc" ? "asc" : "desc";

  // Derived-status filters via bucket ids (server-side SQL). Only these tabs
  // need a pre-resolution round trip; everything else runs in ONE batch below.
  let statusIds: string[] | null = null;
  if (["active", "expiring", "frozen", "cancelled"].includes(statusFilter)) {
    const { data: buckets } = await supabase.rpc("member_bucket_ids", { p_gym_id: gymId });
    const ids = (buckets ?? []).filter((b: any) => b.bucket === statusFilter).map((b: any) => b.member_id);
    statusIds = ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"];
  }

  let memberQuery = supabase
    .from("members")
    .select(
      "id, first_name, last_name, phone, status, photo_url, created_at, group_id, member_groups(name), memberships(id, status, start_date, end_date, payment_status, total_amount, amount_paid, package_id, package_name, packages(name, type, service_type))",
      { count: "exact" }
    )
    .eq("gym_id", gymId);

  // "All" = the operational list (live members); deactivated/blacklisted have
  // their own tabs
  memberQuery = memberQuery.eq(
    "status",
    statusFilter === "deactivated" || statusFilter === "blacklisted" ? statusFilter : "active"
  );

  if (statusIds !== null) {
    memberQuery = memberQuery.in("id", statusIds);
  }

  memberQuery = memberQuery.range((page - 1) * pageSize, page * pageSize - 1);

  const sortOnMembers = sortCol !== "end_date";
  if (sortOnMembers) {
    memberQuery = memberQuery.order(sortCol, { ascending: sortOrder === "asc" });
  }

  if (query) {
    memberQuery = memberQuery.or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,phone.ilike.%${query}%`);
  }

  if (expiryFilter !== "all") {
    const today = todayIST();
    if (expiryFilter === "expired") {
      const [{ data: expiredMs }, { data: activeMs }] = await Promise.all([
        supabase
          .from("memberships")
          .select("member_id")
          .eq("gym_id", gymId)
          .lt("end_date", today),
        supabase
          .from("memberships")
          .select("member_id")
          .eq("gym_id", gymId)
          .eq("status", "active")
          .gte("end_date", today),
      ]);
      const activeIds = new Set((activeMs ?? []).map((m: any) => m.member_id));
      const ids = [...new Set((expiredMs ?? []).map((m: any) => m.member_id))].filter(
        (id) => !activeIds.has(id)
      );
      memberQuery = memberQuery.in("id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);
    } else {
      const days = expiryFilter === "week" ? 7 : 30;
      const endDate = addDaysIST(days);
      const { data: expiringMemberIds } = await supabase
        .from("memberships")
        .select("member_id")
        .eq("gym_id", gymId)
        .eq("status", "active")
        .gte("end_date", today)
        .lte("end_date", endDate);
      const ids = (expiringMemberIds ?? []).map((m: any) => m.member_id);
      memberQuery = memberQuery.in("id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);
    }
  }

  // ONE parallel batch: stats + freeze flags + member rows + packages +
  // settings together — a single round trip on the default view
  const [
    statsRes,
    freezeRes,
    membersRes,
    packagesRes,
    settingsRes,
  ] = await Promise.all([
    supabase.rpc("member_overview_stats", { p_gym_id: gymId }).single(),
    supabase
      .from("membership_freezes")
      .select("member_id")
      .eq("gym_id", gymId)
      .in("status", ["pending", "active", "approved"]),
    memberQuery,
    supabase
      .from("packages")
      .select("*")
      .eq("gym_id", gymId)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase.from("gym_settings").select("gst_mode").eq("gym_id", gymId).single(),
  ]);

  const stats = statsRes.data;
  const frozenIds = new Set((freezeRes.data ?? []).map((f: any) => f.member_id));
  const members = membersRes.data;
  const count = membersRes.count;
  const packages = packagesRes.data;
  const settings = settingsRes.data;

  // Per-row summaries computed server-side — the table just renders
  const today = todayIST();
  let rows: MemberRow[] = (members ?? []).map((m: any) => {
    const activeList = (m.memberships ?? [])
      .filter((ms: any) => ms.status === "active" && ms.start_date <= today && ms.end_date >= today)
      .sort((a: any, b: any) => a.end_date.localeCompare(b.end_date));

    // Never show the same package twice (e.g. legacy double-booked enrollments)
    const seen = new Set<string>();
    const dedupActive = activeList.filter((ms: any) => {
      if (seen.has(ms.package_id)) return false;
      seen.add(ms.package_id);
      return true;
    });

    const plans = dedupActive.map((ms: any) => ({
      id: ms.id,
      serviceType: ms.packages?.service_type ?? "gym",
      name: ms.package_name ?? ms.packages?.name ?? "Membership",
      endDate: ms.end_date,
      daysLeft: daysUntil(ms.end_date),
      amountPaid: Number(ms.amount_paid),
      paymentStatus: ms.payment_status,
    }));

    const due = activeList.reduce(
      (s: number, ms: any) => s + Math.max(0, Number(ms.total_amount) - Number(ms.amount_paid)),
      0
    );
    const paidCount = dedupActive.filter((ms: any) => ms.payment_status === "paid").length;
    const pendingCount = dedupActive.filter((ms: any) => ms.payment_status !== "paid").length;

    const nextEnd = activeList.length > 0 ? activeList[0].end_date : null;
    const days = nextEnd ? daysUntil(nextEnd) : null;

    const derived = deriveMemberStatus(m);
    const frozen = frozenIds.has(m.id);
    const status = frozen
      ? { label: "Frozen", cls: "bg-blue-100 text-blue-700" }
      : { label: derived.label, cls: derived.cls };

    return {
      id: m.id,
      firstName: m.first_name,
      lastName: m.last_name,
      phone: m.phone,
      photoUrl: m.photo_url,
      groupName: m.member_groups?.name ?? null,
      plans,
      morePlans: activeList.length - dedupActive.length,
      payment: { due, paidCount, pendingCount },
      expiry: nextEnd ? { date: nextEnd, days: days ?? 0 } : null,
      status,
      flags: {
        isExpiring: days !== null && days <= 7,
        isExpired: derived.label === "Expired",
        hasDue: due > 0.01,
        hasActive: activeList.length > 0,
      },
    };
  });

  // end_date sorting happens within the current page
  if (!sortOnMembers && rows.length > 0) {
    rows = [...rows].sort((a, b) => {
      const aEnd = a.expiry?.date ?? "9999";
      const bEnd = b.expiry?.date ?? "9999";
      return sortOrder === "asc" ? aEnd.localeCompare(bEnd) : bEnd.localeCompare(aEnd);
    });
  }

  const statsAny = stats as any;

  return (
    <div className="space-y-5">
      <MobilePageHeader title="Members" actionHref="/dashboard/members/new" actionLabel="+ New" />
      <div className="hidden flex-wrap items-center justify-between gap-3 md:flex">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Members</h1>
          <p className="mt-0.5 text-sm text-zinc-500">{count ?? 0} members</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton />
          <ExportButton href="/api/export/memberships" label="Export Memberships" filename="memberships" />
          <Link
            href="/dashboard/members/new"
            className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            New Enrollment
          </Link>
        </div>
      </div>

      {/* Summary strip — instant transition pills (client) */}
      <SummaryPills stats={statsAny} count={count} statusFilter={statusFilter} />

      <MemberSearch />

      <MembersTable
        rows={rows}
        packages={packages ?? []}
        gstMode={settings?.gst_mode ?? "exclusive"}
        sortCol={sortCol}
        sortOrder={sortOrder}
        baseParams={{ q: query, status: statusFilter, filter: expiryFilter }}
      />

      {/* Pagination */}
      {count !== null && count > pageSize && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-500">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, count)} of {count}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/dashboard/members?${new URLSearchParams({ ...params, page: String(page - 1) }).toString()}`}
                className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
              >
                ← Prev
              </Link>
            )}
            {page * pageSize < count && (
              <Link
                href={`/dashboard/members?${new URLSearchParams({ ...params, page: String(page + 1) }).toString()}`}
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

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseDateRange, rangeFromBound, rangeToBound, csvResponse } from "@/lib/reports";
import { todayIST } from "@/lib/utils";

// Full Report — a summary CSV of the whole overview (financial, membership
// activity, package performance) for the selected period. Numbers come from
// the same queries as the overview page.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id")
    .eq("id", (await supabase.auth.getUser()).data.user!.id)
    .single();
  if (!userData) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const gymId = userData.gym_id;

  const sp = request.nextUrl.searchParams;
  const range = parseDateRange({ from: sp.get("from") ?? undefined, to: sp.get("to") ?? undefined, preset: sp.get("preset") ?? undefined });

  const [payments, expenses, newEnrollments, renewals, ending, newMembers, deleted, outstandingMs, packageSales] =
    await Promise.all([
      supabase
        .from("payments")
        .select("amount, mode, receipts!receipts_payment_id_fkey(voided_at)")
        .eq("gym_id", gymId)
        .gte("payment_date", range.from)
        .lte("payment_date", range.to),
      supabase.from("expenses").select("amount").eq("gym_id", gymId).gte("expense_date", range.from).lte("expense_date", range.to),
      supabase.from("memberships").select("id", { count: "exact", head: true }).eq("gym_id", gymId).gte("created_at", rangeFromBound(range.from)).lte("created_at", rangeToBound(range.to)),
      supabase.from("member_events").select("id", { count: "exact", head: true }).eq("gym_id", gymId).eq("event_type", "renewal").gte("created_at", rangeFromBound(range.from)).lte("created_at", rangeToBound(range.to)),
      supabase.from("memberships").select("id", { count: "exact", head: true }).eq("gym_id", gymId).gte("end_date", range.from).lte("end_date", range.to).neq("status", "cancelled"),
      supabase.from("members").select("id", { count: "exact", head: true }).eq("gym_id", gymId).gte("created_at", rangeFromBound(range.from)).lte("created_at", rangeToBound(range.to)),
      supabase.from("audit_logs").select("id", { count: "exact", head: true }).eq("gym_id", gymId).eq("action", "member.deleted").gte("created_at", rangeFromBound(range.from)).lte("created_at", rangeToBound(range.to)),
      supabase.from("memberships").select("total_amount, amount_paid").eq("gym_id", gymId).eq("status", "active").in("payment_status", ["partial", "pending"]).range(0, 9999),
      supabase.from("memberships").select("package_id, package_name, total_amount, packages(name)").eq("gym_id", gymId).gte("created_at", rangeFromBound(range.from)).lte("created_at", rangeToBound(range.to)).range(0, 4999),
    ]);

  const valid = (payments.data ?? []).filter((p: any) => !p.receipts?.[0]?.voided_at);
  const revenue = valid.reduce((s: number, p: any) => s + Number(p.amount), 0);
  const totalExpenses = (expenses.data ?? []).reduce((s: number, e: any) => s + Number(e.amount), 0);
  const outstanding = (outstandingMs.data ?? []).reduce((s: number, m: any) => s + Math.max(0, Number(m.total_amount) - Number(m.amount_paid)), 0);

  const pkgMap = new Map<string, { name: string; count: number; value: number }>();
  (packageSales.data ?? []).forEach((ms: any) => {
    const entry = pkgMap.get(ms.package_id) ?? { name: ms.package_name ?? ms.packages?.name ?? "Unknown", count: 0, value: 0 };
    entry.count += 1;
    entry.value += Number(ms.total_amount);
    pkgMap.set(ms.package_id, entry);
  });

  const rows: (string | number | null)[][] = [
    [`Full Report — ${range.from} to ${range.to} (generated ${todayIST()})`],
    [],
    ["Section", "Metric", "Value"],
    ["Financial", "Revenue (payments collected)", revenue.toFixed(2)],
    ["Financial", "Payments collected", valid.length],
    ["Financial", "Expenses", totalExpenses.toFixed(2)],
    ["Financial", "Net Profit", (revenue - totalExpenses).toFixed(2)],
    ["Financial", "Outstanding dues (current, all periods)", outstanding.toFixed(2)],
    ["Membership", "New enrollments", newEnrollments.count ?? 0],
    ["Membership", "Renewals", renewals.count ?? 0],
    ["Membership", "Memberships ending", ending.count ?? 0],
    ["Membership", "New members", newMembers.count ?? 0],
    ["Membership", "Members deleted", deleted.count ?? 0],
    ["Membership", "Net member growth", (newMembers.count ?? 0) - (deleted.count ?? 0)],
    [],
    ["Package", "Enrollments", "Value"],
    ...[...pkgMap.values()]
      .sort((a, b) => b.value - a.value)
      .map((p) => ["Package Performance", p.name, `${p.count} enrollments, ${p.value.toFixed(2)}`]),
  ];

  return csvResponse(rows, `report-full-${range.from}-to-${range.to}.csv`);
}

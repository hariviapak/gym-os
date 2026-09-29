import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayIST, deriveMemberStatus, serviceLabel } from "@/lib/utils";

// Flattened memberships export — ONE ROW PER LIVE MEMBERSHIP (active/frozen),
// with the member's contact info repeated. This is the analysis-friendly view:
// filter by service, pivot revenue, count memberships per package — without
// duplicating people in the roster export.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: userData } = await supabase
    .from("users")
    .select("gym_id")
    .eq("id", user.id)
    .single();

  if (!userData) {
    return NextResponse.json({ error: "No gym assigned" }, { status: 403 });
  }
  const gymId = userData.gym_id;

  const [{ data: rows }, { data: groups }] = await Promise.all([
    supabase
      .from("memberships")
      .select(
        `id, status, payment_status, start_date, end_date, total_amount, amount_paid, payment_group_id,
         package_name, packages(name, type, service_type),
         members!inner(id, first_name, last_name, phone, email, status, group_id, created_at)`
      )
      .eq("gym_id", gymId)
      .in("status", ["active", "frozen"])
      .order("start_date", { ascending: false }),
    supabase.from("member_groups").select("id, name").eq("gym_id", gymId),
  ]);

  const groupName = new Map((groups ?? []).map((g: any) => [g.id, g.name]));

  // member-level derived status (active/expiring/expired) for the roster column
  const statusByMember = new Map<string, string>();
  const seen = new Set<string>();
  for (const r of (rows ?? []) as any[]) {
    seen.add(r.members.id);
  }
  if (seen.size) {
    const { data: memberRows } = await supabase
      .from("memberships")
      .select("member_id, status, start_date, end_date")
      .eq("gym_id", gymId)
      .in("member_id", [...seen]);
    const byMember = new Map<string, any[]>();
    (memberRows ?? []).forEach((ms: any) => {
      const list = byMember.get(ms.member_id) ?? [];
      list.push(ms);
      byMember.set(ms.member_id, list);
    });
    for (const r of (rows ?? []) as any[]) {
      statusByMember.set(
        r.members.id,
        deriveMemberStatus({ status: r.members.status, memberships: byMember.get(r.members.id) ?? [] }).label
      );
    }
  }

  const headers = [
    "First Name",
    "Last Name",
    "Phone",
    "Email",
    "Group",
    "Member Status",
    "Joined",
    "Package",
    "Service",
    "Start Date",
    "End Date",
    "Membership Status",
    "Payment Status",
    "Total",
    "Paid",
    "Outstanding",
    "Family/Bill Group",
  ];

  const csvRows = (rows ?? []).map((r: any) => {
    const m = r.members;
    const outstanding = Math.max(0, Number(r.total_amount) - Number(r.amount_paid));
    return [
      m.first_name,
      m.last_name ?? "",
      m.phone ?? "",
      m.email ?? "",
      m.group_id ? (groupName.get(m.group_id) ?? "") : "",
      statusByMember.get(m.id) ?? "",
      m.created_at ? new Date(m.created_at).toLocaleDateString("en-IN") : "",
      r.package_name ?? r.packages?.name ?? "",
      serviceLabel(r.packages?.service_type ?? "gym"),
      r.start_date,
      r.end_date,
      r.status === "frozen" ? "frozen" : r.start_date > todayIST() ? "upcoming" : r.status,
      r.payment_status,
      Number(r.total_amount).toFixed(2),
      Number(r.amount_paid).toFixed(2),
      outstanding ? outstanding.toFixed(2) : "",
      r.payment_group_id ?? "",
    ].map((v) => escapeCsv(String(v)));
  });

  const csv = [headers.join(","), ...csvRows.map((r) => r.join(","))].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="memberships-${todayIST()}.csv"`,
    },
  });
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

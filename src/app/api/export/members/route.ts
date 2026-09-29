import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayIST, deriveMemberStatus } from "@/lib/utils";

// Full member roster export — one row per member with contact details, group,
// memberships, money summary, and locker keys. Everything the front desk /
// owner needs for backup, WhatsApp lists, or accounting.
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

  const [{ data: members }, { data: memberships }, { data: payments }, { data: keys }, { data: groups }] =
    await Promise.all([
      supabase
        .from("members")
        .select(
          "id, first_name, last_name, phone, email, gender, date_of_birth, address, emergency_contact_name, emergency_contact_phone, medical_notes, injury_notes, referred_by, status, group_id, created_at"
        )
        .eq("gym_id", gymId)
        .order("first_name"),
      supabase
        .from("memberships")
        .select("id, member_id, package_name, packages(name), status, payment_status, start_date, end_date, total_amount, amount_paid")
        .eq("gym_id", gymId)
        .in("status", ["active", "frozen", "cancelled"]),
      supabase.from("payments").select("member_id, amount").eq("gym_id", gymId),
      supabase.from("locker_keys").select("member_id, key_number").eq("gym_id", gymId).eq("status", "issued"),
      supabase.from("member_groups").select("id, name").eq("gym_id", gymId),
    ]);

  const groupName = new Map((groups ?? []).map((g: any) => [g.id, g.name]));

  // index per member
  const msByMember = new Map<string, any[]>();
  (memberships ?? []).forEach((ms: any) => {
    const list = msByMember.get(ms.member_id) ?? [];
    list.push(ms);
    msByMember.set(ms.member_id, list);
  });
  const paidByMember = new Map<string, number>();
  (payments ?? []).forEach((p: any) => {
    paidByMember.set(p.member_id, (paidByMember.get(p.member_id) ?? 0) + Number(p.amount));
  });
  const keysByMember = new Map<string, string[]>();
  (keys ?? []).forEach((k: any) => {
    const list = keysByMember.get(k.member_id) ?? [];
    list.push(k.key_number);
    keysByMember.set(k.member_id, list);
  });

  const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleDateString("en-IN") : "");

  const headers = [
    "First Name",
    "Last Name",
    "Phone",
    "Email",
    "Gender",
    "Date of Birth",
    "Address",
    "Emergency Contact",
    "Emergency Phone",
    "Medical Notes",
    "Injury Notes",
    "Referred By",
    "Group",
    "Status",
    "Joined",
    "Active Memberships",
    "Membership Periods",
    "Membership Value",
    "Paid on Memberships",
    "Outstanding",
    "Total Paid (all time)",
    "Locker Keys",
  ];

  const rows = (members ?? []).map((m: any) => {
    const all = msByMember.get(m.id) ?? [];
    // live memberships: active (incl. future-dated) and frozen (paused but ongoing)
    const live = all.filter((ms) => ms.status === "active" || ms.status === "frozen");
    const pkgName = (ms: any) => ms.package_name ?? ms.packages?.name ?? "";
    const outstanding = live.reduce((s, ms) => s + Math.max(0, Number(ms.total_amount) - Number(ms.amount_paid)), 0);
    const value = live.reduce((s, ms) => s + Number(ms.total_amount), 0);
    const paidOnMs = live.reduce((s, ms) => s + Number(ms.amount_paid), 0);
    return [
      m.first_name,
      m.last_name ?? "",
      m.phone ?? "",
      m.email ?? "",
      m.gender ?? "",
      fmtDate(m.date_of_birth),
      m.address ?? "",
      m.emergency_contact_name ?? "",
      m.emergency_contact_phone ?? "",
      m.medical_notes ?? "",
      m.injury_notes ?? "",
      m.referred_by ?? "",
      m.group_id ? (groupName.get(m.group_id) ?? "") : "",
      deriveMemberStatus({ status: m.status, memberships: all }).label,
      fmtDate(m.created_at),
      live.map((ms) => (ms.status === "frozen" ? `${pkgName(ms)} (frozen)` : pkgName(ms))).filter(Boolean).join("; "),
      live.map((ms) => `${pkgName(ms)}: ${ms.start_date} → ${ms.end_date}${ms.status === "frozen" ? " (frozen)" : ""}`).join("; "),
      value ? value.toFixed(2) : "",
      paidOnMs ? paidOnMs.toFixed(2) : "",
      outstanding ? outstanding.toFixed(2) : "",
      (paidByMember.get(m.id) ?? 0).toFixed(2),
      (keysByMember.get(m.id) ?? []).join("; "),
    ].map((v) => escapeCsv(String(v)));
  });

  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="members-full-${todayIST()}.csv"`,
    },
  });
}

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

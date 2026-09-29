import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayIST } from "@/lib/utils";

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
    .select("gym_id, role")
    .eq("id", user.id)
    .single();

  if (!userData || !["owner", "admin", "manager"].includes(userData.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from") ?? todayIST();
  const to = searchParams.get("to") ?? todayIST();
  const toDateEnd = to + "T23:59:59";

  const [enrollments, renewals, expirations, newMembers] = await Promise.all([
    supabase
      .from("memberships")
      .select("start_date, end_date, total_amount, amount_paid, payment_status, members(first_name, last_name, phone), packages(name)")
      .eq("gym_id", userData.gym_id)
      .gte("created_at", from)
      .lte("created_at", toDateEnd)
      .order("created_at", { ascending: false }),
    supabase
      .from("member_events")
      .select("title, description, created_at, members(first_name, last_name, phone)")
      .eq("gym_id", userData.gym_id)
      .eq("event_type", "renewal")
      .gte("created_at", from)
      .lte("created_at", toDateEnd)
      .order("created_at", { ascending: false }),
    supabase
      .from("member_events")
      .select("title, description, created_at, members(first_name, last_name, phone)")
      .eq("gym_id", userData.gym_id)
      .eq("event_type", "expiry")
      .gte("created_at", from)
      .lte("created_at", toDateEnd)
      .order("created_at", { ascending: false }),
    supabase
      .from("members")
      .select("first_name, last_name, phone, status, created_at")
      .eq("gym_id", userData.gym_id)
      .gte("created_at", from)
      .lte("created_at", toDateEnd)
      .order("created_at", { ascending: false }),
  ]);

  const rows: string[][] = [];

  rows.push(["=== NEW ENROLLMENTS ==="]);
  rows.push(["Member", "Phone", "Package", "Start Date", "End Date", "Total Amount", "Amount Paid", "Payment Status"]);
  (enrollments.data ?? []).forEach((m: any) => {
    rows.push([
      `${m.members?.first_name ?? ""} ${m.members?.last_name ?? ""}`.trim(),
      m.members?.phone ?? "",
      m.packages?.name ?? "",
      m.start_date,
      m.end_date,
      Number(m.total_amount).toFixed(2),
      Number(m.amount_paid).toFixed(2),
      m.payment_status,
    ]);
  });

  rows.push([]);
  rows.push(["=== RENEWALS ==="]);
  rows.push(["Member", "Phone", "Title", "Description", "Date"]);
  (renewals.data ?? []).forEach((e: any) => {
    rows.push([
      `${e.members?.first_name ?? ""} ${e.members?.last_name ?? ""}`.trim(),
      e.members?.phone ?? "",
      e.title,
      e.description ?? "",
      new Date(e.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
    ]);
  });

  rows.push([]);
  rows.push(["=== EXPIRATIONS ==="]);
  rows.push(["Member", "Phone", "Title", "Description", "Date"]);
  (expirations.data ?? []).forEach((e: any) => {
    rows.push([
      `${e.members?.first_name ?? ""} ${e.members?.last_name ?? ""}`.trim(),
      e.members?.phone ?? "",
      e.title,
      e.description ?? "",
      new Date(e.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
    ]);
  });

  rows.push([]);
  rows.push(["=== NEW MEMBERS ==="]);
  rows.push(["Member", "Phone", "Status", "Joined Date"]);
  (newMembers.data ?? []).forEach((m: any) => {
    rows.push([
      `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim(),
      m.phone ?? "",
      m.status,
      new Date(m.created_at).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }),
    ]);
  });

  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="membership-report-${from}-to-${to}.csv"`,
    },
  });
}

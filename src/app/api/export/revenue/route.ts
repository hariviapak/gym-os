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

  const { data: payments } = await supabase
    .from("payments")
    .select("amount, mode, reference_note, payment_date, created_at, members(first_name, last_name, phone), receipts!receipts_payment_id_fkey(voided_at)")
    .eq("gym_id", userData.gym_id)
    .gte("payment_date", from)
    .lte("payment_date", to)
    .order("created_at", { ascending: false });

  const rows = [
    ["Date", "Member", "Phone", "Amount", "Mode", "Reference", "Voided"],
    ...(payments ?? []).map((p: any) => [
      p.payment_date,
      `${p.members?.first_name ?? ""} ${p.members?.last_name ?? ""}`.trim(),
      p.members?.phone ?? "",
      Number(p.amount).toFixed(2),
      p.mode,
      p.reference_note ?? "",
      p.receipts?.[0]?.voided_at ? "Yes" : "No",
    ]),
  ];

  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="revenue-${from}-to-${to}.csv"`,
    },
  });
}

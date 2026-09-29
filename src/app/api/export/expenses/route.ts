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

  const { data: expenses } = await supabase
    .from("expenses")
    .select("amount, category, description, expense_date, created_at")
    .eq("gym_id", userData.gym_id)
    .gte("expense_date", from)
    .lte("expense_date", to)
    .order("created_at", { ascending: false });

  const rows = [
    ["Date", "Category", "Description", "Amount"],
    ...(expenses ?? []).map((e: any) => [
      e.expense_date,
      e.category ?? "",
      e.description ?? "",
      Number(e.amount).toFixed(2),
    ]),
  ];

  const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="expenses-${from}-to-${to}.csv"`,
    },
  });
}

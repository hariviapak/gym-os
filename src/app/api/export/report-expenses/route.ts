import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseDateRange, fetchExpenses, csvResponse } from "@/lib/reports";

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

  const { data: expenses } = await fetchExpenses(
    supabase,
    gymId,
    range,
    { q: sp.get("q") ?? "", categoryId: sp.get("category") ?? "all" },
    "id, amount, title, description, expense_date, expense_categories(name), users!expenses_created_by_fkey(name)"
  );

  const rows: (string | number | null)[][] = [
    ["Date", "Category", "Description", "Amount", "Recorded By"],
    ...(expenses ?? []).map((e: any) => [
      e.expense_date,
      e.expense_categories?.name ?? "",
      e.description ?? e.title ?? "",
      Number(e.amount).toFixed(2),
      e.users?.name ?? "",
    ]),
  ];

  return csvResponse(rows, `report-expenses-${range.from}-to-${range.to}.csv`);
}

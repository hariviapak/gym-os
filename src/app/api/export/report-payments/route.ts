import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseDateRange, fetchPayments, csvResponse } from "@/lib/reports";

// Payments export — respects the global date range + search + filters exactly
// as the Revenue Details view.
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

  const columns =
    "id, amount, mode, reference_note, payment_date, members(first_name, last_name, phone), users!payments_created_by_fkey(name), receipts!receipts_payment_id_fkey(voided_at)";

  const { data: payments } = await fetchPayments(
    supabase,
    gymId,
    range,
    { q: sp.get("q") ?? "", mode: sp.get("mode") ?? "all", status: sp.get("status") ?? "all" },
    columns
  );

  const rows: (string | number | null)[][] = [
    ["Date", "Member Name", "Phone", "Amount", "Payment Method", "Payment Status", "Reference", "Recorded By"],
    ...(payments ?? []).map((p: any) => [
      p.payment_date,
      `${p.members?.first_name ?? ""} ${p.members?.last_name ?? ""}`.trim(),
      p.members?.phone ?? "",
      Number(p.amount).toFixed(2),
      p.mode,
      p.receipts?.[0]?.voided_at ? "Voided" : "Collected",
      p.reference_note ?? "",
      p.users?.name ?? "",
    ]),
  ];

  return csvResponse(rows, `report-payments-${range.from}-to-${range.to}.csv`);
}

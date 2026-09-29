import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseDateRange, fetchRenewals, csvResponse } from "@/lib/reports";

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

  const { data: events } = await fetchRenewals(
    supabase,
    gymId,
    range,
    sp.get("q") ?? "",
    "id, member_id, metadata, created_at, members(first_name, last_name, phone)"
  );

  const msIds = (events ?? []).map((e: any) => e.metadata?.membership_id).filter(Boolean);
  const { data: memberships } = msIds.length
    ? await supabase
        .from("memberships")
        .select("id, package_name, start_date, end_date, total_amount, packages(name)")
        .in("id", msIds)
    : { data: [] };
  const msById = new Map((memberships ?? []).map((ms: any) => [ms.id, ms]));

  const rows: (string | number | null)[][] = [
    ["Renewed On", "Member Name", "Phone", "Package", "Start Date", "End Date", "Amount"],
    ...(events ?? []).map((ev: any) => {
      const ms = msById.get(ev.metadata?.membership_id);
      return [
        (ev.created_at ?? "").slice(0, 10),
        `${ev.members?.first_name ?? ""} ${ev.members?.last_name ?? ""}`.trim(),
        ev.members?.phone ?? "",
        ms?.package_name ?? ms?.packages?.name ?? "",
        ms?.start_date ?? "",
        ms?.end_date ?? "",
        ms ? Number(ms.total_amount).toFixed(2) : "",
      ];
    }),
  ];

  return csvResponse(rows, `report-renewals-${range.from}-to-${range.to}.csv`);
}

import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseDateRange, fetchNewMembers, csvResponse } from "@/lib/reports";

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

  const { data: members } = await fetchNewMembers(
    supabase,
    gymId,
    range,
    { q: sp.get("q") ?? "" },
    "id, first_name, last_name, phone, gender, status, created_at"
  );

  const rows: (string | number | null)[][] = [
    ["Member Name", "Phone", "Gender", "Joined", "Status"],
    ...(members ?? []).map((m: any) => [
      `${m.first_name ?? ""} ${m.last_name ?? ""}`.trim(),
      m.phone ?? "",
      m.gender ?? "",
      (m.created_at ?? "").slice(0, 10),
      m.status,
    ]),
  ];

  return csvResponse(rows, `report-member-growth-${range.from}-to-${range.to}.csv`);
}

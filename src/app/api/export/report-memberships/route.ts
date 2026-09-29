import { NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parseDateRange, fetchMemberships, csvResponse } from "@/lib/reports";
import { serviceLabel } from "@/lib/utils";

// Memberships export (enrollments or endings in period) — same filters as the
// drill-down. cols=sales switches to the package-sales column shape.
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
  const basis = sp.get("basis") === "ending" ? "ending" : "created";
  const salesShape = sp.get("cols") === "sales";

  const columns =
    "id, member_id, package_name, status, payment_status, start_date, end_date, total_amount, amount_paid, created_at, packages(name, type, service_type), members(first_name, last_name, phone)";

  const { data: memberships } = await fetchMemberships(
    supabase,
    gymId,
    range,
    basis,
    {
      q: sp.get("q") ?? "",
      packageId: sp.get("package") ?? "all",
      status: sp.get("status") ?? "all",
      serviceType: sp.get("service_type") ?? "all",
    },
    columns
  );

  const rows: (string | number | null)[][] = salesShape
    ? [
        ["Package", "Member Name", "Phone", "Purchase Date", "Start Date", "End Date", "Amount", "Payment Status"],
        ...(memberships ?? []).map((ms: any) => [
          ms.package_name ?? ms.packages?.name ?? "",
          `${ms.members?.first_name ?? ""} ${ms.members?.last_name ?? ""}`.trim(),
          ms.members?.phone ?? "",
          (ms.created_at ?? "").slice(0, 10),
          ms.start_date,
          ms.end_date,
          Number(ms.total_amount).toFixed(2),
          ms.payment_status,
        ]),
      ]
    : [
        ["Member Name", "Phone", "Package", "Type", "Start Date", "End Date", "Status", "Amount", "Payment Status"],
        ...(memberships ?? []).map((ms: any) => [
          `${ms.members?.first_name ?? ""} ${ms.members?.last_name ?? ""}`.trim(),
          ms.members?.phone ?? "",
          ms.package_name ?? ms.packages?.name ?? "",
          serviceLabel(ms.packages?.service_type ?? "gym"),
          ms.start_date,
          ms.end_date,
          ms.status,
          Number(ms.total_amount).toFixed(2),
          ms.payment_status,
        ]),
      ];

  return csvResponse(rows, `report-memberships-${range.from}-to-${range.to}.csv`);
}

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
    .select("gym_id")
    .eq("id", user.id)
    .single();

  if (!userData) {
    return NextResponse.json({ error: "No gym assigned" }, { status: 403 });
  }

  const { data: payments } = await supabase
    .from("payments")
    .select("amount, mode, reference_note, payment_date, created_at, members(first_name, last_name, phone)")
    .eq("gym_id", userData.gym_id)
    .order("created_at", { ascending: false });

  const headers = [
    "Member Name", "Phone", "Amount", "Mode", "Reference", "Payment Date", "Recorded At"
  ];

  const csvRows = [
    headers.join(","),
    ...(payments ?? []).map((p: any) =>
      [
        escapeCsv(`${p.members?.first_name ?? ""} ${p.members?.last_name ?? ""}`),
        escapeCsv(p.members?.phone ?? ""),
        escapeCsv(String(p.amount)),
        escapeCsv(p.mode),
        escapeCsv(p.reference_note ?? ""),
        escapeCsv(p.payment_date),
        escapeCsv(new Date(p.created_at).toLocaleString("en-IN")),
      ].join(",")
    ),
  ];

  const csv = csvRows.join("\n");

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="payments-${todayIST()}.csv"`,
    },
  });
}

function escapeCsv(value: string): string {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

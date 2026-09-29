import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { normalizePhone } from "@/lib/utils";

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

  const raw = request.nextUrl.searchParams.get("phone") ?? "";
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) {
    return NextResponse.json({ found: false, member: null });
  }

  const normalized = normalizePhone(digits);
  const { data: member } = await supabase
    .from("members")
    .select("id, first_name, last_name")
    .eq("gym_id", userData.gym_id)
    .or(`phone.eq.${normalized},phone.eq.${digits},phone.eq.+91${digits}`)
    .maybeSingle();

  return NextResponse.json({
    found: !!member,
    member: member
      ? { id: member.id, name: [member.first_name, member.last_name].filter(Boolean).join(" ") }
      : null,
  });
}

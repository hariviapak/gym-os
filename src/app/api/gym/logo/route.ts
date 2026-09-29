import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/actions/audit";

export async function POST(request: NextRequest) {
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

  if (!userData || !["owner", "admin"].includes(userData.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { logoUrl } = body as { logoUrl: string };

  if (!logoUrl) {
    return NextResponse.json({ error: "Missing logoUrl" }, { status: 400 });
  }

  const { error } = await supabase
    .from("gyms")
    .update({ logo_url: logoUrl })
    .eq("id", userData.gym_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit({
    action: "gym.logo_updated",
    entity_type: "gyms",
    entity_id: userData.gym_id,
  });

  return NextResponse.json({ ok: true });
}

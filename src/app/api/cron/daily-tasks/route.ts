import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayIST, addDaysIST, dateToIST } from "@/lib/utils";

export async function POST(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();
  const today = todayIST();
  const results: Record<string, unknown> = {};

  // 1. Mark expired memberships
  const { data: expiredMemberships, error: expError } = await supabase
    .from("memberships")
    .update({ status: "expired" })
    .eq("status", "active")
    .lt("end_date", today)
    .select("id, member_id, gym_id, end_date");

  results.expiredMemberships = expiredMemberships?.length ?? 0;

  // 2. Log expiry events
  if (expiredMemberships && expiredMemberships.length > 0) {
    await supabase.from("member_events").insert(
      expiredMemberships.map((m) => ({
        gym_id: m.gym_id,
        member_id: m.member_id,
        event_type: "expiry" as const,
        title: "Membership expired",
        description: `Expired on ${m.end_date}`,
        metadata: { membership_id: m.id },
      }))
    );
  }

  // 3. Find memberships expiring within 3 days (for alerts)
  const { data: expiringSoon } = await supabase
    .from("memberships")
    .select("id, member_id, gym_id, end_date, members(first_name, last_name, phone)")
    .eq("status", "active")
    .gte("end_date", today)
    .lte("end_date", addDaysIST(3));

  results.expiringSoon = expiringSoon?.length ?? 0;

  // 4. Find members who haven't visited in 7+ days (Phase 2 — attendance not yet available)
  // TODO: Add no-visit alerts once attendance table is populated

  // 5. Reconciliation: check for memberships past end_date + grace period still marked active
  const { data: settings } = await supabase
    .from("gym_settings")
    .select("grace_period_days");

  const gracePeriod = settings?.[0]?.grace_period_days ?? 0;
  const graceDate = new Date();
  graceDate.setDate(graceDate.getDate() - gracePeriod);
  const graceDateStr = dateToIST(graceDate);

  const { data: pastGrace } = await supabase
    .from("memberships")
    .select("id, member_id, gym_id, end_date")
    .eq("status", "active")
    .lt("end_date", graceDateStr);

  results.pastGracePeriod = pastGrace?.length ?? 0;

  return NextResponse.json({
    ok: true,
    date: today,
    results,
  });
}

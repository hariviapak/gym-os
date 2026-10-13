"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { todayIST, dateToIST } from "@/lib/utils";
import { logAudit } from "@/lib/actions/audit";

// Shared freeze-approval effects: extend the membership end by the frozen
// days (inclusive), audit trail + member event. Used by approveFreeze AND by
// the owner/admin historical auto-approve path so the two can never drift.
async function applyFreezeExtension(
  supabase: any,
  ctx: { gymId: string; userId: string; memberId: string; freezeId: string; membershipId: string; start: string; end: string }
) {
  const freezeDays =
    Math.ceil((new Date(ctx.end).getTime() - new Date(ctx.start).getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const { data: membership } = await supabase
    .from("memberships")
    .select("end_date")
    .eq("id", ctx.membershipId)
    .single();

  if (membership) {
    const newEndDate = new Date(membership.end_date);
    newEndDate.setDate(newEndDate.getDate() + freezeDays);
    await supabase
      .from("memberships")
      .update({ end_date: dateToIST(newEndDate) })
      .eq("id", ctx.membershipId);
  }

  await logAudit({
    action: "freeze.approved",
    entity_type: "membership_freezes",
    entity_id: ctx.freezeId,
    changes: { member_id: ctx.memberId, freeze_days: freezeDays },
  });

  await supabase.from("member_events").insert({
    gym_id: ctx.gymId,
    member_id: ctx.memberId,
    event_type: "freeze_approved",
    title: "Freeze approved",
    description: `${ctx.start} → ${ctx.end} (+${freezeDays}d extension)`,
    created_by: ctx.userId,
  });
}

export async function requestFreeze(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, role")
    .eq("id", user!.id)
    .single();

  const gymId = userData!.gym_id;
  const memberId = formData.get("member_id") as string;
  const membershipId = formData.get("membership_id") as string;
  const startDateStr = formData.get("start_date") as string;
  const endDateStr = formData.get("end_date") as string;
  const reason = (formData.get("reason") as string) || null;

  const startDate = new Date(startDateStr);
  const today = new Date(todayIST());
  const isBackdated = startDate < today;
  const backdatedDays = isBackdated
    ? Math.ceil((today.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
    : 0;

  // Freezes apply to real memberships only — a frozen day pass or trial is
  // nonsense (each frozen day would extend a 1-day pass)
  const { data: msWithPkg } = await supabase
    .from("memberships")
    .select("id, start_date, packages(type)")
    .eq("id", membershipId)
    .eq("gym_id", gymId)
    .single();
  if (!msWithPkg || (msWithPkg.packages as any)?.type !== "membership") {
    redirect(`/dashboard/members/${memberId}?error=${encodeURIComponent("Day passes and trials cannot be frozen")}`);
  }

  // a freeze before the membership began is data corruption
  if (startDateStr < msWithPkg.start_date) {
    redirect(`/dashboard/members/${memberId}?error=${encodeURIComponent("Freeze cannot start before the membership started")}`);
  }

  // Backdate cap — managers and front-line roles can go back at most 7 days;
  // owner/admin can backdate arbitrarily to record a member's real history
  // (approval then extends the end date by the frozen days either way).
  const canBackdateFreely = userData!.role === "owner" || userData!.role === "admin";
  if (!canBackdateFreely && backdatedDays > 7) {
    redirect(`/dashboard/members/${memberId}?error=${encodeURIComponent("Cannot backdate freeze more than 7 days")}`);
  }

  // Owner/admin recording a FULLY-PAST freeze (pure history): approve it
  // instantly and extend the membership end date right away — no pending
  // banner round-trip. Freezes touching today/future keep the request →
  // approve flow for every role.
  const todayStr = todayIST();
  const isHistorical = canBackdateFreely && endDateStr < todayStr;

  const { data: freeze, error } = await supabase
    .from("membership_freezes")
    .insert({
      gym_id: gymId,
      membership_id: membershipId,
      member_id: memberId,
      start_date: startDateStr,
      end_date: endDateStr,
      reason,
      status: isHistorical ? "approved" : "pending",
      ...(isHistorical ? { approved_by: user!.id, approved_at: new Date().toISOString() } : {}),
      is_backdated: isBackdated,
      backdated_days: backdatedDays,
      requested_by: user!.id,
    })
    .select()
    .single();

  if (error) {
    redirect(`/dashboard/members/${memberId}?error=${encodeURIComponent(error.message)}`);
  }

  await logAudit({
    action: "freeze.requested",
    entity_type: "membership_freezes",
    entity_id: memberId,
    changes: { membership_id: membershipId, start_date: startDateStr, end_date: endDateStr, reason },
  });

  await supabase.from("member_events").insert({
    gym_id: gymId,
    member_id: memberId,
    event_type: "freeze_requested",
    title: "Freeze requested",
    description: `${startDateStr} → ${endDateStr}${reason ? " · " + reason : ""}`,
    created_by: user!.id,
  });

  if (isHistorical && freeze) {
    await applyFreezeExtension(supabase, {
      gymId,
      userId: user!.id,
      memberId,
      freezeId: freeze.id,
      membershipId,
      start: startDateStr,
      end: endDateStr,
    });
  }

  revalidatePath(`/dashboard/members/${memberId}`);
  redirect(`/dashboard/members/${memberId}`);
}

export async function approveFreeze(freezeId: string, memberId: string, _formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, role")
    .eq("id", user!.id)
    .single();

  if (!["owner", "admin", "manager"].includes(userData!.role)) {
    redirect(`/dashboard/members/${memberId}`);
  }

  const { data: freeze } = await supabase
    .from("membership_freezes")
    .select("*")
    .eq("id", freezeId)
    .single();

  if (!freeze) redirect(`/dashboard/members/${memberId}`);

  // only real memberships can be frozen (request gates this; the approve
  // path is the backstop for anything already pending)
  const { data: msWithPkg } = await supabase
    .from("memberships")
    .select("id, packages(type)")
    .eq("id", freeze.membership_id)
    .eq("gym_id", userData!.gym_id)
    .single();
  if (!msWithPkg || (msWithPkg.packages as any)?.type !== "membership") {
    redirect(`/dashboard/members/${memberId}?error=${encodeURIComponent("Day passes and trials cannot be frozen")}`);
  }

  const today = todayIST();
  const isActiveNow = freeze.start_date <= today && freeze.end_date >= today;
  const newStatus = isActiveNow ? "active" : "approved";

  const { error } = await supabase
    .from("membership_freezes")
    .update({
      status: newStatus,
      approved_by: user!.id,
      approved_at: new Date().toISOString(),
    })
    .eq("id", freezeId);

  if (error) {
    redirect(`/dashboard/members/${memberId}?error=${encodeURIComponent(error.message)}`);
  }

  // Extend membership end_date by freeze duration (shared with the
  // historical auto-approve path in requestFreeze)
  await applyFreezeExtension(supabase, {
    gymId: userData!.gym_id,
    userId: user!.id,
    memberId,
    freezeId,
    membershipId: freeze.membership_id,
    start: freeze.start_date,
    end: freeze.end_date,
  });

  revalidatePath(`/dashboard/members/${memberId}`);
  redirect(`/dashboard/members/${memberId}`);
}

export async function rejectFreeze(freezeId: string, memberId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, role")
    .eq("id", user!.id)
    .single();

  if (!["owner", "admin", "manager"].includes(userData!.role)) {
    redirect(`/dashboard/members/${memberId}`);
  }

  const rejectedReason = (formData.get("rejected_reason") as string) || null;

  const { error } = await supabase
    .from("membership_freezes")
    .update({
      status: "rejected",
      approved_by: user!.id,
      approved_at: new Date().toISOString(),
      rejected_reason: rejectedReason,
    })
    .eq("id", freezeId);

  if (error) {
    redirect(`/dashboard/members/${memberId}?error=${encodeURIComponent(error.message)}`);
  }

  await logAudit({
    action: "freeze.rejected",
    entity_type: "membership_freezes",
    entity_id: freezeId,
    changes: { member_id: memberId, reason: rejectedReason },
  });

  await supabase.from("member_events").insert({
    gym_id: userData!.gym_id,
    member_id: memberId,
    event_type: "freeze_rejected",
    title: "Freeze rejected",
    description: rejectedReason ?? undefined,
    created_by: user!.id,
  });

  revalidatePath(`/dashboard/members/${memberId}`);
  redirect(`/dashboard/members/${memberId}`);
}

export async function endFreeze(freezeId: string, memberId: string, _formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, role")
    .eq("id", user!.id)
    .single();

  if (!["owner", "admin", "manager"].includes(userData!.role)) {
    redirect(`/dashboard/members/${memberId}`);
  }

  const { data: freeze } = await supabase
    .from("membership_freezes")
    .select("*")
    .eq("id", freezeId)
    .single();

  if (!freeze) redirect(`/dashboard/members/${memberId}`);

  const today = todayIST();

  // Approval already extended the membership by the FULL freeze range. On
  // early end, credit back the unused days by applying the delta (actual −
  // full): a full-run freeze changes nothing, an early end extends only by
  // the days actually frozen, and a never-started freeze reverts fully.
  const daysInclusive = (s: string, e: string) =>
    Math.ceil((new Date(e).getTime() - new Date(s).getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const fullDays = daysInclusive(freeze.start_date, freeze.end_date);
  const ran = today >= freeze.start_date;
  const actualEnd = ran ? (freeze.end_date < today ? freeze.end_date : today) : freeze.start_date;
  const actualDays = ran ? daysInclusive(freeze.start_date, actualEnd) : 0;
  const delta = actualDays - fullDays;

  // Update freeze
  await supabase
    .from("membership_freezes")
    .update({ status: "ended", end_date: actualEnd })
    .eq("id", freezeId);

  // Adjust membership end date by the delta (≤ 0 when ended early)
  const { data: membership } = await supabase
    .from("memberships")
    .select("end_date")
    .eq("id", freeze.membership_id)
    .single();

  if (membership) {
    const newEndDate = new Date(membership.end_date);
    newEndDate.setDate(newEndDate.getDate() + delta);
    await supabase
      .from("memberships")
      .update({ end_date: dateToIST(newEndDate) })
      .eq("id", freeze.membership_id);
  }

  await logAudit({
    action: "freeze.ended",
    entity_type: "membership_freezes",
    entity_id: freezeId,
    changes: { member_id: memberId, actual_days: actualDays, adjustment_days: delta },
  });

  await supabase.from("member_events").insert({
    gym_id: userData!.gym_id,
    member_id: memberId,
    event_type: "freeze_ended",
    title: "Freeze ended",
    description: `Actual freeze: ${freeze.start_date} → ${actualEnd} (${actualDays}d frozen${delta < 0 ? `, ${-delta}d credited back` : ""})`,
    created_by: user!.id,
  });

  revalidatePath(`/dashboard/members/${memberId}`);
  redirect(`/dashboard/members/${memberId}`);
}

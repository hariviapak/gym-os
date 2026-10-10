"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { todayIST, dateToIST } from "@/lib/utils";
import { logAudit } from "@/lib/actions/audit";

export async function renewMembership(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, id, role")
    .eq("id", user!.id)
    .single();

  const gymId = userData!.gym_id;
  const createdBy = userData!.id;
  const memberId = formData.get("member_id") as string;
  const packageId = formData.get("package_id") as string;
  const paymentAmount = parseFloat(formData.get("payment_amount") as string) || 0;
  const paymentMode = formData.get("payment_mode") as string;
  const referenceNote = (formData.get("reference_note") as string) || null;

  // Get package
  const { data: pkg } = await supabase
    .from("packages")
    .select("*")
    .eq("id", packageId)
    .eq("gym_id", gymId)
    .single();

  if (!pkg) {
    redirect(`/dashboard/members/${memberId}?error=Package+not+found`);
  }

  // Get ALL active memberships and pick the one for the SAME SERVICE as the
  // selected package — with dual memberships (gym + swim), renewing swim must
  // queue after the SWIM plan ends, not after the gym plan (which may run
  // a year longer).
  const { data: activeList } = await supabase
    .from("memberships")
    .select("id, end_date, status, packages!memberships_package_id_fkey(service_type)")
    .eq("member_id", memberId)
    .eq("gym_id", gymId)
    .eq("status", "active")
    .order("end_date", { ascending: false });

  const matchesSelectedService = (msService: string | null | undefined) =>
    !!msService && (msService === pkg.service_type || msService === "both" || pkg.service_type === "both");

  const currentMs = (activeList ?? []).find((ms: any) =>
    matchesSelectedService((ms.packages as any)?.service_type)
  );

  // Per spec: a RENEWAL of the same service starts after the current period
  // ends (no overlap). An ADD-ON (different service — e.g. swimming on top of
  // gym) starts TODAY, running alongside the existing membership. Trials and
  // day passes are short check-ins — they always start today too, never queue
  // behind a running membership.
  const todayStr = todayIST();

  let startDateStr: string;
  if (
    currentMs &&
    pkg.type === "membership" &&
    currentMs.end_date >= todayStr
  ) {
    startDateStr = currentMs.end_date;
  } else {
    startDateStr = todayStr;
  }

  // Staff override: an explicit start date beats the computed queue date.
  // Managers can go back at most 7 days (same rule as freezes); owner/admin
  // can backdate arbitrarily to record real history. Future starts are free
  // ("starts Monday").
  const overrideStr = ((formData.get("start_date") as string) ?? "").trim();
  if (overrideStr) {
    const canBackdateFreely = userData!.role === "owner" || userData!.role === "admin";
    const backdatedDays = Math.ceil(
      (new Date(todayStr).getTime() - new Date(overrideStr).getTime()) / (1000 * 60 * 60 * 24)
    );
    if (!canBackdateFreely && backdatedDays > 7) {
      redirect(`/dashboard/members/${memberId}?error=` + encodeURIComponent("Start date cannot be more than 7 days in the past"));
    }
    startDateStr = overrideStr;
  }

  const startDate = new Date(startDateStr);
// Day passes and trials count the start day as day 1 (a "1 Day" pass
  // bought today ends today). Regular memberships keep the same-date-next-
  // period convention (start + duration).
  const accessDays =
    pkg.type === "day_pass" || pkg.type === "trial" ? pkg.duration_days - 1 : pkg.duration_days;
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + accessDays);

  const { data: settings } = await supabase
    .from("gym_settings")
    .select("gst_mode")
    .eq("gym_id", gymId)
    .single();
  const gstMode = settings?.gst_mode ?? "exclusive";

  const pkgAmount = Number(pkg.amount);
  const discountAmount = parseFloat(formData.get("discount_amount") as string) || 0;
  const discountReason = (formData.get("discount_reason") as string) || null;

  if (discountAmount < 0 || discountAmount > pkgAmount) {
    redirect(`/dashboard/members/${memberId}?error=Invalid+discount+amount`);
  }

  const effectivePrice = pkgAmount - discountAmount;
  let amount: number;
  let gstAmount: number;
  let totalAmount: number;

  if (gstMode === "inclusive") {
    totalAmount = effectivePrice;
    amount = Number((effectivePrice / (1 + pkg.gst_rate / 100)).toFixed(2));
    gstAmount = Number((totalAmount - amount).toFixed(2));
  } else {
    amount = effectivePrice;
    gstAmount = Number((amount * (pkg.gst_rate / 100)).toFixed(2));
    totalAmount = amount + gstAmount;
  }

  const paymentStatus = paymentAmount >= totalAmount ? "paid" : paymentAmount > 0 ? "partial" : "pending";

  // Create new membership
  const { data: newMs, error: msError } = await supabase
    .from("memberships")
    .insert({
      gym_id: gymId,
      member_id: memberId,
      package_id: packageId,
      status: "active",
      payment_status: paymentStatus,
      start_date: startDateStr,
      end_date: dateToIST(endDate),
      amount,
      gst_amount: gstAmount,
      total_amount: totalAmount,
      discount_amount: discountAmount,
      discount_reason: discountReason,
      amount_paid: paymentAmount,
      created_by: createdBy,
    })
    .select()
    .single();

  if (msError) {
    redirect(`/dashboard/members/${memberId}?error=` + encodeURIComponent(msError.message));
  }

  // Only mark old membership as expired if its end_date has already passed
  // (cron job handles natural expiry, but this catches edge cases)
  if (currentMs && currentMs.status === "active" && currentMs.id !== newMs.id && currentMs.end_date < todayStr) {
    await supabase
      .from("memberships")
      .update({ status: "expired" })
      .eq("id", currentMs.id);
  }

  // Record payment if amount > 0
  let receiptNo: number | null = null;
  if (paymentAmount > 0) {
      const { data: payment } = await supabase
        .from("payments")
        .insert({
          gym_id: gymId,
          member_id: memberId,
          membership_id: newMs.id,
          amount: paymentAmount,
          mode: paymentMode,
          reference_note: referenceNote,
          payment_date: todayIST(),
          created_by: createdBy,
        })
      .select()
      .single();

    if (payment) {
      const { data: rNo } = await supabase
        .rpc("get_next_receipt_no", { p_gym_id: gymId })
        .single();
      receiptNo = rNo as number | null;

      if (receiptNo !== null) {
        const { data: receipt } = await supabase
          .from("receipts")
          .insert({
            gym_id: gymId,
            receipt_no: receiptNo,
            member_id: memberId,
            membership_id: newMs.id,
            payment_id: payment.id,
            amount,
            gst_amount: gstAmount,
            total_amount: totalAmount,
            discount_amount: discountAmount,
            discount_reason: discountReason,
            created_by: createdBy,
          })
          .select()
          .single();

        if (receipt) {
          await supabase
            .from("payments")
            .update({ receipt_id: receipt.id })
            .eq("id", payment.id);
        }
      }
    }
  }

  // Timeline events
  await supabase.from("member_events").insert([
    {
      gym_id: gymId,
      member_id: memberId,
      event_type: "renewal",
      title: `Membership renewed: ${pkg.name}`,
      description: `${startDateStr} → ${dateToIST(endDate)} · ${paymentStatus}`,
      metadata: { membership_id: newMs.id, package_id: packageId, receipt_no: receiptNo },
      created_by: createdBy,
    },
  ]);

  if (paymentAmount > 0) {
    await supabase.from("member_events").insert([
      {
        gym_id: gymId,
        member_id: memberId,
        event_type: "payment",
        title: `Payment recorded: ₹${paymentAmount.toFixed(2)}`,
        description: `${paymentMode} · ${paymentStatus}`,
        metadata: { membership_id: newMs.id, receipt_no: receiptNo },
        created_by: createdBy,
      },
    ]);
  }

  revalidatePath(`/dashboard/members/${memberId}`);

  await logAudit({
    action: "membership.renewed",
    entity_type: "memberships",
    entity_id: newMs.id,
    changes: { member_id: memberId, package: pkg.name, start_date: startDateStr, end_date: dateToIST(endDate) },
  });

  redirect(`/dashboard/members/${memberId}`);
}

export async function extendMembership(memberId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, id, role")
    .eq("id", user!.id)
    .single();

  if (!["owner", "admin", "manager"].includes(userData!.role)) {
    redirect(`/dashboard/members/${memberId}`);
  }

  const gymId = userData!.gym_id;
  const createdBy = userData!.id;
  const days = parseInt(formData.get("days") as string, 10);
  const reason = (formData.get("reason") as string)?.trim();

  if (!days || days < 1 || days > 365) {
    redirect(`/dashboard/members/${memberId}?error=Days+must+be+between+1+and+365`);
  }

  if (!reason) {
    redirect(`/dashboard/members/${memberId}?error=Reason+is+required`);
  }

  // Which membership to extend — with dual memberships this must be explicit
  const membershipId = formData.get("membership_id") as string;
  if (!membershipId) {
    redirect(`/dashboard/members/${memberId}?error=Select+which+membership+to+extend`);
  }

  const { data: membership } = await supabase
    .from("memberships")
    .select("id, end_date, package_name, packages!memberships_package_id_fkey(name)")
    .eq("id", membershipId)
    .eq("member_id", memberId)
    .eq("gym_id", gymId)
    .eq("status", "active")
    .single();

  if (!membership) {
    redirect(`/dashboard/members/${memberId}?error=No+active+membership+to+extend`);
  }

  const newEndDate = new Date(membership.end_date);
  newEndDate.setDate(newEndDate.getDate() + days);
  const newEndDateStr = dateToIST(newEndDate);

  await supabase
    .from("memberships")
    .update({ end_date: newEndDateStr })
    .eq("id", membership.id);

  await supabase.from("member_events").insert({
    gym_id: gymId,
    member_id: memberId,
    event_type: "note",
    title: `Membership extended by ${days} days`,
    description: `${membership.package_name ?? (membership.packages as any)?.name ?? ""} · ${reason}`,
    metadata: { membership_id: membership.id, days, old_end_date: membership.end_date, new_end_date: newEndDateStr },
    created_by: createdBy,
  });

  await logAudit({
    action: "membership.extended",
    entity_type: "memberships",
    entity_id: membership.id,
    changes: { member_id: memberId, days, reason, old_end_date: membership.end_date, new_end_date: newEndDateStr },
  });

  revalidatePath(`/dashboard/members/${memberId}`);
  redirect(`/dashboard/members/${memberId}`);
}

export async function bulkExtendMemberships(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, id, role")
    .eq("id", user!.id)
    .single();

  if (!["owner", "admin"].includes(userData!.role)) {
    redirect("/dashboard");
  }

  const gymId = userData!.gym_id;
  const createdBy = userData!.id;
  const days = parseInt(formData.get("days") as string, 10);
  const reason = (formData.get("reason") as string)?.trim();

  if (!days || days < 1 || days > 365) {
    redirect("/dashboard?error=Days+must+be+between+1+and+365");
  }

  if (!reason) {
    redirect("/dashboard?error=Reason+is+required");
  }

  const { data: activeMemberships } = await supabase
    .from("memberships")
    .select("id, member_id, end_date")
    .eq("gym_id", gymId)
    .eq("status", "active");

  if (activeMemberships && activeMemberships.length > 0) {
    for (const m of activeMemberships) {
      const newEndDate = new Date(m.end_date);
      newEndDate.setDate(newEndDate.getDate() + days);
      const newEndDateStr = dateToIST(newEndDate);

      await supabase
        .from("memberships")
        .update({ end_date: newEndDateStr })
        .eq("id", m.id);

      await supabase.from("member_events").insert({
        gym_id: gymId,
        member_id: m.member_id,
        event_type: "note",
        title: `Membership extended by ${days} days`,
        description: reason,
        metadata: { membership_id: m.id, days, old_end_date: m.end_date, new_end_date: newEndDateStr },
        created_by: createdBy,
      });
    }

    await logAudit({
      action: "membership.bulk_extended",
      entity_type: "memberships",
      changes: { days, reason, count: activeMemberships.length },
    });
  }

  revalidatePath("/dashboard");
  redirect("/dashboard");
}

// Cancel a membership (e.g. wrongly added service) with an optional refund.
// The refund is recorded in the refunds ledger; the membership keeps its
// payment history but stops being active/eligible for dedup (member can re-enroll).
export async function cancelMembership(membershipId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, id, role")
    .eq("id", user!.id)
    .single();

  if (!userData || !["owner", "admin", "manager"].includes(userData.role)) {
    redirect("/dashboard/members?error=" + encodeURIComponent("Only owner/admin/manager can cancel memberships"));
  }

  const gymId = userData.gym_id;

  const { data: ms } = await supabase
    .from("memberships")
    .select("id, member_id, status, amount_paid, package_name, packages!memberships_package_id_fkey(name)")
    .eq("id", membershipId)
    .eq("gym_id", gymId)
    .single();

  if (!ms) redirect("/dashboard/members?error=" + encodeURIComponent("Membership not found"));
  if (ms.status !== "active") {
    redirect(`/dashboard/members/${ms.member_id}?error=` + encodeURIComponent("Only active memberships can be cancelled"));
  }

  const reason = ((formData.get("reason") as string) || "").trim() || null;
  const refundAmount = Math.max(0, parseFloat(formData.get("refund_amount") as string) || 0);
  const pkgName = ms.package_name ?? (ms.packages as any)?.name ?? "package";

  const { error: cancelError } = await supabase
    .from("memberships")
    .update({ status: "cancelled" })
    .eq("id", membershipId)
    .eq("gym_id", gymId);

  if (cancelError) {
    redirect(`/dashboard/members/${ms.member_id}?error=` + encodeURIComponent(cancelError.message));
  }

  let refundId: string | null = null;
  if (refundAmount > 0) {
    const { data: refund, error: refundError } = await supabase
      .from("refunds")
      .insert({
        gym_id: gymId,
        member_id: ms.member_id,
        membership_id: membershipId,
        amount: refundAmount,
        reason,
        created_by: userData.id,
      })
      .select("id")
      .single();

    if (refundError) {
      redirect(`/dashboard/members/${ms.member_id}?error=` + encodeURIComponent(`Membership cancelled, but refund failed: ${refundError.message}`));
    }
    refundId = refund?.id ?? null;
  }

  await supabase.from("member_events").insert([
    {
      gym_id: gymId,
      member_id: ms.member_id,
      event_type: "status_change",
      title: `Membership cancelled: ${pkgName}`,
      description: reason ?? "Cancelled by staff",
      metadata: { membership_id: membershipId, refunded: refundAmount > 0 },
      created_by: userData.id,
    },
    ...(refundAmount > 0
      ? [
          {
            gym_id: gymId,
            member_id: ms.member_id,
            event_type: "refund",
            title: `Refund issued: ${refundAmount}`,
            description: `${pkgName}${reason ? ` · ${reason}` : ""}`,
            metadata: { membership_id: membershipId, refund_id: refundId },
            created_by: userData.id,
          },
        ]
      : []),
  ]);

  await logAudit({
    action: "membership.cancelled",
    entity_type: "memberships",
    entity_id: membershipId,
    changes: { package: pkgName, refund: refundAmount, reason },
  });

  revalidatePath(`/dashboard/members/${ms.member_id}`);
  redirect(`/dashboard/members/${ms.member_id}`);
}

// Cancelled -> Active again (only while the plan period hasn't fully passed;
// past ones should be renewed instead)
export async function reactivateMembership(membershipId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, id, role")
    .eq("id", user!.id)
    .single();

  if (!userData || !["owner", "admin", "manager"].includes(userData.role)) {
    redirect("/dashboard/members?error=" + encodeURIComponent("Only owner/admin/manager can reactivate memberships"));
  }

  const { data: ms } = await supabase
    .from("memberships")
    .select("id, member_id, status, end_date, package_name, packages!memberships_package_id_fkey(name)")
    .eq("id", membershipId)
    .eq("gym_id", userData.gym_id)
    .single();

  if (!ms) redirect("/dashboard/members?error=" + encodeURIComponent("Membership not found"));
  if (ms.status !== "cancelled") {
    redirect(`/dashboard/members/${ms.member_id}?error=` + encodeURIComponent("Only cancelled memberships can be reactivated"));
  }
  if (ms.end_date < todayIST()) {
    redirect(`/dashboard/members/${ms.member_id}?error=` + encodeURIComponent("This plan's period has passed — renew it instead"));
  }

  const { error } = await supabase
    .from("memberships")
    .update({ status: "active" })
    .eq("id", membershipId)
    .eq("gym_id", userData.gym_id);

  if (error) {
    redirect(`/dashboard/members/${ms.member_id}?error=` + encodeURIComponent(error.message));
  }

  const pkgName = ms.package_name ?? (ms.packages as any)?.name ?? "membership";
  await supabase.from("member_events").insert({
    gym_id: userData.gym_id,
    member_id: ms.member_id,
    event_type: "status_change",
    title: `Membership reactivated: ${pkgName}`,
    created_by: userData.id,
  });

  await logAudit({
    action: "membership.reactivated",
    entity_type: "memberships",
    entity_id: membershipId,
    changes: { package: pkgName },
  });

  revalidatePath(`/dashboard/members/${ms.member_id}`);
  redirect(`/dashboard/members/${ms.member_id}`);
}

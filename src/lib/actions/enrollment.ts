"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { todayIST, dateToIST, normalizePhone } from "@/lib/utils";
import { logAudit } from "@/lib/actions/audit";

export async function enrollMember(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, id")
    .eq("id", user!.id)
    .single();

  const gymId = userData!.gym_id;
  const createdBy = userData!.id;
  const phone = normalizePhone((formData.get("phone") as string) || "");

  // Same phone is ALLOWED (kids share a parent's number). The wizard shows a
  // soft hint when the phone matches an existing member; identity is the
  // member id, not the phone.

  // Step 1: Create member
  const { data: member, error: memberError } = await supabase
    .from("members")
    .insert({
      gym_id: gymId,
      first_name: formData.get("first_name") as string,
      last_name: (formData.get("last_name") as string) || null,
      phone: phone,
      email: (formData.get("email") as string) || null,
      gender: (formData.get("gender") as string) || null,
      date_of_birth: (formData.get("date_of_birth") as string) || null,
      address: (formData.get("address") as string) || null,
      emergency_contact_name: (formData.get("emergency_contact_name") as string) || null,
      emergency_contact_phone: (formData.get("emergency_contact_phone") as string) || null,
      medical_notes: (formData.get("medical_notes") as string) || null,
      injury_notes: (formData.get("injury_notes") as string) || null,
      referred_by: (formData.get("referred_by") as string) || null,
      status: "active",
    })
    .select()
    .single();

  if (memberError) {
    redirect("/dashboard/members/new?error=" + encodeURIComponent(memberError.message));
  }

  // Step 2: Get package details
  const packageId = formData.get("package_id") as string;
  const { data: pkg } = await supabase
    .from("packages")
    .select("*")
    .eq("id", packageId)
    .eq("gym_id", gymId)
    .single();

  if (!pkg) {
    redirect("/dashboard/members/new?error=Package+not+found");
  }

  const startDateStr = (formData.get("start_date") as string) || todayIST();
  // backdate cap — same rule as freezes: at most 7 days in the past
  const backdatedDays = Math.ceil(
    (new Date(todayIST()).getTime() - new Date(startDateStr).getTime()) / (1000 * 60 * 60 * 24)
  );
  if (backdatedDays > 7) {
    redirect("/dashboard/members/new?error=" + encodeURIComponent("Start date cannot be more than 7 days in the past"));
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
    redirect("/dashboard/members/new?error=Invalid+discount+amount");
  }

  const effectivePrice = pkgAmount - discountAmount;
  const totalAmount =
    gstMode === "inclusive"
      ? effectivePrice
      : Number((effectivePrice * (1 + pkg.gst_rate / 100)).toFixed(2));

  const paymentAmount = parseFloat(formData.get("payment_amount") as string) || 0;

  // Group (family) package: enroll additional existing members under the same
  // package, splitting the payment across the group (payment_group_id links them)
  const isGroup = !!pkg.is_group_package;
  let groupEntries: Array<{ id: string | null; new: { first_name: string; last_name: string; phone: string } | null; amount: number }> = [];
  if (isGroup) {
    try {
      groupEntries = JSON.parse((formData.get("group_members") as string) || "[]");
    } catch {
      groupEntries = [];
    }
    // Quick-added new members: ALWAYS create a fresh member record — never
    // merge by phone (kids/spouses legitimately share a household number;
    // merging silently double-books the same person). The wizard warns when
    // the phone matches an existing member and lets the admin decide.
    for (const e of groupEntries) {
      if (!e.id && e.new) {
        const newPhone = normalizePhone(e.new.phone || "");
        if (!e.new.first_name || !newPhone) {
          redirect("/dashboard/members/new?error=Quick-added+group+members+need+a+name+and+phone");
        }
        const { data: createdMember, error: createError } = await supabase
          .from("members")
          .insert({
            gym_id: gymId,
            first_name: e.new.first_name,
            last_name: e.new.last_name || null,
            phone: newPhone,
            status: "active",
          })
          .select("id")
          .single();

        if (createError || !createdMember) {
          redirect(
            "/dashboard/members/new?error=" +
              encodeURIComponent(`Could not create group member ${e.new.first_name}: ${createError?.message ?? "unknown error"}`)
          );
        }
        e.id = createdMember.id;
        e.new = null;
      }
    }
    const additional = groupEntries.filter((e) => e.id);
    if (additional.length === 0) {
      redirect("/dashboard/members/new?error=Add+at+least+1+more+group+member");
    }
    // Never let two entries resolve to the same member (double-booking guard).
    // The primary entry itself maps to member.id once — that's valid; a SECOND
    // entry resolving to the same member is what we block.
    const seenMemberIds = new Set<string>();
    for (const e of groupEntries) {
      const mid = (e.id as string) ?? member.id;
      if (seenMemberIds.has(mid)) {
        redirect(
          "/dashboard/members/new?error=The+same+member+appears+twice+in+this+group+—+check+the+group+members+list"
        );
      }
      seenMemberIds.add(mid);
    }
    const sum = groupEntries.reduce((s, e) => s + (Number(e.amount) || 0), 0);
    if (Math.abs(sum - totalAmount) > 0.01) {
      redirect("/dashboard/members/new?error=Group+split+must+add+up+to+the+package+total");
    }
  } else if (paymentAmount < 0 || (totalAmount > 0 && paymentAmount > totalAmount)) {
    redirect("/dashboard/members/new?error=Invalid+payment+amount");
  }

  // Participants: for a single enrollment it's just the new member paying
  // paymentAmount against totalAmount. For a group package each participant's
  // share IS their membership total (family packages are group-priced totals).
  // The amount collected now is distributed across participants in order;
  // anything not collected stays pending on the members.
  const groupCollectedRaw = parseFloat(formData.get("group_amount_collected") as string);
  const collected = isGroup
    ? Math.min(totalAmount, Math.max(0, Number.isFinite(groupCollectedRaw) ? groupCollectedRaw : totalAmount))
    : paymentAmount;

  const participants: Array<{ memberId: string; total: number; paid: number; isNew: boolean }> = isGroup
    ? (() => {
        let remainingCollected = collected;
        return groupEntries.map((e) => {
          const share = Number(e.amount) || 0;
          const paid = Math.min(share, Math.max(0, remainingCollected));
          remainingCollected = Math.round((remainingCollected - paid) * 100) / 100;
          const isNew = !e.id;
          return { memberId: (e.id as string) ?? member.id, total: share, paid: Math.round(paid * 100) / 100, isNew };
        });
      })()
    : [{ memberId: member.id, total: totalAmount, paid: paymentAmount, isNew: true }];

  const paymentGroupId = isGroup ? crypto.randomUUID() : null;
  const groupReceiptMode = isGroup && formData.get("group_receipt_mode") !== "individual" ? "group" : "individual";
  const groupBillName =
    (((formData.get("group_bill_name") as string) || "").trim() || `${member.first_name} & Family`) as string;

  // Fetch additional member records (skip ones that already hold an active
  // membership for this package — per-package dedup allows dual services)
  const additionalIds = participants.filter((p) => !p.isNew).map((p) => p.memberId);
  let existingActiveMemberIds = new Set<string>();
  if (additionalIds.length > 0) {
    const { data: existingMs } = await supabase
      .from("memberships")
      .select("member_id")
      .eq("gym_id", gymId)
      .eq("package_id", packageId)
      .eq("status", "active")
      .in("member_id", additionalIds);
    existingActiveMemberIds = new Set((existingMs ?? []).map((ms: any) => ms.member_id));
  }

  const perParticipant = participants.filter(
    (p) => p.isNew || !existingActiveMemberIds.has(p.memberId)
  );

  // Names of all group participants (for timeline cross-references)
  const participantIds = perParticipant.map((p) => p.memberId);
  const { data: participantRows } = participantIds.length
    ? await supabase.from("members").select("id, first_name, last_name").in("id", participantIds)
    : { data: [] };
  const nameMap: Record<string, string> = {};
  (participantRows ?? []).forEach((m: any) => {
    nameMap[m.id] = [m.first_name, m.last_name].filter(Boolean).join(" ");
  });

  // Per-participant GST split (share is GST-inclusive of their membership total)
  const shareBreakdown = (share: number) => {
    const base = Number((share / (1 + pkg.gst_rate / 100)).toFixed(2));
    return { base, gst: Number((share - base).toFixed(2)) };
  };

  // Step 3+4: memberships, payments, receipts per participant
  let primaryMembership: any = null;
  let receiptNo: number | null = null;
  let firstPaymentId: string | null = null;
  const paymentMode = formData.get("payment_mode") as string;
  const referenceNote = (formData.get("reference_note") as string) || null;
  const billedTo = ((formData.get("billed_to") as string) || "").trim() || null;

  for (const p of perParticipant) {
    const { base, gst } = shareBreakdown(p.total);
    const msStatus = p.paid >= p.total ? "paid" : p.paid > 0 ? "partial" : "pending";

    const { data: membership, error: membershipError } = await supabase
      .from("memberships")
      .insert({
        gym_id: gymId,
        member_id: p.memberId,
        package_id: packageId,
        package_name: pkg.name,
        status: "active",
        payment_status: msStatus,
        start_date: startDateStr,
        end_date: dateToIST(endDate),
        amount: base,
        gst_amount: gst,
        total_amount: p.total,
        discount_amount: p.isNew || !isGroup ? discountAmount : 0,
        discount_reason: p.isNew || !isGroup ? discountReason : null,
        amount_paid: p.paid,
        payment_group_id: paymentGroupId,
        created_by: createdBy,
      })
      .select()
      .single();

    if (membershipError) {
      if (p.isNew) {
        redirect("/dashboard/members/new?error=" + encodeURIComponent(membershipError.message));
      }
      continue;
    }

    if (p.isNew) primaryMembership = membership;

    if (p.paid > 0 && (!isGroup || groupReceiptMode === "individual")) {
      const { data: payment } = await supabase
        .from("payments")
        .insert({
          gym_id: gymId,
          member_id: p.memberId,
          membership_id: membership.id,
          amount: p.paid,
          mode: paymentMode,
          reference_note: referenceNote,
          payment_date: todayIST(),
          payment_group_id: paymentGroupId,
          created_by: createdBy,
        })
        .select()
        .single();

      if (payment) {
        firstPaymentId = firstPaymentId ?? payment.id;
        {
          const { data: receipt } = await supabase
            .rpc("get_next_receipt_no", { p_gym_id: gymId })
            .single();

          const no = receipt as number | null;
          if (p.isNew) receiptNo = no;

          if (no !== null) {
            const { data: newReceipt } = await supabase
              .from("receipts")
              .insert({
                gym_id: gymId,
                receipt_no: no,
                member_id: p.memberId,
                membership_id: membership.id,
                payment_id: payment.id,
                amount: base,
                gst_amount: gst,
                total_amount: p.total,
                discount_amount: p.isNew || !isGroup ? discountAmount : 0,
                discount_reason: p.isNew || !isGroup ? discountReason : null,
                billed_to: p.isNew ? billedTo : null,
                created_by: createdBy,
              })
              .select()
              .single();

            if (newReceipt) {
              await supabase
                .from("payments")
                .update({ receipt_id: newReceipt.id })
                .eq("id", payment.id);
            }
          }
        }
      }
    }

    const others = isGroup
      ? perParticipant
          .filter((o) => o.memberId !== p.memberId)
          .map((o) => nameMap[o.memberId])
          .filter(Boolean)
      : [];

    await supabase.from("member_events").insert({
      gym_id: gymId,
      member_id: p.memberId,
      event_type: p.isNew ? "enrollment" : "group_enrollment",
      title: p.isNew
        ? "Member enrolled"
        : `Added to group enrollment: ${pkg.name}`,
      description: `${pkg.name} · ${pkg.duration_days} days · ${msStatus}${isGroup ? ` · group package (share ${p.paid})` : ""}${
        others.length > 0 ? ` · with ${others.join(", ")}` : ""
      }`,
      metadata: {
        membership_id: membership.id,
        package_id: packageId,
        receipt_no: p.isNew ? receiptNo : undefined,
        payment_group_id: paymentGroupId,
      },
      created_by: createdBy,
    });
  }

  const membership = primaryMembership;
  if (!membership) {
    redirect("/dashboard/members/new?error=Enrollment+failed");
  }

  // Auto-assign all group participants to a member_group so the profile
  // "Group" card shows the related members (family/team) automatically
  if (isGroup && perParticipant.length >= 2) {
    const groupName = groupBillName || `${member.first_name} & Family`;
    const { data: existingGroup } = await supabase
      .from("member_groups")
      .select("id")
      .eq("gym_id", gymId)
      .ilike("name", groupName)
      .maybeSingle();

    let groupId = existingGroup?.id;
    if (!groupId) {
      const { data: newGroup } = await supabase
        .from("member_groups")
        .insert({ gym_id: gymId, name: groupName, created_by: createdBy })
        .select("id")
        .single();
      groupId = newGroup?.id;
    }

    if (groupId) {
      await supabase
        .from("members")
        .update({ group_id: groupId })
        .in("id", perParticipant.map((p) => p.memberId));
    }
  }
  // Consolidated group mode: ONE payment (the full collected amount) and ONE
  // receipt for the whole group, billed to the group name. Per-member shares
  // stay on the memberships (statuses/balances) and the receipt page shows a
  // per-member annexure from the membership records.
  if (isGroup && groupReceiptMode === "group" && primaryMembership) {
    const { base: gBase, gst: gGst } = shareBreakdown(totalAmount);

    let groupPaymentId: string | null = null;
    if (collected > 0) {
      const { data: groupPayment } = await supabase
        .from("payments")
        .insert({
          gym_id: gymId,
          member_id: member.id,
          membership_id: primaryMembership.id,
          amount: collected,
          mode: paymentMode,
          reference_note: referenceNote,
          payment_date: todayIST(),
          payment_group_id: paymentGroupId,
          created_by: createdBy,
        })
        .select()
        .single();
      groupPaymentId = groupPayment?.id ?? null;
    }

    const { data: receipt } = await supabase
      .rpc("get_next_receipt_no", { p_gym_id: gymId })
      .single();

    const no = receipt as number | null;
    receiptNo = no;

    if (no !== null) {
      const { data: newReceipt } = await supabase
        .from("receipts")
        .insert({
          gym_id: gymId,
          receipt_no: no,
          member_id: member.id,
          membership_id: primaryMembership.id,
          payment_id: groupPaymentId,
          amount: gBase,
          gst_amount: gGst,
          total_amount: totalAmount,
          discount_amount: discountAmount,
          discount_reason: discountReason,
          billed_to: groupBillName,
          payment_group_id: paymentGroupId,
          created_by: createdBy,
        })
        .select()
        .single();

      if (newReceipt && groupPaymentId) {
        await supabase
          .from("payments")
          .update({ receipt_id: newReceipt.id })
          .eq("id", groupPaymentId);
      }
    }
  }

  const paymentStatus = isGroup
    ? collected >= totalAmount
      ? "paid"
      : collected > 0
        ? "partial"
        : "pending"
    : paymentAmount >= totalAmount
      ? "paid"
      : paymentAmount > 0
        ? "partial"
        : "pending";

  // Step 5: T&C acceptance
  const termsVersionId = formData.get("terms_version_id") as string;
  if (termsVersionId) {
    await supabase.from("terms_acceptances").insert({
      gym_id: gymId,
      member_id: member.id,
      terms_version_id: termsVersionId,
      accepted_by_method: "staff_entry",
      created_by: createdBy,
    });
  }

  // Step 6: Gift kit task — for group enrollments EVERY member gets one
  const giftKit = formData.get("gift_kit") as string;
  if (giftKit === "yes") {
    const giftKitDelivered = formData.get("gift_kit_delivered") as string;
    const digitalUrl = pkg.digital_kit_url || null;
    const isDelivered = giftKitDelivered === "yes";
    const giftKitMemberIds = isGroup
      ? perParticipant.map((p) => p.memberId)
      : [member.id];
    await supabase.from("gift_kit_tasks").insert(
      giftKitMemberIds.map((mid) => ({
        gym_id: gymId,
        member_id: mid,
        status: isDelivered ? "delivered" : "pending",
        digital_content_url: digitalUrl,
        delivered_at: isDelivered ? new Date().toISOString() : null,
        created_by: createdBy,
      }))
    );
  }

  // Step 7: Timeline events (enrollment event for primary was already logged
  // in the participants loop above)
  if (paymentAmount > 0 && !isGroup) {
    await supabase.from("member_events").insert([
      {
        gym_id: gymId,
        member_id: member.id,
        event_type: "payment",
        title: `Payment recorded: ${paymentAmount}`,
        description: `${formData.get("payment_mode")} · ${paymentStatus}`,
        metadata: { membership_id: membership.id, receipt_no: receiptNo },
        created_by: createdBy,
      },
    ]);
  }

  if (isGroup && collected > 0) {
    await supabase.from("member_events").insert([
      {
        gym_id: gymId,
        member_id: member.id,
        event_type: "payment",
        title: `Group payment recorded: ${collected} of ${totalAmount}`,
        description: `${paymentMode} · ${perParticipant.length} members · ${
          collected >= totalAmount ? "fully paid" : `${totalAmount - collected} pending`
        } · ${groupReceiptMode === "group" ? `one receipt (${groupBillName})` : "individual receipts"}`,
        metadata: { membership_id: membership.id, receipt_no: receiptNo, payment_group_id: paymentGroupId },
        created_by: createdBy,
      },
    ]);
  }

  if (termsVersionId) {
    await supabase.from("member_events").insert([
      {
        gym_id: gymId,
        member_id: member.id,
        event_type: "terms_accepted",
        title: "Terms & conditions accepted",
        metadata: { terms_version_id: termsVersionId },
        created_by: createdBy,
      },
    ]);
  }

  if (giftKit === "yes") {
    const giftKitMemberIds = isGroup ? perParticipant.map((p) => p.memberId) : [member.id];
    await supabase.from("member_events").insert(
      giftKitMemberIds.map((mid) => ({
        gym_id: gymId,
        member_id: mid,
        event_type: "gift_kit_assigned",
        title: "Gift kit assigned",
        created_by: createdBy,
      }))
    );
  }

  revalidatePath("/dashboard/members");

  await logAudit({
    action: "member.enrolled",
    entity_type: "members",
    entity_id: member.id,
    changes: { name: `${member.first_name} ${member.last_name ?? ""}`, package: pkg.name, membership_id: membership.id },
  });

  redirect(`/dashboard/members/${member.id}?enrolled=1`);
}

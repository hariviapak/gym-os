"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { todayIST, dateToIST, normalizePhone } from "@/lib/utils";
import { logAudit } from "@/lib/actions/audit";

export async function quickPass(formData: FormData) {
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

  const memberId = (formData.get("member_id") as string) || null;
  const firstName = formData.get("first_name") as string;
  const phone = normalizePhone((formData.get("phone") as string) || "");
  const packageId = formData.get("package_id") as string;
  const paymentAmount = parseFloat(formData.get("payment_amount") as string) || 0;
  const paymentMode = (formData.get("payment_mode") as string) || "cash";
  const referenceNote = (formData.get("reference_note") as string) || null;
  const referredBy = (formData.get("referred_by") as string) || null;
  const startDateStr = (formData.get("start_date") as string) || todayIST();

  if (!phone || !firstName || !packageId) {
    redirect("/dashboard/quick-pass?error=Missing+required+fields");
  }

  // Get package
  const { data: pkg } = await supabase
    .from("packages")
    .select("*")
    .eq("id", packageId)
    .eq("gym_id", gymId)
    .single();

  if (!pkg) {
    redirect("/dashboard/quick-pass?error=Package+not+found");
  }

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
    redirect("/dashboard/quick-pass?error=Invalid+discount+amount");
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

  // Validate payment amount
  if (paymentAmount < 0 || (totalAmount > 0 && paymentAmount > totalAmount)) {
    redirect("/dashboard/quick-pass?error=Invalid+payment+amount");
  }

  const paymentStatus = totalAmount === 0 ? "paid" : paymentAmount >= totalAmount ? "paid" : paymentAmount > 0 ? "partial" : "pending";

  // Step 1: Get or create member. NEVER silently merge by phone — the form
  // makes staff pick the existing member or explicitly confirm a new one
  // (duplicates are legal: kids share a parent's number).
  let finalMemberId = memberId;

  if (!finalMemberId) {
    const createNew = formData.get("create_new") === "1";
    const digits = phone.replace(/\D/g, "");
    const { data: existing } = await supabase
      .from("members")
      .select("id, first_name, last_name")
      .eq("gym_id", gymId)
      .or(`phone.eq.${phone},phone.eq.${digits},phone.eq.+91${digits}`)
      .limit(1);

    if (existing && existing.length > 0 && !createNew) {
      redirect(
        "/dashboard/quick-pass?error=" +
          encodeURIComponent(
            `This phone matches an existing member (${existing[0].first_name}). Pick the member above or choose "Create as new member".`
          )
      );
    }

    const { data: newMember, error: memberError } = await supabase
      .from("members")
      .insert({
        gym_id: gymId,
        first_name: firstName,
        last_name: null,
        phone,
        status: "active",
        referred_by: referredBy,
      })
      .select()
      .single();

    if (memberError) {
      redirect("/dashboard/quick-pass?error=" + encodeURIComponent(memberError.message));
    }
    finalMemberId = newMember.id;
  }

  // Step 2: Create membership
  const startDate = new Date(startDateStr);
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + pkg.duration_days);

  const { data: membership, error: msError } = await supabase
    .from("memberships")
    .insert({
      gym_id: gymId,
      member_id: finalMemberId,
      package_id: packageId,
      package_name: pkg.name,
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
    redirect("/dashboard/quick-pass?error=" + encodeURIComponent(msError.message));
  }

  // Step 3: Record payment + receipt if amount > 0
  let receiptId: string | null = null;
  let receiptNo: number | null = null;

  if (paymentAmount > 0) {
    const { data: payment, error: paymentError } = await supabase
      .from("payments")
      .insert({
        gym_id: gymId,
        member_id: finalMemberId,
        membership_id: membership.id,
        amount: paymentAmount,
        mode: paymentMode,
        reference_note: referenceNote,
        payment_date: startDateStr,
        created_by: createdBy,
      })
      .select()
      .single();

    if (!paymentError) {
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
            member_id: finalMemberId,
            membership_id: membership.id,
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

        receiptId = receipt?.id ?? null;

        if (receiptId) {
          await supabase
            .from("payments")
            .update({ receipt_id: receiptId })
            .eq("id", payment.id);
        }
      }
    }
  }

  // Step 4: Timeline events
  const eventType = pkg.type === "day_pass" ? "enrollment" : pkg.type === "trial" ? "enrollment" : "enrollment";
  const eventTitle = pkg.type === "day_pass" ? `Day pass: ${pkg.name}` : pkg.type === "trial" ? `Trial: ${pkg.name}` : `Enrolled: ${pkg.name}`;

  await supabase.from("member_events").insert({
    gym_id: gymId,
    member_id: finalMemberId,
    event_type: eventType,
    title: eventTitle,
    description: `${startDateStr} → ${dateToIST(endDate)} · ${paymentStatus}${referredBy ? " · referred by " + referredBy : ""}`,
    metadata: { membership_id: membership.id, package_id: packageId, package_type: pkg.type, receipt_no: receiptNo, receipt_id: receiptId },
    created_by: createdBy,
  });

  if (paymentAmount > 0) {
    await supabase.from("member_events").insert({
      gym_id: gymId,
      member_id: finalMemberId,
      event_type: "payment",
      title: `Payment recorded: ₹${paymentAmount.toFixed(2)}`,
      description: `${paymentMode}${referenceNote ? " · " + referenceNote : ""}`,
      metadata: { membership_id: membership.id, receipt_no: receiptNo, receipt_id: receiptId },
      created_by: createdBy,
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/members");

  await logAudit({
    action: "member.enrolled",
    entity_type: "members",
    entity_id: finalMemberId ?? undefined,
    changes: {
      name: firstName ?? "",
      package: pkg.name,
      membership_id: membership.id,
      receipt_no: receiptNo,
      via: "quick_pass",
    },
  });

  // Redirect to receipt if we have one, otherwise to member profile
  if (receiptId) {
    redirect(`/dashboard/receipts/${receiptId}`);
  }
  redirect(`/dashboard/members/${finalMemberId}`);
}

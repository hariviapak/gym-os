"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { todayIST } from "@/lib/utils";
import { logAudit } from "@/lib/actions/audit";

export async function recordPayment(formData: FormData) {
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
  const memberId = formData.get("member_id") as string;
  const membershipId = (formData.get("membership_id") as string) || null;
  const amount = parseFloat(formData.get("amount") as string);
  const mode = formData.get("payment_mode") as string;
  const referenceNote = (formData.get("reference_note") as string) || null;

  if (!memberId || !amount || amount <= 0) {
    redirect("/dashboard/payments/new?error=Invalid+payment+details");
  }

  // Step 1: Insert payment
  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .insert({
      gym_id: gymId,
      member_id: memberId,
      membership_id: membershipId,
      amount,
      mode,
      reference_note: referenceNote,
      payment_date: todayIST(),
      created_by: createdBy,
    })
    .select()
    .single();

  if (paymentError) {
    redirect("/dashboard/payments/new?error=" + encodeURIComponent(paymentError.message));
  }

  // Step 2: Generate receipt
  const { data: receiptNo } = await supabase
    .rpc("get_next_receipt_no", { p_gym_id: gymId })
    .single();

  let receiptId: string | null = null;

  if (receiptNo !== null) {
    // Fetch membership details for receipt if linked
    let receiptAmount = amount;
    let receiptGst = 0;
    let receiptTotal = amount;

    if (membershipId) {
      const { data: ms } = await supabase
        .from("memberships")
        .select("amount, gst_amount, total_amount")
        .eq("id", membershipId)
        .single();
      if (ms) {
        receiptAmount = Number(ms.amount);
        receiptGst = Number(ms.gst_amount);
        receiptTotal = Number(ms.total_amount);
      }
    }

    const { data: receipt } = await supabase
      .from("receipts")
      .insert({
        gym_id: gymId,
        receipt_no: receiptNo,
        member_id: memberId,
        membership_id: membershipId,
        payment_id: payment.id,
        amount: receiptAmount,
        gst_amount: receiptGst,
        total_amount: receiptTotal,
        created_by: createdBy,
      })
      .select()
      .single();

    receiptId = receipt?.id ?? null;

    // Link receipt back to payment
    if (receiptId) {
      await supabase
        .from("payments")
        .update({ receipt_id: receiptId })
        .eq("id", payment.id);
    }
  }

  // Step 3: Update membership balance if linked
  if (membershipId) {
    const { data: ms } = await supabase
      .from("memberships")
      .select("amount_paid, total_amount, payment_status")
      .eq("id", membershipId)
      .single();

    if (ms) {
      const newAmountPaid = Number(ms.amount_paid) + amount;
      const newPaymentStatus =
        newAmountPaid >= Number(ms.total_amount) ? "paid" : "partial";

      await supabase
        .from("memberships")
        .update({
          amount_paid: newAmountPaid,
          payment_status: newPaymentStatus,
        })
        .eq("id", membershipId);
    }
  }

  // Step 4: Timeline event
  await supabase.from("member_events").insert({
    gym_id: gymId,
    member_id: memberId,
    event_type: "payment",
    title: `Payment recorded: ₹${amount.toFixed(2)}`,
    description: `${mode}${referenceNote ? " · " + referenceNote : ""}`,
    metadata: { membership_id: membershipId, receipt_no: receiptNo, receipt_id: receiptId },
    created_by: createdBy,
  });

  await logAudit({
    action: "payment.recorded",
    entity_type: "payments",
    entity_id: payment.id,
    changes: { member_id: memberId, amount, mode, membership_id: membershipId, receipt_id: receiptId },
  });

  revalidatePath("/dashboard/payments");
  revalidatePath(`/dashboard/members/${memberId}`);

  if (receiptId) {
    redirect(`/dashboard/receipts/${receiptId}`);
  }
  redirect(`/dashboard/members/${memberId}`);
}

export async function voidReceipt(receiptId: string, reason: string) {
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
    redirect("/dashboard/payments");
  }

  const { data: receipt } = await supabase
    .from("receipts")
    .select("member_id, receipt_no")
    .eq("id", receiptId)
    .eq("gym_id", userData!.gym_id)
    .single();

  if (!receipt) redirect("/dashboard/payments");

  await supabase
    .from("receipts")
    .update({
      voided_at: new Date().toISOString(),
      voided_by: userData!.id,
      void_reason: reason,
    })
    .eq("id", receiptId)
    .eq("gym_id", userData!.gym_id);

  await supabase.from("member_events").insert({
    gym_id: userData!.gym_id,
    member_id: receipt.member_id,
    event_type: "receipt_voided",
    title: `Receipt #${receipt.receipt_no} voided`,
    description: reason,
    created_by: userData!.id,
  });

  await logAudit({
    action: "receipt.voided",
    entity_type: "receipts",
    entity_id: receiptId,
    changes: { member_id: receipt.member_id, receipt_no: receipt.receipt_no, reason },
  });

  revalidatePath("/dashboard/payments");
  redirect("/dashboard/payments");
}

export async function updatePayment(paymentId: string, formData: FormData) {
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
    redirect("/dashboard/payments");
  }

  const gymId = userData!.gym_id;
  const amount = parseFloat(formData.get("amount") as string);
  const mode = formData.get("mode") as string;
  const referenceNote = (formData.get("reference_note") as string) || null;

  if (!amount || amount <= 0) {
    redirect("/dashboard/payments?error=Invalid+amount");
  }

  const { data: payment } = await supabase
    .from("payments")
    .select("id, membership_id, member_id, gym_id")
    .eq("id", paymentId)
    .eq("gym_id", gymId)
    .single();

  if (!payment) redirect("/dashboard/payments");

  await supabase
    .from("payments")
    .update({ amount, mode, reference_note: referenceNote })
    .eq("id", paymentId)
    .eq("gym_id", gymId);

  if (payment.membership_id) {
    const { data: allPayments } = await supabase
      .from("payments")
      .select("amount, receipt_id, receipts(voided_at)")
      .eq("membership_id", payment.membership_id);

    const validPayments = (allPayments ?? []).filter(
      (p: any) => !p.receipts || !p.receipts?.voided_at
    );
    const totalPaid = validPayments.reduce(
      (sum: number, p: any) => sum + Number(p.amount),
      0
    );

    const { data: ms } = await supabase
      .from("memberships")
      .select("total_amount")
      .eq("id", payment.membership_id)
      .single();

    if (ms) {
      const paymentStatus =
        totalPaid >= Number(ms.total_amount)
          ? "paid"
          : totalPaid > 0
            ? "partial"
            : "pending";

      await supabase
        .from("memberships")
        .update({
          amount_paid: totalPaid,
          payment_status: paymentStatus,
        })
        .eq("id", payment.membership_id);
    }
  }

  await logAudit({
    action: "payment.updated",
    entity_type: "payments",
    entity_id: paymentId,
    changes: { amount, mode, reference_note: referenceNote, member_id: payment.member_id },
  });

  revalidatePath(`/dashboard/members/${payment.member_id}`);
  redirect(`/dashboard/members/${payment.member_id}`);
}

export async function voidReceiptForm(formData: FormData) {
  const receiptId = formData.get("receipt_id") as string;
  const reason = formData.get("reason") as string;
  await voidReceipt(receiptId, reason);
}

// Refund (full or partial) a recorded payment — money-back ledger entry,
// independent of membership cancellation
export async function refundPayment(formData: FormData) {
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
    redirect("/dashboard/payments");
  }

  const paymentId = formData.get("payment_id") as string;
  const amount = parseFloat(formData.get("amount") as string) || 0;
  const reason = ((formData.get("reason") as string) || "").trim() || null;

  if (amount <= 0) {
    redirect("/dashboard/payments?error=" + encodeURIComponent("Refund amount must be greater than zero"));
  }

  const { data: payment } = await supabase
    .from("payments")
    .select("id, gym_id, member_id, membership_id, amount, receipt_id, receipts!payments_receipt_id_fkey(voided_at)")
    .eq("id", paymentId)
    .eq("gym_id", userData.gym_id)
    .single();

  if (!payment) redirect("/dashboard/payments?error=" + encodeURIComponent("Payment not found"));
  if (amount > Number(payment.amount)) {
    redirect(
      `/dashboard/members/${payment.member_id}?error=` +
        encodeURIComponent(`Refund cannot exceed the payment amount`)
    );
  }

  const { data: refund, error } = await supabase
    .from("refunds")
    .insert({
      gym_id: userData.gym_id,
      member_id: payment.member_id,
      membership_id: payment.membership_id,
      payment_id: paymentId,
      amount,
      reason,
      created_by: userData.id,
    })
    .select("id")
    .single();

  if (error) {
    redirect(`/dashboard/members/${payment.member_id}?error=` + encodeURIComponent(error.message));
  }

  await supabase.from("member_events").insert({
    gym_id: userData.gym_id,
    member_id: payment.member_id,
    event_type: "refund",
    title: `Refund issued: ${amount}`,
    description: reason ?? "Payment refund",
    metadata: { payment_id: paymentId, refund_id: refund?.id },
    created_by: userData.id,
  });

  await logAudit({
    action: "payment.refunded",
    entity_type: "payments",
    entity_id: paymentId,
    changes: { amount, reason },
  });

  revalidatePath(`/dashboard/members/${payment.member_id}`);
  revalidatePath("/dashboard/payments");
  redirect(`/dashboard/members/${payment.member_id}`);
}

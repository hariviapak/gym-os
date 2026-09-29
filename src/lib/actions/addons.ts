"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { todayIST } from "@/lib/utils";

export async function addMemberAddon(memberId: string, formData: FormData) {
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

  const name = formData.get("name") as string;
  const amount = parseFloat(formData.get("amount") as string);
  const description = (formData.get("description") as string) || null;
  const paymentMode = (formData.get("payment_mode") as string) || "cash";
  const referenceNote = (formData.get("reference_note") as string) || null;

  if (!name || !amount || amount <= 0) {
    redirect(`/dashboard/members/${memberId}?error=Invalid+add-on+details`);
  }

  // Step 1: Record payment
  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .insert({
      gym_id: gymId,
      member_id: memberId,
      amount,
      mode: paymentMode,
      reference_note: referenceNote || `Add-on: ${name}`,
      payment_date: todayIST(),
      created_by: createdBy,
    })
    .select()
    .single();

  if (paymentError) {
    redirect(`/dashboard/members/${memberId}?error=` + encodeURIComponent(paymentError.message));
  }

  // Step 2: Generate receipt
  let receiptId: string | null = null;
  let receiptNo: number | null = null;

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
        payment_id: payment.id,
        amount,
        gst_amount: 0,
        total_amount: amount,
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

  // Step 3: Create add-on record
  await supabase.from("member_addons").insert({
    gym_id: gymId,
    member_id: memberId,
    name,
    description,
    amount,
    payment_id: payment.id,
    created_by: createdBy,
  });

  // Step 4: Timeline event
  await supabase.from("member_events").insert({
    gym_id: gymId,
    member_id: memberId,
    event_type: "payment",
    title: `Add-on: ${name}`,
    description: `${formatCurrency(amount)} · ${paymentMode}${referenceNote ? " · " + referenceNote : ""}`,
    metadata: { addon: true, receipt_no: receiptNo, receipt_id: receiptId },
    created_by: createdBy,
  });

  revalidatePath(`/dashboard/members/${memberId}`);
  redirect(`/dashboard/members/${memberId}`);
}

function formatCurrency(amount: number): string {
  return `₹${amount.toFixed(2)}`;
}

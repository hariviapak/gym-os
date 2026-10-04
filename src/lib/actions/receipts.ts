"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { logAudit } from "@/lib/actions/audit";
import { normalizePhone } from "@/lib/utils";
import crypto from "crypto";

const TOKEN_TTL_DAYS = 90;

// One 90-day share token per receipt, refreshed on every send (upsert keeps
// one row per receipt — re-sending replaces the token with a fresh expiry)
export async function generateReceiptToken(receiptId: string, gymId: string) {
  const supabase = await createClient();
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + TOKEN_TTL_DAYS);

  // replace any prior token for this receipt (delete then insert keeps the
  // member's old link quiet instead of accumulating)
  await supabase.from("receipt_tokens").delete().eq("receipt_id", receiptId);
  const { error } = await supabase.from("receipt_tokens").insert({
    gym_id: gymId,
    receipt_id: receiptId,
    token,
    expires_at: expiresAt.toISOString(),
  });
  if (error) return { token: "", error: error.message };
  return { token, expiresAt: expiresAt.toISOString() };
}

// Staff flow: one tap on the receipt page → WhatsApp to the member with the
// public receipt link
export async function sendReceiptToMember(receiptId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, id")
    .eq("id", user!.id)
    .single();
  if (!userData) redirect("/dashboard");

  const [{ data: receipt }, { data: gym }] = await Promise.all([
    supabase
      .from("receipts")
      .select("receipt_no, member_id, members(first_name, last_name, phone)")
      .eq("id", receiptId)
      .eq("gym_id", userData.gym_id)
      .single(),
    supabase.from("gyms").select("name").eq("id", userData.gym_id).single(),
  ]);
  if (!receipt) redirect("/dashboard");

  const { token, error } = await generateReceiptToken(receiptId, userData.gym_id);
  if (error || !token) {
    redirect(`/dashboard/receipts/${receiptId}?error=` + encodeURIComponent(error ?? "Could not create link"));
  }

  await logAudit({
    action: "receipt.shared",
    entity_type: "receipts",
    entity_id: receiptId,
    changes: { receipt_no: receipt.receipt_no, member_id: receipt.member_id },
  });

  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.includes("localhost") ? "http" : "https");
  const url = host ? `${proto}://${host}/r/${token}` : `https://gymos.sakhi.app/r/${token}`;

  const member = receipt.members as any;
  const memberName = `${member?.first_name ?? ""} ${member?.last_name ?? ""}`.trim();
  const msg = `Hello ${memberName}, here is your payment receipt from ${gym?.name ?? "the gym"}: ${url}`;
  redirect(`https://wa.me/${normalizePhone(member?.phone ?? "")}?text=${encodeURIComponent(msg)}`);
}

// Public (token-gated) receipt lookup for /r/[token] — service client since
// the visitor has no session; the token itself is the authorization.
export async function getReceiptTokenInfo(token: string) {
  const service = createServiceClient();
  const { data: tokenRow } = await service
    .from("receipt_tokens")
    .select("id, receipt_id, gym_id, expires_at")
    .eq("token", token)
    .single();
  if (!tokenRow) return null;
  if (new Date(tokenRow.expires_at) < new Date()) return { expired: true as const };

  const [{ data: receipt }, { data: gym }] = await Promise.all([
    service
      .from("receipts")
      .select(
        "id, receipt_no, amount, gst_amount, total_amount, voided_at, created_at, members(first_name, last_name), memberships(packages(name, duration_days)), payments!receipts_payment_id_fkey(mode, reference_note, payment_date)"
      )
      .eq("id", tokenRow.receipt_id)
      .single(),
    service.from("gyms").select("name, address, phone").eq("id", tokenRow.gym_id).single(),
  ]);
  if (!receipt) return null;

  return { expired: false as const, receipt, gym };
}

"use server";

import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { logAudit } from "@/lib/actions/audit";
import crypto from "crypto";
import { normalizePhone } from "@/lib/utils";

export async function generateSigningToken(
  memberId: string,
  termsVersionId: string
): Promise<{ url: string; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, id")
    .eq("id", user!.id)
    .single();

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 7);

  const { error } = await supabase.from("signing_tokens").insert({
    gym_id: userData!.gym_id,
    member_id: memberId,
    terms_version_id: termsVersionId,
    token,
    expires_at: expiresAt.toISOString(),
    created_by: userData!.id,
  });

  if (error) {
    return { url: "", error: error.message };
  }

  // Derive the base URL from the request host so links always match the
  // domain staff is actually using (prod custom domain, preview deploys,
  // localhost). The env var is only a fallback when headers are unavailable.
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.includes("localhost") ? "http" : "https");
  const baseUrl = host
    ? `${proto}://${host}`
    : process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return { url: `${baseUrl}/sign/${token}` };
}

export async function submitSignatureFromToken(
  token: string,
  signatureImage: string,
  signedName: string
): Promise<{ success: boolean; error?: string }> {
  const service = createServiceClient();

  const { data: tokenRow } = await service
    .from("signing_tokens")
    .select("id, gym_id, member_id, terms_version_id, expires_at, used_at")
    .eq("token", token)
    .single();

  if (!tokenRow) {
    return { success: false, error: "Invalid signing link." };
  }

  if (tokenRow.used_at) {
    return { success: false, error: "This signing link has already been used." };
  }

  if (new Date(tokenRow.expires_at) < new Date()) {
    return { success: false, error: "This signing link has expired." };
  }

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  const userAgent = h.get("user-agent") || "unknown";

  const { error: acceptanceError } = await service.from("terms_acceptances").insert({
    gym_id: tokenRow.gym_id,
    member_id: tokenRow.member_id,
    terms_version_id: tokenRow.terms_version_id,
    accepted_by_method: "magic_link",
    signature_image: signatureImage,
    signed_name: signedName,
    signed_ip: ip,
    signed_user_agent: userAgent,
    signed_at: new Date().toISOString(),
  });

  if (acceptanceError) {
    return { success: false, error: "Failed to record signature. Please try again." };
  }

  await service
    .from("signing_tokens")
    .update({ used_at: new Date().toISOString() })
    .eq("id", tokenRow.id);

  await service.from("member_events").insert({
    gym_id: tokenRow.gym_id,
    member_id: tokenRow.member_id,
    event_type: "terms_accepted",
    title: "Terms signed digitally (magic link)",
    description: `Signed by: ${signedName}`,
    metadata: {
      terms_version_id: tokenRow.terms_version_id,
      method: "magic_link",
      ip,
    },
  });

  return { success: true };
}

export async function submitSignatureStaff(
  memberId: string,
  termsVersionId: string,
  signatureImage: string,
  signedName: string,
  gymId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, id")
    .eq("id", user!.id)
    .single();

  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const userAgent = h.get("user-agent") || "unknown";

  const { error } = await supabase.from("terms_acceptances").insert({
    gym_id: gymId,
    member_id: memberId,
    terms_version_id: termsVersionId,
    accepted_by_method: "canvas_signature",
    signature_image: signatureImage,
    signed_name: signedName,
    signed_ip: ip,
    signed_user_agent: userAgent,
    signed_at: new Date().toISOString(),
    created_by: userData!.id,
  });

  if (error) {
    return { success: false, error: error.message };
  }

  await supabase.from("member_events").insert({
    gym_id: gymId,
    member_id: memberId,
    event_type: "terms_accepted",
    title: "Terms signed digitally (tablet)",
    description: `Signed by: ${signedName}`,
    metadata: {
      terms_version_id: termsVersionId,
      method: "canvas_signature",
    },
    created_by: userData!.id,
  });

  await logAudit({
    action: "terms.signed",
    entity_type: "members",
    entity_id: memberId,
    changes: { terms_version_id: termsVersionId, method: "canvas_signature" },
  });

  revalidatePath(`/dashboard/members/${memberId}`);
  revalidatePath(`/dashboard/members/${memberId}/sign-terms`);

  return { success: true };
}

export async function getSigningTokenInfo(token: string) {
  const service = createServiceClient();

  const { data: tokenRow } = await service
    .from("signing_tokens")
    .select(`
      id,
      expires_at,
      used_at,
      member_id,
      gym_id,
      terms_version_id,
      members (first_name, last_name, phone),
      terms_versions (title, version, body, category),
      gyms (name)
    `)
    .eq("token", token)
    .single();

  return tokenRow;
}

// One-tap "send signing link via WhatsApp" used by the Reminders pending-terms
// section: generates a fresh magic link and redirects to wa.me with the same
// message as the member profile's sign-terms flow.
export async function sendTermsLink(formData: FormData) {
  const memberId = formData.get("member_id") as string;
  const termsVersionId = formData.get("terms_version_id") as string;

  const result = await generateSigningToken(memberId, termsVersionId);
  if (!result.url || result.error) {
    redirect(`/dashboard/members/${memberId}/sign-terms`);
  }

  const supabase = await createClient();
  const [memberRes, termsRes] = await Promise.all([
    supabase.from("members").select("first_name, last_name, phone").eq("id", memberId).single(),
    supabase.from("terms_versions").select("title").eq("id", termsVersionId).single(),
  ]);
  const memberName = `${memberRes.data?.first_name ?? ""} ${memberRes.data?.last_name ?? ""}`.trim();
  const phone = memberRes.data?.phone ?? "";
  const termsTitle = termsRes.data?.title ?? "Terms";

  const msg = `Hello ${memberName}, please review and sign our ${termsTitle}: ${result.url}`;
  redirect(`https://wa.me/${normalizePhone(phone)}?text=${encodeURIComponent(msg)}`);
}

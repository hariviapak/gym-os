"use server";

import { createClient } from "@/lib/supabase/server";

export async function logAudit(
  entry: {
    action: string;
    entity_type: string;
    entity_id?: string;
    changes?: Record<string, unknown>;
  },
  ctx?: { gymId: string; userId: string }
) {
  const supabase = await createClient();
  let userId: string | undefined;
  let gymId: string | undefined;

  if (ctx?.userId && ctx.gymId) {
    userId = ctx.userId;
    gymId = ctx.gymId;
  } else {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: userData } = await supabase
      .from("users")
      .select("gym_id")
      .eq("id", user.id)
      .single();
    if (!userData) return;
    userId = user.id;
    gymId = userData.gym_id;
  }

  await supabase.from("audit_logs").insert({
    gym_id: gymId,
    user_id: userId,
    action: entry.action,
    entity_type: entry.entity_type,
    entity_id: entry.entity_id ?? null,
    changes: entry.changes ?? {},
  });
}

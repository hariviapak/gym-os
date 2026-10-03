"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addDaysIST } from "@/lib/utils";
import { logAudit } from "@/lib/actions/audit";

// Snooze a reminder row: parks it until the chosen date without touching the
// underlying data (paying/renewing/delivering clears the row regardless).
export async function snoozeReminder(memberId: string, section: string, days: number) {
  const supabase = await createClient();
  // zero-network session read — middleware already verified, RLS enforces
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, role")
    .eq("id", user!.id)
    .single();

  if (!userData || !["owner", "admin", "manager", "staff"].includes(userData.role)) {
    redirect("/dashboard/reminders");
  }

  const { error } = await supabase
    .from("reminder_snoozes")
    .upsert(
      {
        gym_id: userData.gym_id,
        member_id: memberId,
        section,
        snoozed_until: addDaysIST(days),
        created_by: user!.id,
      },
      { onConflict: "member_id,section" }
    );

  if (error) {
    redirect("/dashboard/reminders?error=" + encodeURIComponent(error.message));
  }

  await logAudit({
    action: "reminder.snoozed",
    entity_type: "members",
    entity_id: memberId,
    changes: { section, days },
  });

  revalidatePath("/dashboard/reminders");
  revalidatePath("/dashboard");
  redirect("/dashboard/reminders");
}

// Wake a snoozed row early (it reappears in its section immediately)
export async function wakeReminder(snoozeId: string) {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, role")
    .eq("id", user!.id)
    .single();

  if (!userData || !["owner", "admin", "manager", "staff"].includes(userData.role)) {
    redirect("/dashboard/reminders");
  }

  const { data: row } = await supabase
    .from("reminder_snoozes")
    .select("member_id, section")
    .eq("id", snoozeId)
    .single();

  if (row) {
    await supabase.from("reminder_snoozes").delete().eq("id", snoozeId);
    await logAudit({
      action: "reminder.woken",
      entity_type: "members",
      entity_id: row.member_id,
      changes: { section: row.section },
    });
  }

  revalidatePath("/dashboard/reminders");
  revalidatePath("/dashboard");
  redirect("/dashboard/reminders");
}

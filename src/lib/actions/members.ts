"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { logAudit } from "@/lib/actions/audit";

// Assign / change / remove a member's group by name.
// Empty name -> remove from group. Unknown name -> create the group.
export async function setMemberGroup(memberId: string, formData: FormData) {
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

  const { data: member } = await supabase
    .from("members")
    .select("id, group_id")
    .eq("id", memberId)
    .eq("gym_id", gymId)
    .single();

  if (!member) redirect("/dashboard/members");

  const groupName = ((formData.get("group_name") as string) ?? "").trim();
  let groupId: string | null = null;

  if (groupName) {
    const { data: existingGroup } = await supabase
      .from("member_groups")
      .select("id")
      .eq("gym_id", gymId)
      .ilike("name", groupName)
      .maybeSingle();

    if (existingGroup) {
      groupId = existingGroup.id;
    } else {
      const { data: newGroup, error: groupError } = await supabase
        .from("member_groups")
        .insert({ gym_id: gymId, name: groupName, created_by: userData!.id })
        .select("id")
        .single();

      if (groupError || !newGroup) {
        redirect(`/dashboard/members/${memberId}?error=` + encodeURIComponent(groupError?.message ?? "Could not create group"));
      }
      groupId = newGroup.id;
    }
  }

  const { error } = await supabase
    .from("members")
    .update({ group_id: groupId })
    .eq("id", memberId)
    .eq("gym_id", gymId);

  if (error) {
    redirect(`/dashboard/members/${memberId}?error=` + encodeURIComponent(error.message));
  }

  if (member.group_id !== groupId) {
    await supabase.from("member_events").insert({
      gym_id: gymId,
      member_id: memberId,
      event_type: "profile_update",
      title: groupId ? `Moved to group "${groupName}"` : "Removed from group",
      created_by: userData!.id,
    });
  }

  revalidatePath(`/dashboard/members/${memberId}`);
}

export async function updateMemberStatus(
  memberId: string,
  status: "active" | "deactivated" | "blacklisted",
  reason: string | null
) {
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

  const { data: member } = await supabase
    .from("members")
    .select("first_name, last_name, status")
    .eq("id", memberId)
    .eq("gym_id", userData!.gym_id)
    .single();

  if (!member) redirect("/dashboard/members");

  await supabase
    .from("members")
    .update({
      status,
      blacklist_reason: status === "blacklisted" ? reason : null,
    })
    .eq("id", memberId)
    .eq("gym_id", userData!.gym_id);

  await supabase.from("member_events").insert({
    gym_id: userData!.gym_id,
    member_id: memberId,
    event_type: "status_change",
    title: `Status changed: ${member.status} → ${status}`,
    description: reason || undefined,
    created_by: userData!.id,
  });

  await logAudit({
    action: "member.status_changed",
    entity_type: "members",
    entity_id: memberId,
    changes: { from: member.status, to: status, reason },
  });

  revalidatePath(`/dashboard/members/${memberId}`);
  redirect(`/dashboard/members/${memberId}`);
}

export async function addMemberNote(memberId: string, formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, id")
    .eq("id", user!.id)
    .single();

  const note = (formData.get("note") as string)?.trim();

  if (!note) {
    redirect(`/dashboard/members/${memberId}?error=Note+cannot+be+empty`);
  }

  await supabase.from("member_events").insert({
    gym_id: userData!.gym_id,
    member_id: memberId,
    event_type: "note",
    title: note,
    created_by: userData!.id,
  });

  revalidatePath(`/dashboard/members/${memberId}`);
  redirect(`/dashboard/members/${memberId}`);
}

export async function updateMember(memberId: string, formData: FormData) {
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

  const { data: oldMember } = await supabase
    .from("members")
    .select("first_name, last_name, phone, email, group_id")
    .eq("id", memberId)
    .eq("gym_id", gymId)
    .single();

  if (!oldMember) redirect("/dashboard/members");

  // Resolve group by name: empty -> ungroup, existing name -> link, new name -> create
  const groupName = ((formData.get("group_name") as string) ?? "").trim();
  let groupId: string | null = null;
  if (groupName) {
    const { data: existingGroup } = await supabase
      .from("member_groups")
      .select("id")
      .eq("gym_id", gymId)
      .ilike("name", groupName)
      .maybeSingle();

    if (existingGroup) {
      groupId = existingGroup.id;
    } else {
      const { data: newGroup, error: groupError } = await supabase
        .from("member_groups")
        .insert({ gym_id: gymId, name: groupName, created_by: userData!.id })
        .select("id")
        .single();

      if (!groupError && newGroup) groupId = newGroup.id;
    }
  }

  const updates = {
    first_name: formData.get("first_name") as string,
    last_name: (formData.get("last_name") as string) || null,
    phone: formData.get("phone") as string,
    email: (formData.get("email") as string) || null,
    gender: (formData.get("gender") as string) || null,
    date_of_birth: (formData.get("date_of_birth") as string) || null,
    address: (formData.get("address") as string) || null,
    emergency_contact_name: (formData.get("emergency_contact_name") as string) || null,
    emergency_contact_phone: (formData.get("emergency_contact_phone") as string) || null,
    medical_notes: (formData.get("medical_notes") as string) || null,
    injury_notes: (formData.get("injury_notes") as string) || null,
    referred_by: (formData.get("referred_by") as string) || null,
    group_id: groupId,
  };

  const { error } = await supabase
    .from("members")
    .update(updates)
    .eq("id", memberId)
    .eq("gym_id", gymId);

  if (error) {
    redirect(`/dashboard/members/${memberId}/edit?error=` + encodeURIComponent(error.message));
  }

  const changes: string[] = [];
  if (oldMember.first_name !== updates.first_name) changes.push("name");
  if (oldMember.phone !== updates.phone) changes.push("phone");
  if (oldMember.email !== updates.email) changes.push("email");
  if (oldMember.group_id !== groupId) changes.push("group");

  await supabase.from("member_events").insert({
    gym_id: gymId,
    member_id: memberId,
    event_type: "profile_update",
    title: "Profile updated",
    description: changes.length > 0 ? `Changed: ${changes.join(", ")}` : "Details updated",
    created_by: userData!.id,
  });

  revalidatePath(`/dashboard/members/${memberId}`);
  redirect(`/dashboard/members/${memberId}`);
}

// Hard-delete a member. Only allowed when the member has NO financial history
// (memberships / payments) — those members must be deactivated instead so
// receipts and accounts stay intact. Cascades: events, addons, freezes, etc.
export async function deleteMember(memberId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, id, role")
    .eq("id", user!.id)
    .single();

  if (!userData || !["owner", "admin"].includes(userData.role)) {
    redirect("/dashboard/members?error=" + encodeURIComponent("Only owner/admin can delete members"));
  }

  const gymId = userData.gym_id;

  const { data: member } = await supabase
    .from("members")
    .select("id, first_name, last_name, phone")
    .eq("id", memberId)
    .eq("gym_id", gymId)
    .single();

  if (!member) redirect("/dashboard/members");

  const [{ count: membershipCount }, { count: paymentCount }] = await Promise.all([
    supabase.from("memberships").select("id", { count: "exact", head: true }).eq("member_id", memberId),
    supabase.from("payments").select("id", { count: "exact", head: true }).eq("member_id", memberId),
  ]);

  // History is deleted along with the member (owner's call — the client shows a
  // double confirm explaining exactly what will be removed). Done via the
  // hard_delete_member RPC so the append-only member_events trigger permits the
  // cascade within this one audited transaction.
  const { data: deleted, error } = await supabase.rpc("hard_delete_member", { p_member_id: memberId });

  if (error) {
    redirect(`/dashboard/members/${memberId}?error=` + encodeURIComponent(error.message));
  }
  if (!deleted) {
    redirect(
      `/dashboard/members/${memberId}?error=` + encodeURIComponent("Member was not deleted — not found or permission denied.")
    );
  }

  await logAudit({
    action: "member.deleted",
    entity_type: "members",
    entity_id: memberId,
    changes: {
      name: `${member.first_name} ${member.last_name ?? ""}`,
      phone: member.phone,
      deleted_memberships: membershipCount ?? 0,
      deleted_payments: paymentCount ?? 0,
    },
  });

  revalidatePath("/dashboard/members");
  redirect("/dashboard/members?deleted=1");
}

// Rename a GROUP (not move a member): updates the group's name for ALL its
// members at once. Same-name group in this gym gets a friendly error.
export async function renameMemberGroup(groupId: string, formData: FormData) {
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
    redirect("/dashboard/members?error=" + encodeURIComponent("Only owner/admin/manager can rename groups"));
  }

  const gymId = userData.gym_id;
  const name = ((formData.get("name") as string) || "").trim();
  if (!name) {
    redirect("/dashboard/members?error=" + encodeURIComponent("Group name cannot be empty"));
  }

  const { error } = await supabase
    .from("member_groups")
    .update({ name })
    .eq("id", groupId)
    .eq("gym_id", gymId);

  if (error) {
    const friendly = error.message.includes("duplicate")
      ? `A group named "${name}" already exists`
      : error.message;
    redirect("/dashboard/members?error=" + encodeURIComponent(friendly));
  }

  await logAudit({
    action: "member_group.renamed",
    entity_type: "member_groups",
    entity_id: groupId,
    changes: { new_name: name },
  });

  revalidatePath("/dashboard/members");
  const { data: anyMember } = await supabase
    .from("members")
    .select("id")
    .eq("group_id", groupId)
    .eq("gym_id", gymId)
    .limit(1)
    .maybeSingle();
  if (anyMember) redirect(`/dashboard/members/${anyMember.id}`);
  redirect("/dashboard/members");
}

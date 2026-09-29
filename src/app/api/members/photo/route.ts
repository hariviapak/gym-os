import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/lib/actions/audit";

const BUCKET = "member-photos";

// POST: record a (re)processed photo. The client uploads via its session and
// posts the final public URL + Storage path; both are persisted so lifecycle
// operations can target the exact object.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, role")
    .eq("id", user.id)
    .single();

  if (!userData) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json();
  const { memberId, photoUrl, photoPath } = body as {
    memberId: string;
    photoUrl: string;
    photoPath: string;
  };

  if (!memberId || !photoUrl || !photoPath) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const { error } = await supabase
    .from("members")
    .update({ photo_url: photoUrl, photo_path: photoPath })
    .eq("id", memberId)
    .eq("gym_id", userData.gym_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  await logAudit(
    {
      action: "member.photo_updated",
      entity_type: "members",
      entity_id: memberId,
    },
    { gymId: userData.gym_id, userId: user.id }
  );

  return NextResponse.json({ ok: true });
}

// DELETE: clear the record first (so the UI is never left with a broken
// reference), then delete the Storage object — the server owns cleanup so no
// orphaned images accumulate.
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, role")
    .eq("id", user.id)
    .single();

  if (!userData) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  if (!["owner", "admin", "manager"].includes(userData.role)) {
    return NextResponse.json({ error: "Insufficient permissions" }, { status: 403 });
  }

  const body = await request.json();
  const { memberId } = body as { memberId: string };

  if (!memberId) {
    return NextResponse.json({ error: "Missing memberId" }, { status: 400 });
  }

  const { data: member } = await supabase
    .from("members")
    .select("photo_url, photo_path")
    .eq("id", memberId)
    .eq("gym_id", userData.gym_id)
    .single();

  if (!member) {
    return NextResponse.json({ error: "Member not found" }, { status: 404 });
  }

  // resolve the object path: stored path, else derive from the legacy URL
  let path = member.photo_path;
  if (!path && member.photo_url) {
    const clean = member.photo_url.split("?")[0];
    const idx = clean.indexOf(`/object/public/${BUCKET}/`);
    if (idx >= 0) path = clean.slice(idx + `/object/public/${BUCKET}/`.length);
  }

  const { error } = await supabase
    .from("members")
    .update({ photo_url: null, photo_path: null })
    .eq("id", memberId)
    .eq("gym_id", userData.gym_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let storageWarning = false;
  if (path) {
    const { error: removeError } = await supabase.storage.from(BUCKET).remove([path]);
    if (removeError) {
      // record is already clean (no broken reference); be honest that the
      // stored object may still exist rather than reporting a false success
      storageWarning = true;
      console.warn(`photo record cleared but object ${path} could not be deleted:`, removeError.message);
    }
  }

  await logAudit(
    {
      action: "member.photo_deleted",
      entity_type: "members",
      entity_id: memberId,
    },
    { gymId: userData.gym_id, userId: user.id }
  );

  return NextResponse.json({ ok: true, storageWarning });
}

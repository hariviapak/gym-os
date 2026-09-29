import { createClient } from "@/lib/supabase/server";
import { LockersTable } from "@/components/lockers/lockers-table";
import Link from "next/link";

export default async function LockerKeysPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; error?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, role")
    .eq("id", user!.id)
    .single();

  if (!userData || !["owner", "admin", "manager"].includes(userData.role)) {
    return <div className="text-sm text-zinc-500">Not allowed.</div>;
  }

  const gymId = userData.gym_id;
  const params = await searchParams;
  const statusFilter = params.status ?? "all";

  const [{ data: keys }, { data: members }, { data: logs }] = await Promise.all([
    supabase
      .from("locker_keys")
      .select("*, members(first_name, last_name, phone)")
      .eq("gym_id", gymId)
      .order("key_number", { ascending: true }),
    supabase
      .from("members")
      .select("id, first_name, last_name, phone")
      .eq("gym_id", gymId)
      .eq("status", "active")
      .order("first_name", { ascending: true })
      .limit(300),
    supabase
      .from("locker_key_logs")
      .select("id, locker_key_id, member_id, key_number, issued_at, returned_at, notes, members(first_name, last_name)")
      .eq("gym_id", gymId)
      .order("issued_at", { ascending: false })
      .limit(200),
  ]);

  const allKeys = keys ?? [];

  // filtering happens client-side in LockersTable (instant, no round trips);
  // status/tab initial values come from the URL for deep links

  return (
    <div className="space-y-4">
      {/* Mobile: compact back header. Desktop: normal page header. */}
      <div className="md:hidden">
        <Link href="/dashboard" className="text-sm font-semibold text-zinc-500 transition hover:text-zinc-900">
          ← Locker Keys
        </Link>
      </div>
      <div className="hidden items-center justify-between gap-3 md:flex">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Locker Keys</h1>
          <p className="mt-0.5 text-sm text-zinc-500">Which keys exist, who has them, and their state.</p>
        </div>
        <Link
          href="/dashboard"
          className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
        >
          ← Dashboard
        </Link>
      </div>

      {params.error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{params.error}</div>
      )}

      <LockersTable
        keys={allKeys.map((k: any) => ({
          id: k.id,
          keyNumber: k.key_number,
          lockerNumber: k.locker_number,
          status: k.status,
          attention: k.attention,
          issuedAt: k.issued_at,
          memberId: k.current_member_id,
          memberName: k.members ? `${k.members.first_name} ${k.members.last_name ?? ""}`.trim() : null,
          memberPhone: k.members?.phone ?? null,
        }))}
        members={(members ?? []).map((m: any) => ({
          id: m.id,
          name: `${m.first_name} ${m.last_name ?? ""}`.trim(),
          phone: m.phone,
        }))}
        history={(logs ?? []).map((l: any) => ({
          id: l.id,
          keyId: l.locker_key_id,
          keyNumber: l.key_number,
          memberName: l.members ? `${l.members.first_name} ${l.members.last_name ?? ""}`.trim() : "—",
          issuedAt: l.issued_at,
          returnedAt: l.returned_at,
          notes: l.notes,
        }))}
        statusFilter={statusFilter}
        search={params.q ?? ""}
      />
    </div>
  );
}

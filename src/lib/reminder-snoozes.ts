// Shared snooze state for the Reminders page and the dashboard counts —
// both must agree on which rows are currently parked.

export type SnoozeRow = {
  id: string;
  member_id: string;
  section: string;
  snoozed_until: string;
};

const istToday = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);

export async function fetchActiveSnoozes(supabase: any, gymId: string): Promise<SnoozeRow[]> {
  const { data } = await supabase
    .from("reminder_snoozes")
    .select("id, member_id, section, snoozed_until")
    .eq("gym_id", gymId)
    .gte("snoozed_until", istToday());
  return data ?? [];
}

// key helper: member + section → active?
export function snoozeMap(rows: SnoozeRow[]): Map<string, SnoozeRow> {
  const m = new Map<string, SnoozeRow>();
  for (const r of rows) m.set(`${r.member_id}:${r.section}`, r);
  return m;
}

export function isSnoozed(map: Map<string, SnoozeRow>, memberId: string, section: string): SnoozeRow | undefined {
  return map.get(`${memberId}:${section}`);
}

// which sections a member has snoozed (for dashboard count filtering)
export function snoozedMembersBySection(rows: SnoozeRow[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const r of rows) {
    if (!m.has(r.section)) m.set(r.section, new Set());
    m.get(r.section)!.add(r.member_id);
  }
  return m;
}

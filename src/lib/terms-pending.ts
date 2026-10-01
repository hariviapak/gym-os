// Shared "who hasn't signed which terms" computation for the Reminders page
// and the dashboard Needs Attention card. A member needs:
//   - Gym terms    when they hold an active membership with service gym/both (or unset)
//   - Swimming     when they hold an active membership with service swimming/both
// and "signed" means an acceptance exists for the ACTIVE terms version of
// that category (same rule as the profile's Terms badge).

export interface PendingTermsRow {
  memberId: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  termsVersionId: string;
  termsTitle: string;
  category: "gym" | "swimming";
}

export async function fetchPendingTerms(
  supabase: any,
  gymId: string
): Promise<PendingTermsRow[]> {
  const today = new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);

  const [activeTermsRes, membershipsRes, acceptancesRes] = await Promise.all([
    supabase.from("terms_versions").select("id, title, category, status").eq("gym_id", gymId).eq("status", "active"),
    supabase
      .from("memberships")
      .select("member_id, packages(service_type), members(first_name, last_name, phone)")
      .eq("gym_id", gymId)
      .eq("status", "active")
      .lte("start_date", today)
      .gte("end_date", today),
    supabase.from("terms_acceptances").select("member_id, terms_version_id").eq("gym_id", gymId),
  ]);

  const gymTerms = (activeTermsRes.data ?? []).find((t: any) => t.category === "gym");
  const swimTerms = (activeTermsRes.data ?? []).find((t: any) => t.category === "swimming");
  if (!gymTerms && !swimTerms) return [];

  const accepted = new Set(
    (acceptancesRes.data ?? []).map((a: any) => `${a.member_id}:${a.terms_version_id}`)
  );

  const seen = new Set<string>();
  const rows: PendingTermsRow[] = [];
  for (const ms of membershipsRes.data ?? []) {
    const service = ms.packages?.service_type as string | null;
    const member = ms.members;
    if (!member) continue;
    const wants: Array<{ terms: any; label: "gym" | "swimming" }> = [];
    if (gymTerms && (!service || service === "gym" || service === "both")) {
      wants.push({ terms: gymTerms, label: "gym" });
    }
    if (swimTerms && (service === "swimming" || service === "both")) {
      wants.push({ terms: swimTerms, label: "swimming" });
    }
    for (const w of wants) {
      const key = `${ms.member_id}:${w.terms.id}`;
      if (accepted.has(key)) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        memberId: ms.member_id,
        firstName: member.first_name,
        lastName: member.last_name,
        phone: member.phone,
        termsVersionId: w.terms.id,
        termsTitle: w.terms.title,
        category: w.label,
      });
    }
  }

  rows.sort((a, b) => a.firstName.localeCompare(b.firstName));
  return rows;
}

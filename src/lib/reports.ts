import { todayIST } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Global date range for reports — one range drives every section/drill-down.
// All math is IST (the gym's timezone).
// ---------------------------------------------------------------------------

export interface DateRange {
  from: string; // YYYY-MM-DD
  to: string; // YYYY-MM-DD
  preset: string; // today | week | month | quarter | year | custom
}

const PRESETS = ["today", "week", "month", "quarter", "year", "custom"];

export function presetRange(preset: string): { from: string; to: string } {
  const today = todayIST();
  const anchor = new Date(`${today}T12:00:00+05:30`); // noon IST → same UTC day
  const y = Number(today.slice(0, 4));
  const m = Number(today.slice(5, 7));
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "week": {
      const monday = new Date(anchor);
      monday.setUTCDate(anchor.getUTCDate() - ((anchor.getUTCDay() + 6) % 7));
      return { from: monday.toISOString().slice(0, 10), to: today };
    }
    case "month":
      return { from: `${y}-${String(m).padStart(2, "0")}-01`, to: today };
    case "quarter": {
      const qm = Math.floor((m - 1) / 3) * 3 + 1;
      return { from: `${y}-${String(qm).padStart(2, "0")}-01`, to: today };
    }
    case "year":
      return { from: `${y}-01-01`, to: today };
    default:
      return { from: today, to: today };
  }
}

export function parseDateRange(params: { from?: string; to?: string; preset?: string }): DateRange {
  const preset = PRESETS.includes(params.preset ?? "")
    ? params.preset!
    : params.from && params.to
      ? "custom"
      : "month";
  if (preset === "custom") {
    if (params.from && params.to) return { from: params.from, to: params.to, preset };
    return { ...presetRange("month"), preset: "month" };
  }
  return { ...presetRange(preset), preset };
}

// timestamptz bounds (created_at columns) for an IST day range
export const rangeFromBound = (from: string) => `${from}T00:00:00+05:30`;
export const rangeToBound = (to: string) => `${to}T23:59:59.999+05:30`;

export function rangeParams(range: DateRange): Record<string, string> {
  return { preset: range.preset, from: range.from, to: range.to };
}

// ---------------------------------------------------------------------------
// Report queries — shared by the drill-down pages AND the CSV exports so the
// "what you see" and "what you export" filters are always identical.
// PostgREST can't filter embedded relations, so relation-based filters are
// resolved to id lists first.
// ---------------------------------------------------------------------------

const NONE = "00000000-0000-0000-0000-000000000000"; // matches nothing

type Client = any; // PostgrestClient from the server/route callers

async function memberIdsByQuery(client: Client, gymId: string, q: string) {
  const { data } = await client
    .from("members")
    .select("id")
    .eq("gym_id", gymId)
    .or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,phone.ilike.%${q}%`)
    .limit(100);
  return (data ?? []).map((m: any) => m.id);
}

export interface PaymentFilters {
  q?: string;
  mode?: string; // all | cash | upi | card | bank_transfer | other
  status?: string; // all | collected | voided
}

export async function fetchPayments(
  client: Client,
  gymId: string,
  range: DateRange,
  f: PaymentFilters,
  columns: string,
  page?: number,
  pageSize = 50
) {
  let query = client
    .from("payments")
    .select(columns, { count: "exact" as const })
    .eq("gym_id", gymId)
    .gte("payment_date", range.from)
    .lte("payment_date", range.to);

  if (f.mode && f.mode !== "all") query = query.eq("mode", f.mode);

  if (f.q) {
    const ids = await memberIdsByQuery(client, gymId, f.q);
    query = query.or(
      ids.length ? `reference_note.ilike.%${f.q}%,member_id.in.(${ids.join(",")})` : `reference_note.ilike.%${f.q}%`
    );
  }

  if (f.status === "voided" || f.status === "collected") {
    const { data: voided } = await client
      .from("receipts")
      .select("payment_id")
      .eq("gym_id", gymId)
      .not("voided_at", "is", null);
    const vids = (voided ?? []).map((r: any) => r.payment_id).filter(Boolean);
    if (f.status === "voided") {
      query = vids.length ? query.in("id", vids) : query.eq("id", NONE);
    } else if (vids.length) {
      query = query.not("id", "in", `(${vids.join(",")})`);
    }
  }

  const q = query.order("payment_date", { ascending: false }).order("created_at", { ascending: false });
  const res = page
    ? await q.range((page - 1) * pageSize, page * pageSize - 1)
    : await q.range(0, 99999);
  return { data: res.data ?? [], count: res.count ?? res.data?.length ?? 0, error: res.error };
}

export interface MembershipFilters {
  q?: string;
  packageId?: string;
  status?: string; // all | active | frozen | expired | upgraded | cancelled
  serviceType?: string; // all | gym | swimming | both
}

export async function fetchMemberships(
  client: Client,
  gymId: string,
  range: DateRange,
  basis: "created" | "ending",
  f: MembershipFilters,
  columns: string,
  page?: number,
  pageSize = 50
) {
  let query = client
    .from("memberships")
    .select(columns, { count: "exact" as const })
    .eq("gym_id", gymId);

  if (basis === "ending") {
    query = query.gte("end_date", range.from).lte("end_date", range.to).neq("status", "cancelled");
  } else {
    query = query.gte("created_at", rangeFromBound(range.from)).lte("created_at", rangeToBound(range.to));
  }

  if (f.packageId && f.packageId !== "all") query = query.eq("package_id", f.packageId);
  if (f.status && f.status !== "all") query = query.eq("status", f.status);

  if (f.serviceType && f.serviceType !== "all") {
    const { data: pkgs } = await client
      .from("packages")
      .select("id")
      .eq("gym_id", gymId)
      .eq("service_type", f.serviceType);
    const ids = (pkgs ?? []).map((p: any) => p.id);
    query = query.in("package_id", ids.length ? ids : [NONE]);
  }

  if (f.q) {
    const mIds = await memberIdsByQuery(client, gymId, f.q);
    const { data: pIds } = await client
      .from("packages")
      .select("id")
      .eq("gym_id", gymId)
      .or(`name.ilike.%${f.q}%`)
      .limit(50);
    const pkIds = (pIds ?? []).map((p: any) => p.id);
    const atoms: string[] = [];
    if (mIds.length) atoms.push(`member_id.in.(${mIds.join(",")})`);
    if (pkIds.length) atoms.push(`package_id.in.(${pkIds.join(",")})`);
    query = atoms.length ? query.or(atoms.join(",")) : query.eq("id", NONE);
  }

  const q = query.order(basis === "ending" ? "end_date" : "created_at");
  const res = page
    ? await q.range((page - 1) * pageSize, page * pageSize - 1)
    : await q.range(0, 99999);
  return { data: res.data ?? [], count: res.count ?? res.data?.length ?? 0, error: res.error };
}

export interface ExpenseFilters {
  q?: string;
  categoryId?: string;
}

export async function fetchExpenses(
  client: Client,
  gymId: string,
  range: DateRange,
  f: ExpenseFilters,
  columns: string,
  page?: number,
  pageSize = 50
) {
  let query = client
    .from("expenses")
    .select(columns, { count: "exact" as const })
    .eq("gym_id", gymId)
    .gte("expense_date", range.from)
    .lte("expense_date", range.to);

  if (f.categoryId && f.categoryId !== "all") query = query.eq("category_id", f.categoryId);

  if (f.q) {
    const { data: cats } = await client
      .from("expense_categories")
      .select("id")
      .eq("gym_id", gymId)
      .or(`name.ilike.%${f.q}%`);
    const cIds = (cats ?? []).map((c: any) => c.id);
    const atoms = [`description.ilike.%${f.q}%,title.ilike.%${f.q}%`];
    if (cIds.length) atoms.push(`category_id.in.(${cIds.join(",")})`);
    query = query.or(atoms.join(","));
  }

  const q = query.order("expense_date", { ascending: false }).order("created_at", { ascending: false });
  const res = page
    ? await q.range((page - 1) * pageSize, page * pageSize - 1)
    : await q.range(0, 99999);
  return { data: res.data ?? [], count: res.count ?? res.data?.length ?? 0, error: res.error };
}

export interface MemberFilters {
  q?: string;
}

export async function fetchNewMembers(
  client: Client,
  gymId: string,
  range: DateRange,
  f: MemberFilters,
  columns: string,
  page?: number,
  pageSize = 50
) {
  let query = client
    .from("members")
    .select(columns, { count: "exact" as const })
    .eq("gym_id", gymId)
    .gte("created_at", rangeFromBound(range.from))
    .lte("created_at", rangeToBound(range.to));

  if (f.q) query = query.or(`first_name.ilike.%${f.q}%,last_name.ilike.%${f.q}%,phone.ilike.%${f.q}%`);

  const q = query.order("created_at", { ascending: false });
  const res = page
    ? await q.range((page - 1) * pageSize, page * pageSize - 1)
    : await q.range(0, 99999);
  return { data: res.data ?? [], count: res.count ?? res.data?.length ?? 0, error: res.error };
}

export async function fetchRenewals(
  client: Client,
  gymId: string,
  range: DateRange,
  q: string | undefined,
  columns: string,
  page?: number,
  pageSize = 50
) {
  let query = client
    .from("member_events")
    .select(columns, { count: "exact" as const })
    .eq("gym_id", gymId)
    .eq("event_type", "renewal")
    .gte("created_at", rangeFromBound(range.from))
    .lte("created_at", rangeToBound(range.to));

  if (q) {
    const ids = await memberIdsByQuery(client, gymId, q);
    query = ids.length ? query.in("member_id", ids) : query.eq("id", NONE);
  }

  const ordered = query.order("created_at", { ascending: false });
  const res = page
    ? await ordered.range((page - 1) * pageSize, page * pageSize - 1)
    : await ordered.range(0, 99999);
  return { data: res.data ?? [], count: res.count ?? res.data?.length ?? 0, error: res.error };
}

export function csvEscape(value: unknown): string {
  const s = String(value ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvResponse(rows: (string | number | null | undefined)[][], filename: string) {
  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

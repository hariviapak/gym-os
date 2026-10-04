import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";
import {
  fullName,
  formatDate,
  formatCurrency,
  initials,
  todayIST,
  deriveMemberStatus,
  serviceLabel,
} from "@/lib/utils";
import { PrintButton } from "@/components/members/print-button";
import Link from "next/link";

// Print / PDF-ready member profile — clean A4 layout with no app chrome.
// Staff open it from the profile's More menu and hit Print (browser "Save as
// PDF" produces the shareable document).
export default async function MemberProfilePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
// zero-network session read: the middleware already verified this session,
  // and RLS enforces all data access regardless of where it was checked
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user) redirect("/login");
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id")
    .eq("id", user.id)
    .single();
  if (!userData) redirect("/login");
  const gymId = userData.gym_id;

  const [{ data: member }, { data: memberships }, { data: payments }, { data: refunds }, { data: gym }, { data: groups }, { data: keys }, { data: keyLogs }, { data: events }] =
    await Promise.all([
      supabase.from("members").select("*").eq("id", id).eq("gym_id", gymId).single(),
      supabase
        .from("memberships")
        .select("*, packages(name, type, service_type, duration_days)")
        .eq("member_id", id)
        .order("start_date", { ascending: false }),
      supabase
        .from("payments")
        .select("id, amount, mode, reference_note, payment_date, receipts!receipts_payment_id_fkey(id, receipt_no, voided_at)")
        .eq("member_id", id)
        .order("payment_date", { ascending: false }),
      supabase.from("refunds").select("amount, reason, created_at").eq("member_id", id).order("created_at", { ascending: false }),
      supabase.from("gyms").select("name").eq("id", gymId).single(),
      supabase.from("member_groups").select("id, name").eq("gym_id", gymId),
      supabase.from("locker_keys").select("id, key_number, locker_number, issued_at, status").eq("current_member_id", id).eq("gym_id", gymId),
      supabase.from("locker_key_logs").select("key_number, issued_at, returned_at").eq("member_id", id).order("issued_at", { ascending: false }).limit(20),
      supabase.from("member_events").select("event_type, title, description, created_at").eq("member_id", id).order("created_at", { ascending: false }).limit(40),
    ]);

  if (!member) notFound();

  const status = deriveMemberStatus({
    status: member.status,
    memberships: memberships ?? [],
  });
  const groupName = member.group_id ? (groups ?? []).find((g) => g.id === member.group_id)?.name : null;

  const live = (memberships ?? []).filter((ms: any) => ms.status === "active" || ms.status === "frozen");
  const outstanding = (live as any[]).reduce(
    (s, ms) => s + Math.max(0, Number(ms.total_amount) - Number(ms.amount_paid)),
    0
  );
  const totalPaid = (payments ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0);
  const totalRefunded = (refunds ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);

  const age = member.date_of_birth ? ageOf(member.date_of_birth) : null;
  const printTs = nowStamp();

  const sectionTitle = "mt-6 mb-2 border-b-2 border-zinc-900 pb-1 text-[11px] font-bold uppercase tracking-[0.18em] text-zinc-900";
  const th = "border-b border-zinc-400 px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-zinc-500";
  const td = "border-b border-zinc-200 px-2 py-1.5 text-[11px] text-zinc-800";

  return (
    <div className="min-h-screen bg-zinc-100 py-6 print:bg-white print:py-0">
      <style>{`@page { size: A4; margin: 10mm }`}</style>

      {/* Screen-only toolbar: way back (mobile PWA has no browser back) + the
          download button — never printed */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-3 print:hidden">
        <Link
          href={`/dashboard/members/${member.id}`}
          className="text-xs font-medium text-zinc-400 transition hover:text-zinc-900"
        >
          ← Back to {fullName(member)}
        </Link>
        <PrintButton />
      </div>

      <div className="mx-auto w-full max-w-[820px] bg-white px-4 py-6 text-zinc-900 shadow-lg sm:px-10 sm:py-10 print:px-10 print:py-10 print:shadow-none">
        {/* header */}
        <div className="flex items-start justify-between border-b-4 border-zinc-900 pb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">{gym?.name ?? "Gym"}</p>
            <h1 className="mt-1 font-serif text-2xl font-bold tracking-tight sm:text-3xl">Member Profile</h1>
            <p className="mt-0.5 text-[10px] text-zinc-400">Generated {printTs} · Confidential</p>
          </div>
        </div>

        {/* member hero */}
        <div className="mt-6 flex items-center gap-5">
          {member.photo_url ? (
            <img
              src={member.photo_url}
              alt={fullName(member)}
              className="h-16 w-16 shrink-0 rounded-full object-cover ring-1 ring-zinc-300 print:ring-0"
            />
          ) : (
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-zinc-900 font-serif text-2xl font-bold text-white">
              {initials(member)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="font-serif text-2xl font-bold leading-tight">{fullName(member)}</h2>
            <p className="mt-0.5 text-sm text-zinc-600">
              {member.phone}
              {member.email ? ` · ${member.email}` : ""}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-zinc-900 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                {status.label}
              </span>
              {age !== null && <Chip>{age} yrs</Chip>}
              {member.gender && <Chip>{member.gender}</Chip>}
              {groupName && <Chip>Group: {groupName}</Chip>}
              {member.referred_by && <Chip>Referred by {member.referred_by}</Chip>}
            </div>
          </div>
        </div>

        {/* summary strip */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 print:grid-cols-4">
          <Stat label="Member since" value={formatDate(member.created_at)} />
          <Stat label="Active plans" value={String((live as any[]).length)} />
          <Stat label="Lifetime paid" value={formatCurrency(totalPaid - totalRefunded)} sub={totalRefunded ? `${formatCurrency(totalRefunded)} refunded` : undefined} />
          <Stat label="Outstanding" value={outstanding > 0 ? formatCurrency(outstanding) : "—"} highlight={outstanding > 0} />
        </div>

        {/* memberships */}
        {(memberships ?? []).length > 0 && (
          <>
            <h3 className={sectionTitle}>Membership history</h3>
            <div className="overflow-x-auto print:overflow-visible"><table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>Package</th>
                  <th className={th}>Service</th>
                  <th className={th}>Period</th>
                  <th className={th}>Status</th>
                  <th className={th}>Payment</th>
                  <th className={`${th} text-right`}>Total</th>
                  <th className={`${th} text-right`}>Paid</th>
                </tr>
              </thead>
              <tbody>
                {(memberships ?? []).map((ms: any) => {
                  const future = ms.start_date > todayIST();
                  return (
                    <tr key={ms.id} className={ms.status === "cancelled" ? "text-zinc-400" : ""}>
                      <td className={`${td} font-semibold`}>{ms.packages?.name ?? ms.package_name ?? "—"}</td>
                      <td className={td}>{serviceLabel(ms.packages?.service_type ?? "gym")}</td>
                      <td className={td}>
                        {formatDate(ms.start_date)} → {formatDate(ms.end_date)}
                        {future && <span className="ml-1 text-[9px] font-semibold uppercase text-zinc-400">starts later</span>}
                      </td>
                      <td className={td}>{ms.status === "frozen" ? "Frozen" : ms.status === "cancelled" ? "Cancelled" : future ? "Upcoming" : ms.status}</td>
                      <td className={td}>{ms.payment_status}</td>
                      <td className={`${td} text-right`}>{formatCurrency(ms.total_amount)}</td>
                      <td className={`${td} text-right`}>{formatCurrency(ms.amount_paid)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          </>
        )}

        {/* payments */}
        {(payments ?? []).length > 0 && (
          <>
            <h3 className={sectionTitle}>Payment history</h3>
            <div className="overflow-x-auto print:overflow-visible"><table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={th}>Date</th>
                  <th className={th}>Receipt</th>
                  <th className={th}>Mode</th>
                  <th className={th}>Note</th>
                  <th className={`${th} text-right`}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {(payments ?? []).map((p: any) => {
                  const voided = p.receipts?.[0]?.voided_at;
                  return (
                    <tr key={p.id} className={voided ? "text-zinc-400" : ""}>
                      <td className={td}>{formatDate(p.payment_date)}</td>
                      <td className={td}>{p.receipts?.[0] ? `#${p.receipts[0].receipt_no}${voided ? " (voided)" : ""}` : "—"}</td>
                      <td className={`${td} uppercase`}>{p.mode}</td>
                      <td className={td}>{p.reference_note ?? "—"}</td>
                      <td className={`${td} text-right font-semibold`}>{formatCurrency(p.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table></div>
          </>
        )}

        {/* refunds */}
        {(refunds ?? []).length > 0 && (
          <>
            <h3 className={sectionTitle}>Refunds</h3>
            <div className="overflow-x-auto print:overflow-visible"><table className="w-full border-collapse">
              <tbody>
                {(refunds ?? []).map((r: any) => (
                  <tr key={r.created_at}>
                    <td className={td}>{formatDate(r.created_at)}</td>
                    <td className={td}>{r.reason ?? "—"}</td>
                    <td className={`${td} text-right font-semibold`}>-{formatCurrency(r.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table></div>
          </>
        )}

        {/* lockers */}
        {((keys ?? []).length > 0 || (keyLogs ?? []).length > 0) && (
          <>
            <h3 className={sectionTitle}>Locker keys</h3>
            {keys && keys.length > 0 ? (
              <p className="text-[11px] text-zinc-800">
                Currently held:{" "}
                <span className="font-semibold">
                  {(keys ?? []).map((k: any) => `${k.key_number}${k.locker_number ? ` (locker ${k.locker_number})` : ""}`).join(", ")}
                </span>
              </p>
            ) : (
              <p className="text-[11px] text-zinc-500">No keys currently held.</p>
            )}
            {(keyLogs ?? []).length > 0 && (
              <div className="mt-1.5 space-y-0.5">
                {(keyLogs ?? []).slice(0, 6).map((l: any, i: number) => (
                  <p key={i} className="text-[10px] text-zinc-500">
                    {l.key_number}: {formatDate(l.issued_at)} → {l.returned_at ? formatDate(l.returned_at) : "still out"}
                  </p>
                ))}
              </div>
            )}
          </>
        )}

        {/* details */}
        <h3 className={sectionTitle}>Details</h3>
        <div className="grid grid-cols-2 gap-x-8 gap-y-1.5 text-[11px]">
          <Detail label="Date of birth" value={member.date_of_birth ? `${formatDate(member.date_of_birth)}${age !== null ? ` (${age} yrs)` : ""}` : "—"} />
          <Detail label="Address" value={member.address ?? "—"} />
          <Detail label="Emergency contact" value={member.emergency_contact_name ? `${member.emergency_contact_name}${member.emergency_contact_phone ? ` · ${member.emergency_contact_phone}` : ""}` : "—"} />
          <Detail label="Joined" value={formatDate(member.created_at)} />
          {member.medical_notes && <Detail label="Medical notes" value={member.medical_notes} />}
          {member.injury_notes && <Detail label="Injury notes" value={member.injury_notes} />}
        </div>

        {/* activity */}
        {(events ?? []).length > 0 && (
          <>
            <h3 className={`${sectionTitle} print:break-before-page`}>Activity</h3>
            <div className="space-y-1">
              {(events ?? []).slice(0, 25).map((e: any, i: number) => (
                <div key={i} className="flex gap-2 border-b border-zinc-100 py-1 text-[10px]">
                  <span className="w-20 shrink-0 text-zinc-400">{formatDate(e.created_at)}</span>
                  <span className="font-semibold text-zinc-700">{e.title}</span>
                  {e.description && <span className="min-w-0 flex-1 truncate text-zinc-500">{e.description}</span>}
                </div>
              ))}
            </div>
          </>
        )}

        <p className="mt-8 border-t border-zinc-200 pt-2 text-center text-[9px] uppercase tracking-[0.25em] text-zinc-400">
          {gym?.name ?? "Gym"} · member profile · generated by GymOS
        </p>
      </div>
    </div>
  );
}

// kept as plain helpers (not called during render of a client component —
// this is a server page, but the purity lint applies regardless)
function ageOf(dob: string) {
  return Math.floor((Date.now() - new Date(dob).getTime()) / (365.25 * 24 * 3600 * 1000));
}

function nowStamp() {
  return new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full border border-zinc-300 px-2.5 py-0.5 text-[10px] font-medium text-zinc-600">
      {children}
    </span>
  );
}

function Stat({ label, value, sub, highlight }: { label: string; value: string; sub?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg border px-3 py-2.5 ${highlight ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200"}`}>
      <p className={`text-[9px] font-semibold uppercase tracking-wider ${highlight ? "text-zinc-300" : "text-zinc-400"}`}>{label}</p>
      <p className="mt-0.5 text-sm font-bold">{value}</p>
      {sub && <p className={`text-[9px] ${highlight ? "text-zinc-300" : "text-zinc-400"}`}>{sub}</p>}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-[10px] font-semibold uppercase tracking-wide text-zinc-400">{label}</span>
      <p className="text-zinc-800">{value}</p>
    </div>
  );
}

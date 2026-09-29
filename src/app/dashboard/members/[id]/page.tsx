import { createClient } from "@/lib/supabase/server";
import {
  fullName,
  formatDate,
  formatCurrency,
  daysUntil,
  initials,
  todayIST,
  deriveMemberStatus,
  serviceLabel,
  statusColor,
} from "@/lib/utils";
import Link from "next/link";
import { notFound } from "next/navigation";
import { updateMemberStatus, addMemberNote, setMemberGroup, renameMemberGroup } from "@/lib/actions/members";
import { markGiftKitDelivered } from "@/lib/actions/gift-kit";
import { addMemberAddon } from "@/lib/actions/addons";
import { requestFreeze, approveFreeze, rejectFreeze, endFreeze } from "@/lib/actions/freezes";
import { PhotoUpload } from "@/components/members/photo-upload";
import { RenewalModal } from "@/components/members/renewal-modal";
import { ExtendModal } from "@/components/members/extend-modal";
import { MembershipRowActions } from "@/components/members/membership-row-actions";
import { MoreMenu } from "@/components/members/more-menu";
import { PaymentHistory } from "@/components/payments/payment-history";
import { ActivityFeed } from "@/components/members/activity-feed";
import { LockerKeySection } from "@/components/members/locker-key-section";
import { WhatsAppButton } from "@/components/members/whatsapp-button";
import { ContactLogForm } from "@/components/members/contact-log-form";
import { MemberAvatar } from "@/components/members/member-avatar";
import { SubmitButton } from "@/components/ui/submit-button";

export default async function MemberProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; enrolled?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, role")
    .eq("id", user!.id)
    .single();

  const gymId = userData!.gym_id;
  const canManage = ["owner", "admin", "manager"].includes(userData!.role);

  const [{ data: member }, { data: memberships }, { data: events }, { data: payments }, { data: refunds }, { data: giftKit }, { data: packages }, { data: freezes }, { data: settings }, { data: templates }, { data: gym }, { data: termsAcceptances }, { data: keyLogs }, { data: memberKeys }] =
    await Promise.all([
      supabase.from("members").select("*").eq("id", id).eq("gym_id", gymId).single(),
      supabase
        .from("memberships")
        .select("*, packages(name, type, service_type, duration_days)")
        .eq("member_id", id)
        .order("created_at", { ascending: false }),
      supabase.from("member_events").select("*").eq("member_id", id).order("created_at", { ascending: false }).limit(50),
      supabase.from("payments").select("id, amount, mode, reference_note, payment_date, created_at, receipts!payments_receipt_id_fkey(id, receipt_no, voided_at)").eq("member_id", id).order("payment_date", { ascending: false }),
      supabase.from("refunds").select("id, amount, reason, created_at").eq("member_id", id).order("created_at", { ascending: false }),
      supabase.from("gift_kit_tasks").select("*").eq("member_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("packages").select("*").eq("gym_id", gymId).eq("is_active", true).order("sort_order", { ascending: true }),
      supabase.from("membership_freezes").select("*").eq("member_id", id).order("created_at", { ascending: false }),
      supabase.from("gym_settings").select("gst_mode").eq("gym_id", gymId).single(),
      supabase.from("message_templates").select("*").eq("gym_id", gymId).eq("is_active", true),
      supabase.from("gyms").select("name, digital_kit_url").eq("id", gymId).single(),
      supabase.from("terms_acceptances").select("*, terms_versions(id, title, version, category)").eq("member_id", id).order("accepted_at", { ascending: false }),
      supabase.from("locker_key_logs").select("*").eq("member_id", id).order("issued_at", { ascending: false }),
    supabase
      .from("locker_keys")
      .select("id, key_number, locker_number, issued_at, attention")
      .eq("current_member_id", id)
      .eq("gym_id", gymId)
      .order("issued_at", { ascending: false }),
    ]);

  if (!member) notFound();

  const todayStr = todayIST();
  const activeMemberships = (memberships ?? [])
    .filter((m: any) => m.status === "active" && m.start_date <= todayStr && m.end_date >= todayStr)
    .sort((a: any, b: any) => a.end_date.localeCompare(b.end_date));
  const activeMembership = activeMemberships[0] ?? null;
  const latestExpired =
    (memberships ?? [])
      .filter((m: any) => m.end_date < todayStr)
      .sort((a: any, b: any) => b.end_date.localeCompare(a.end_date))[0] ?? null;
  const cancelledMemberships = (memberships ?? []).filter((m: any) => m.status === "cancelled");
  const upcomingMemberships = (memberships ?? [])
    .filter((m: any) => m.status === "active" && m.start_date > todayStr)
    .sort((a: any, b: any) => a.start_date.localeCompare(b.start_date));

  // Freeze state
  const activeFreezes = (freezes ?? []).filter(
    (f: any) => f.status === "pending" || f.status === "active" || f.status === "approved"
  );
  const isFrozen = (freezes ?? []).some(
    (f: any) => f.status === "active" || f.status === "approved"
  );

  const derivedStatus = deriveMemberStatus({ ...member, memberships });
  const balanceDue = activeMemberships.reduce(
    (sum: number, m: any) => sum + Math.max(0, Number(m.total_amount) - Number(m.amount_paid)),
    0
  );
  const hasBalanceDue = balanceDue > 0.01;
  const daysLeft = activeMembership ? daysUntil(activeMembership.end_date) : null;
  const gstMode = settings?.gst_mode ?? "exclusive";
  const justEnrolled = sp.enrolled === "1";
  const totalPayments = (payments ?? []).reduce((sum: number, p: any) => sum + Number(p.amount), 0);
  const totalRefunds = (refunds ?? []).reduce((sum: number, r: any) => sum + Number(r.amount), 0);

  const waVars = {
    name: member.first_name,
    full_name: fullName(member),
    end_date: activeMembership ? formatDate(activeMembership.end_date) : "",
    amount: hasBalanceDue ? formatCurrency(balanceDue) : "",
    gym_name: gym?.name ?? "",
    package_name: activeMembership?.packages?.name ?? "",
  };
  const isExpiring = activeMembership && daysLeft !== null && daysLeft <= 30;
  const isBirthday = member.date_of_birth && new Date(member.date_of_birth).getMonth() === new Date().getMonth();
  const isBelatedBirthday = isBirthday && member.date_of_birth && new Date(member.date_of_birth).getDate() < new Date().getDate();
  const contextualTypes = [
    ...(isExpiring ? ["renewal"] : []),
    ...(hasBalanceDue ? ["dues"] : []),
    ...(isBelatedBirthday ? ["belated_birthday", "birthday"] : isBirthday ? ["birthday"] : []),
    ...(giftKit && giftKit.status !== "delivered" ? ["gift_kit", "welcome_kit"] : []),
    "custom",
  ];
  const contextualTemplates = (templates ?? []).filter((t: any) => contextualTypes.includes(t.type));

  // Terms status per category
  const acceptedIds = new Set((termsAcceptances ?? []).map((a: any) => a.terms_version_id));
  const needsGymTerms = activeMemberships.some(
    (m: any) => !m.packages?.service_type || m.packages.service_type === "gym" || m.packages.service_type === "both"
  );
  const needsSwimTerms = activeMemberships.some(
    (m: any) => m.packages?.service_type === "swimming" || m.packages?.service_type === "both"
  );

  // Membership rows (active first, then cancelled with reactivate, then latest expired)
  const seenPackages = new Set<string>();
  const heroRows = [
    ...activeMemberships.filter((m: any) => {
      if (seenPackages.has(m.package_id)) return false;
      seenPackages.add(m.package_id);
      return true;
    }),
    ...upcomingMemberships,
    ...cancelledMemberships.slice(0, 2),
  ].filter((m: any, i: number, arr: any[]) => arr.findIndex((x: any) => x.id === m.id) === i);
  if (heroRows.length === 0 && latestExpired) heroRows.push(latestExpired);

  const plansForModals = heroRows.map((m: any) => ({
    id: m.id,
    serviceType: m.packages?.service_type ?? "gym",
    name: m.package_name ?? m.packages?.name ?? "Membership",
    endDate: m.end_date,
    daysLeft: daysUntil(m.end_date),
    amountPaid: Number(m.amount_paid),
    status: m.status,
    paymentStatus: m.payment_status,
  }));

  // Group
  const group = member.group_id
    ? (await supabase.from("member_groups").select("id, name").eq("id", member.group_id).eq("gym_id", gymId).maybeSingle()).data
    : null;
  const groupMembers = group
    ? (
        await supabase
          .from("members")
          .select("id, first_name, last_name, phone, status, photo_url")
          .eq("group_id", group.id)
          .eq("gym_id", gymId)
          .order("first_name", { ascending: true })
      ).data
    : null;
  const { data: existingGroups } = await supabase
    .from("member_groups")
    .select("name")
    .eq("gym_id", gymId)
    .order("name", { ascending: true });

  const cardClass = "rounded-xl bg-white ring-1 ring-zinc-200/60";

  return (
    <div className="space-y-5">
      {sp.error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{sp.error}</div>
      )}

      {justEnrolled && (
        <div className="rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span>Member enrolled successfully!</span>
            <div className="flex items-center gap-2">
              <Link href={`/dashboard/members/${member.id}/sign-terms`} className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-green-700">
                Sign Terms →
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ============ 1. MEMBER HEADER ============ */}
      <div className={`${cardClass} p-5`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-4">
            <PhotoUpload memberId={member.id} gymId={gymId} currentPhotoUrl={member.photo_url} initials={initials(member)} size="lg" canDelete={canManage} />
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-zinc-900">{fullName(member)}</h1>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-zinc-500">
                <a href={`tel:${member.phone}`} className="hover:text-zinc-900">{member.phone}</a>
                <WhatsAppButton member={member} templates={contextualTemplates} vars={waVars} redirect_to={`/dashboard/members/${member.id}`} />
                {member.email && <span>· {member.email}</span>}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${derivedStatus.cls}`}>{derivedStatus.label}</span>
                {isFrozen && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">Frozen</span>}
                {activeMemberships.map((ms: any) => (
                  <span key={ms.id} className="max-w-full truncate rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700">
                    {serviceLabel(ms.packages?.service_type)} · {ms.package_name ?? ms.packages?.name}
                  </span>
                ))}
                {hasBalanceDue && (
                  <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">{formatCurrency(balanceDue)} due</span>
                )}
                {member.group_id && group?.name && (
                  <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700">{group.name}</span>
                )}
              </div>
            </div>
          </div>

          {/* Primary actions only; everything else under More */}
          <div className="flex flex-wrap items-center gap-2">
            {canManage && packages && packages.length > 0 && member.status === "active" && (
              <RenewalModal
                memberId={member.id}
                packages={packages ?? []}
                gstMode={gstMode}
                currentPlans={plansForModals}
                variant="primary"
              />
            )}
            {hasBalanceDue && (
              <Link
                href={`/dashboard/payments/new?member_id=${member.id}`}
                className="whitespace-nowrap rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-amber-700"
              >
                Collect {formatCurrency(balanceDue)}
              </Link>
            )}
            {canManage && activeMembership && <ExtendModal memberId={member.id} currentPlans={plansForModals} />}
            {canManage && activeMembership && !isFrozen && (
              <Link
                href="#freeze"
                className="whitespace-nowrap rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
              >
                Freeze
              </Link>
            )}
            {canManage && <MoreMenu memberId={member.id} memberStatus={member.status} memberName={fullName(member)} />}
          </div>
        </div>
      </div>

      {/* ============ FREEZE (banner + request form) ============ */}
      <div id="freeze" className="space-y-2">
        {freezes?.filter((f: any) => f.status === "pending").map((f: any) => (
          <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-amber-50 px-4 py-3 ring-1 ring-amber-200">
            <div>
              <span className="text-sm font-medium text-amber-900">Freeze request: {formatDate(f.start_date)} → {formatDate(f.end_date)}</span>
              {f.reason && <span className="ml-2 text-xs text-amber-700">{f.reason}</span>}
            </div>
            {canManage ? (
              <div className="flex gap-2">
                <form action={approveFreeze.bind(null, f.id, member.id)}><button type="submit" className="rounded-lg bg-green-600 px-3 py-1 text-xs font-semibold text-white hover:bg-green-700">Approve</button></form>
                <form action={rejectFreeze.bind(null, f.id, member.id)}><button type="submit" className="rounded-lg bg-red-600 px-3 py-1 text-xs font-semibold text-white hover:bg-red-700">Reject</button></form>
              </div>
            ) : (
              <span className="text-xs font-medium text-amber-700">Awaiting manager approval</span>
            )}
          </div>
        ))}
        {freezes?.filter((f: any) => f.status === "active" || f.status === "approved").map((f: any) => (
          <div key={f.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-blue-50 px-4 py-3 ring-1 ring-blue-200">
            <span className="text-sm font-medium text-blue-900">Frozen: {formatDate(f.start_date)} → {formatDate(f.end_date)}{f.reason ? ` · ${f.reason}` : ""}</span>
            {canManage && (
              <form action={endFreeze.bind(null, f.id, member.id)}>
                <button type="submit" className="rounded-lg bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700">Unfreeze</button>
              </form>
            )}
          </div>
        ))}
        {canManage && activeMembership && !isFrozen && activeFreezes.length === 0 && (
          <details className={`${cardClass} px-4 py-3`}>
            <summary className="cursor-pointer text-sm font-medium text-zinc-600">Request a freeze</summary>
            <form action={requestFreeze} className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-4">
              <input type="hidden" name="member_id" value={member.id} />
              <input type="hidden" name="membership_id" value={activeMembership.id} />
              <input name="start_date" type="date" required min={todayIST()} defaultValue={todayIST()} className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-zinc-900 focus:outline-none" />
              <input name="end_date" type="date" required defaultValue={todayIST()} className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-zinc-900 focus:outline-none" />
              <input name="reason" placeholder="Reason…" className="rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-zinc-900 focus:outline-none sm:col-span-1" />
              <SubmitButton className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-zinc-800" label="Freezing…">
                Freeze
              </SubmitButton>
            </form>
          </details>
        )}
      </div>

      {/* ============ 2. CURRENT MEMBERSHIPS ============ */}
      <div className={`${cardClass} p-5`}>
        <div className="mb-1 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">Memberships</h2>
          <span className="text-xs text-zinc-400">valid until · remaining</span>
        </div>
        <div className="divide-y divide-zinc-100">
          {heroRows.length === 0 && <p className="py-4 text-sm text-zinc-400">No memberships yet.</p>}
          {heroRows.map((m: any) => {
            const msDays = daysUntil(m.end_date);
            const rowDue = Math.max(0, Number(m.total_amount) - Number(m.amount_paid));
            const isUpcoming = m.status === "active" && m.start_date > todayStr;
            const plan = plansForModals.find((p) => p.id === m.id)!;
            return (
              <div key={m.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="shrink-0 rounded bg-blue-50 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-blue-700">
                    {serviceLabel(m.packages?.service_type)}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-zinc-900">{m.package_name ?? m.packages?.name}</p>
                    <p className="whitespace-nowrap text-xs text-zinc-400">
                      {formatDate(m.start_date)} → {formatDate(m.end_date)}
                      {!isUpcoming && rowDue > 0.01 && <span className="ml-1.5 font-medium text-amber-700">{formatCurrency(rowDue)} due</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="whitespace-nowrap text-sm">
                    {isUpcoming ? (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">
                        starts {formatDate(m.start_date)}
                      </span>
                    ) : m.status === "active" ? (
                      <span className={msDays < 0 ? "text-red-600" : msDays <= 3 ? "text-orange-600" : "text-green-600"}>
                        {msDays < 0 ? "expired" : `${msDays}d left`}
                      </span>
                    ) : (
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(m.status)}`}>{m.status}</span>
                    )}
                  </span>
                  {canManage && (
                    <MembershipRowActions memberId={member.id} plan={{ ...plan, upcoming: isUpcoming }} packages={packages ?? []} gstMode={gstMode} allPlans={plansForModals} />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ============ 3. PAYMENT ============ */}
      <div className={`${cardClass} p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          {hasBalanceDue ? (
            <>
              <p className="text-lg font-bold text-amber-700">Outstanding {formatCurrency(balanceDue)}</p>
              <Link href={`/dashboard/payments/new?member_id=${member.id}`} className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-700">
                Collect Payment
              </Link>
            </>
          ) : (
            <p className="text-lg font-bold text-green-700">All paid up ✓</p>
          )}
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          Total paid {formatCurrency(totalPayments)}
          {(payments ?? []).length > 0 &&
            ` · ${(payments ?? []).length} payment${(payments ?? []).length === 1 ? "" : "s"}`}
          {totalRefunds > 0 && ` · ${formatCurrency(totalRefunds)} refunded`}
        </p>
        <div className="mt-3 border-t border-zinc-100 pt-3">
          <PaymentHistory
            memberId={member.id}
            memberPhone={member.phone}
            payments={(payments ?? []).map((p: any) => ({
              id: p.id,
              amount: Number(p.amount),
              mode: p.mode,
              referenceNote: p.reference_note,
              paymentDate: p.payment_date,
              receiptNo: p.receipts?.receipt_no ?? null,
              receiptId: p.receipts?.id ?? null,
              voided: !!p.receipts?.voided_at,
            }))}
          />
        </div>
      </div>

      {/* ============ 4. DETAILS & GROUP ============ */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-5">
        <div className={`${cardClass} p-5 lg:col-span-3`}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-400">Personal Information</h2>
          <dl className="space-y-0 divide-y divide-zinc-100 text-sm">
            {[
              ["Gender", member.gender ? member.gender.charAt(0).toUpperCase() + member.gender.slice(1) : "—"],
              ["Date of birth", member.date_of_birth ? `${formatDate(member.date_of_birth)}${memberAge(member) ? ` (${memberAge(member)} yrs)` : ""}` : "—"],
              ["Address", member.address || "—"],
              ["Emergency contact", member.emergency_contact_name ? `${member.emergency_contact_name}${member.emergency_contact_phone ? ` · ${member.emergency_contact_phone}` : ""}` : "—"],
              ["Referred by", member.referred_by || "—"],
              ["Member since", formatDate(member.created_at)],
            ].map(([label, value]) => (
              <div key={label as string} className="flex items-start justify-between gap-4 py-2">
                <dt className="text-xs font-medium text-zinc-400">{label}</dt>
                <dd className="text-right text-sm text-zinc-800">{value}</dd>
              </div>
            ))}
          </dl>
          {(member.medical_notes || member.injury_notes) && (
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {member.medical_notes && (
                <div className="rounded-lg bg-yellow-50 px-3 py-2">
                  <p className="text-xs font-medium text-yellow-700">Medical</p>
                  <p className="text-xs text-yellow-900">{member.medical_notes}</p>
                </div>
              )}
              {member.injury_notes && (
                <div className="rounded-lg bg-orange-50 px-3 py-2">
                  <p className="text-xs font-medium text-orange-700">Injury</p>
                  <p className="text-xs text-orange-900">{member.injury_notes}</p>
                </div>
              )}
            </div>
          )}
          {(member.blacklist_reason || member.status !== "active") && (
            <p className="mt-3 text-xs text-zinc-400">
              {member.status !== "active" && <>Status: <span className={`font-medium ${statusColor(member.status)}`}>{member.status}</span>{member.blacklist_reason ? ` · ${member.blacklist_reason}` : ""}</>}
            </p>
          )}

          {/* Terms + gift kit lines */}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-zinc-100 pt-3 text-xs text-zinc-500">
            <Link href={`/dashboard/members/${member.id}/sign-terms`} className="font-medium text-blue-700 hover:text-blue-900">
              Terms: {needsGymTerms ? (acceptedIds.size > 0 ? "signed" : "pending") : "—"}
              {needsSwimTerms ? " · swim: pending" : ""}
            </Link>
            {giftKit && (
              <span className="flex items-center gap-1.5">
                Gift kit: {giftKit.status}
                {canManage && giftKit.status !== "delivered" && (
                  <form action={markGiftKitDelivered.bind(null, giftKit.id, member.id)}>
                    <SubmitButton className="text-[10px] font-semibold text-green-700 underline-offset-2 hover:underline" label="…">
                      mark delivered
                    </SubmitButton>
                  </form>
                )}
              </span>
            )}
          </div>
        </div>

        {/* Group */}
        <div className={`${cardClass} p-5 lg:col-span-2`}>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-400">Group (family / team / school)</h2>
          {group ? (
            <>
              <div className="mb-3 flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-zinc-900">{group.name}</p>
                {canManage && (
                  <div className="flex items-center gap-2">
                    <details className="group">
                      <summary className="cursor-pointer list-none text-xs font-medium text-zinc-500 transition hover:text-zinc-900">Rename</summary>
                      <form action={renameMemberGroup.bind(null, group.id)} className="mt-2 flex gap-2">
                        <input name="name" defaultValue={group.name} className="block w-36 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs focus:border-zinc-900 focus:outline-none" />
                        <SubmitButton className="shrink-0 rounded-lg bg-zinc-900 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-800" label="Renaming…">Save</SubmitButton>
                      </form>
                      <p className="mt-1 text-[10px] text-zinc-400">Renames the group for ALL its members.</p>
                    </details>
                    <form action={setMemberGroup.bind(null, member.id)}>
                      <input type="hidden" name="group_name" value="" />
                      <SubmitButton className="text-xs font-medium text-zinc-400 transition hover:text-red-600" label="…">Remove</SubmitButton>
                    </form>
                  </div>
                )}
              </div>
              <div className="space-y-1">
                {(groupMembers ?? []).map((gm: any) => (
                  <Link key={gm.id} href={`/dashboard/members/${gm.id}`} className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-zinc-50 ${gm.id === member.id ? "bg-zinc-50" : ""}`}>
                    <MemberAvatar firstName={gm.first_name} lastName={gm.last_name} photoUrl={gm.photo_url} size="xs" />
                    <span className="flex-1 text-sm text-zinc-700">{fullName(gm)}</span>
                    {gm.id === member.id ? (
                      <span className="text-[10px] font-semibold uppercase text-zinc-400">this member</span>
                    ) : (
                      <span className="text-xs text-zinc-400">{gm.phone}</span>
                    )}
                  </Link>
                ))}
              </div>
            </>
          ) : (
            <p className="mb-3 text-sm text-zinc-400">No group yet.</p>
          )}
          {canManage && (
            <div className="mt-3 border-t border-zinc-100 pt-3">
              <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
                {group ? "Move this member to a different group" : "Assign this member to a group"}
              </p>
              <form action={setMemberGroup.bind(null, member.id)} className="flex gap-2">
                <input name="group_name" list="profile-group-options" defaultValue="" className="block w-full rounded-lg border border-zinc-300 px-3 py-1.5 text-sm focus:border-zinc-900 focus:outline-none" placeholder={group ? "e.g. Another Family / Team" : "e.g. Verma Family"} />
                <datalist id="profile-group-options">
                  {(existingGroups ?? []).map((g: any) => (
                    <option key={g.name} value={g.name} />
                  ))}
                </datalist>
                <SubmitButton className="shrink-0 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-800" label="Saving…">
                  {group ? "Move" : "Add to Group"}
                </SubmitButton>
              </form>
              <p className="mt-1 text-[10px] text-zinc-400">Typing a new name creates a new group. Remove (above) takes only this member out.</p>
            </div>
          )}
        </div>
      </div>

      {/* ============ 5. ACTIVITY ============ */}
      <div className={`${cardClass} p-5`}>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-400">Recent Activity</h2>
        <ActivityFeed
          events={(events ?? []).map((e: any) => ({
            id: e.id,
            event_type: e.event_type,
            title: e.title,
            description: e.description,
            created_at: e.created_at,
          }))}
        />
      </div>

      {/* ============ 6. ADMIN AREA ============ */}
      {canManage && (
        <div className="rounded-xl bg-zinc-50 p-5 ring-1 ring-zinc-200/60">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">Staff tools</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Add Note */}
            <div className="rounded-xl bg-white p-4 ring-1 ring-zinc-200/60">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Add Note</h3>
              <form action={addMemberNote.bind(null, member.id)} className="space-y-2">
                <textarea name="note" required rows={2} className="block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none" placeholder="Note…" />
                <SubmitButton className="w-full rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-200" label="Saving…">Add Note</SubmitButton>
              </form>
            </div>

            {/* Log Contact */}
            <div className="rounded-xl bg-white p-4 ring-1 ring-zinc-200/60">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Log Contact</h3>
              <ContactLogForm memberId={member.id} />
            </div>

            {/* Add Charge */}
            <div className="rounded-xl bg-white p-4 ring-1 ring-zinc-200/60">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Add Charge</h3>
              <form action={addMemberAddon.bind(null, member.id)} className="space-y-2">
                <input name="name" required list="addon-suggestions" className="block w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-zinc-900 focus:outline-none" placeholder="Item / Service" />
                <datalist id="addon-suggestions">
                  <option value="Personal Training Session" /><option value="Gym Towel" /><option value="Water Bottle" /><option value="Protein Supplement" /><option value="Locker Rental" /><option value="Diet Plan" /><option value="T-Shirt" />
                </datalist>
                <div className="flex gap-2">
                  <input name="amount" type="number" step="0.01" required min={1} className="block w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm focus:border-zinc-900 focus:outline-none" placeholder="₹" />
                  <select name="payment_mode" className="rounded-lg border border-zinc-300 px-2 py-1.5 text-sm focus:border-zinc-900 focus:outline-none">
                    <option value="cash">Cash</option><option value="upi">UPI</option><option value="card">Card</option>
                  </select>
                </div>
                <SubmitButton className="w-full rounded-lg bg-zinc-100 px-3 py-1.5 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-200" label="Adding…">+ Add Charge</SubmitButton>
              </form>
            </div>

            {/* Locker */}
            <div className="rounded-xl bg-white p-4 ring-1 ring-zinc-200/60">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-400">Locker Keys</h3>
              <LockerKeySection
                memberId={member.id}
                keys={(memberKeys ?? []).map((k: any) => ({
                  id: k.id,
                  keyNumber: k.key_number,
                  lockerNumber: k.locker_number,
                  issuedAt: k.issued_at,
                  attention: k.attention,
                }))}
                history={(keyLogs ?? []).map((l: any) => ({
                  keyNumber: l.key_number,
                  issuedAt: l.issued_at,
                  returnedAt: l.returned_at,
                }))}
              />
            </div>
          </div>
          <p className="mt-4 text-[11px] text-zinc-400">
            Deactivate, blacklist and delete live under <strong>More ▾</strong> in the header — away from everyday actions.
          </p>
        </div>
      )}
    </div>
  );
}

function memberAge(member: any): number | null {
  if (!member.date_of_birth) return null;
  return Math.floor((new Date().getTime() - new Date(member.date_of_birth).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
}

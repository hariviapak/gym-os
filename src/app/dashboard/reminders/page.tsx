import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate, daysUntil, todayIST, addDaysIST, timeAgo } from "@/lib/utils";
import Link from "next/link";
import { WhatsAppButton } from "@/components/members/whatsapp-button";
import { markGiftKitDelivered } from "@/lib/actions/gift-kit";
import { sendTermsLink } from "@/lib/actions/signing";
import { fetchPendingTerms } from "@/lib/terms-pending";
import { wakeReminder } from "@/lib/actions/reminders";
import { fetchActiveSnoozes, snoozeMap } from "@/lib/reminder-snoozes";
import { SnoozeButton } from "@/components/reminders/snooze-button";
import { SubmitButton } from "@/components/ui/submit-button";
import { MobilePageHeader } from "@/components/ui/mobile-page-header";

export default async function RemindersPage() {
  const supabase = await createClient();
// zero-network session read: the middleware already verified this session,
  // and RLS enforces all data access regardless of where it was checked
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, role")
    .eq("id", user!.id)
    .single();

  const gymId = userData!.gym_id;
  const canSeeFinances = ["owner", "admin", "manager"].includes(userData!.role);

  const [todayEnrollments, expiringSoon, pendingDues, birthdayMembers, giftKits, templates, gym] = await Promise.all([
    supabase
      .from("members")
      .select("id, first_name, last_name, phone, created_at")
      .eq("gym_id", gymId)
      .gte("created_at", todayIST())
      .order("created_at", { ascending: false }),
    supabase
      .from("memberships")
      .select("id, member_id, end_date, package_id, packages(name), members(first_name, last_name, phone)")
      .eq("gym_id", gymId)
      .eq("status", "active")
      .lte("end_date", addDaysIST(30))
      .order("end_date", { ascending: true }),
    supabase
      .from("memberships")
      .select("id, member_id, total_amount, amount_paid, members(first_name, last_name, phone)")
      .eq("gym_id", gymId)
      .eq("status", "active")
      .in("payment_status", ["partial", "pending"])
      .order("created_at", { ascending: false }),
    supabase
      .from("members")
      .select("id, first_name, last_name, date_of_birth, phone")
      .eq("gym_id", gymId)
      .not("date_of_birth", "is", null)
      .limit(500),
    supabase
      .from("gift_kit_tasks")
      .select("id, member_id, status, digital_sent_at, members(first_name, last_name, phone)")
      .eq("gym_id", gymId)
      .in("status", ["pending", "assigned"])
      .order("created_at", { ascending: true }),
    supabase
      .from("message_templates")
      .select("*")
      .eq("gym_id", gymId)
      .eq("is_active", true),
    supabase
      .from("gyms")
      .select("name, digital_kit_url")
      .eq("id", gymId)
      .single(),
  ]);

  const gymName = gym?.data?.name ?? "";
  const digitalKitUrl = gym?.data?.digital_kit_url ?? null;
  const templatesList = templates.data ?? [];

  const enrollmentsList = todayEnrollments.data ?? [];
  const expiringList = expiringSoon.data ?? [];
  const duesList = pendingDues.data ?? [];
  const giftKitList = giftKits.data ?? [];
  const pendingTerms = await fetchPendingTerms(supabase, gymId);
  const snoozes = await fetchActiveSnoozes(supabase, gymId);
  const sMap = snoozeMap(snoozes);
  const snoozedFor = (memberId: string, section: string) => sMap.get(`${memberId}:${section}`);
  const currentMonth = new Date().getMonth();
  const birthdayList = (birthdayMembers.data ?? [])
    .filter((m: any) => new Date(m.date_of_birth).getMonth() === currentMonth)
    .sort((a: any, b: any) => new Date(a.date_of_birth).getDate() - new Date(b.date_of_birth).getDate());

  const expiredAll = expiringList.filter((m: any) => daysUntil(m.end_date) < 0);
  // long-expired (60+ days) collapse behind a quiet link; recent stay visible
  const expiredRecent = expiredAll.filter((m: any) => daysUntil(m.end_date) >= -60);
  const expiredLong = expiredAll.filter((m: any) => daysUntil(m.end_date) < -60);
  const expired = expiredRecent;
  const thisWeek = expiringList.filter((m: any) => {
    const d = daysUntil(m.end_date);
    return d >= 0 && d <= 7;
  });
  const thisMonth = expiringList.filter((m: any) => {
    const d = daysUntil(m.end_date);
    return d > 7 && d <= 30;
  });

  // Fetch contact events for ALL relevant members
  const allMemberIds = [
    ...enrollmentsList.map((m: any) => m.id),
    ...expiringList.map((m: any) => m.member_id),
    ...duesList.map((d: any) => d.member_id),
    ...birthdayList.map((m: any) => m.id),
    ...giftKitList.map((g: any) => g.member_id),
  ];
  const contactMap: Record<string, any> = {};
  if (allMemberIds.length > 0) {
    const { data: contactEvents } = await supabase
      .from("member_events")
      .select("member_id, created_at, title, users(name)")
      .eq("gym_id", gymId)
      .eq("event_type", "contact")
      .in("member_id", allMemberIds)
      .order("created_at", { ascending: false });
    for (const ev of contactEvents ?? []) {
      if (!contactMap[ev.member_id]) {
        contactMap[ev.member_id] = { ...ev, count: 1 };
      } else {
        contactMap[ev.member_id].count += 1;
      }
    }
  }
  const nowMs = new Date().getTime();

  // polite resend gaps per section (hours): dues 3d, expiring 7d, rest 24h
  const GAP = { dues: 72, "expiring-week": 168, "expiring-month": 168, expired: 24, enrollments: 24, birthdays: 24 };
  function contactStatus(memberId: string, section = "enrollments") {
    const last = contactMap[memberId];
    if (!last) return null;
    const gapH = (GAP as any)[section] ?? 24;
    return {
      last,
      count: last.count ?? 1,
      by: last.users?.name ?? null,
      isRecent: (nowMs - new Date(last.created_at).getTime()) / (1000 * 60 * 60) < gapH,
    };
  }

  function getTemplates(type: string) {
    return templatesList.filter((t: any) => t.type === type);
  }

  // Enrollments and birthdays stay in the list after contact (show ✓ Sent status)
  const hasAny =
    enrollmentsList.length > 0 ||
    expired.length > 0 ||
    thisWeek.length > 0 ||
    thisMonth.length > 0 ||
    duesList.length > 0 ||
    birthdayList.length > 0 ||
    giftKitList.length > 0;

  return (
    <div className="space-y-5">
      <MobilePageHeader title="Reminders" />
      <div className="hidden md:block">
        <h1 className="text-2xl font-bold text-zinc-900">Reminders</h1>
        <p className="mt-0.5 text-sm text-zinc-500">Send WhatsApp messages to members who need attention</p>
      </div>

      {!hasAny && (
        <div className="rounded-xl bg-white p-8 text-center ring-1 ring-zinc-200/60">
          <p className="text-sm text-zinc-400">No reminders pending. Everyone is up to date!</p>
        </div>
      )}

      {/* New Enrollments */}
      {enrollmentsList.length > 0 && (
        <Section title="New Enrollments (Today)" count={enrollmentsList.length} dot="bg-green-400" anchor="enrollments">
          {enrollmentsList.map((m: any) => {
            const cs = contactStatus(m.id);
            return (
              <ReminderRow
                key={m.id}
                name={`${m.first_name} ${m.last_name ?? ""}`}
                phone={m.phone}
                href={`/dashboard/members/${m.id}`}
                member={{ id: m.id, first_name: m.first_name, last_name: m.last_name, phone: m.phone }}
                templates={getTemplates("welcome_kit")}
                vars={{ name: m.first_name, gym_name: gymName, digital_kit_url: digitalKitUrl }}
                contactStatus={cs}
              />
            );
          })}
        </Section>
      )}

      {/* Expired */}
      {(() => {
        const visible = expiredRecent.filter((m: any) => !snoozedFor(m.member_id, "expired"));
        const snoozedRows = expiredRecent.filter((m: any) => snoozedFor(m.member_id, "expired"));
        const show = visible.length > 0 || snoozedRows.length > 0 || expiredLong.length > 0;
        return show ? (
          <Section title="Expired Memberships" count={visible.length} dot="bg-red-400" anchor="expired">
            {visible.map((m: any) => {
              const cs = contactStatus(m.member_id, "expired");
              return (
                <ReminderRow
                  key={m.id}
                  name={`${m.members?.first_name} ${m.members?.last_name ?? ""}`}
                  phone={m.members?.phone}
                  href={`/dashboard/members/${m.member_id}`}
                  info={`${m.packages?.name ?? ""} · expired ${formatDate(m.end_date)}`}
                  member={{ id: m.member_id, first_name: m.members?.first_name, last_name: m.members?.last_name, phone: m.members?.phone }}
                  templates={getTemplates("renewal")}
                  vars={{ name: m.members?.first_name, gym_name: gymName, package_name: m.packages?.name, end_date: formatDate(m.end_date) }}
                  contactStatus={cs}
                  snooze={<SnoozeButton memberId={m.member_id} section="expired" />}
                />
              );
            })}
            {expiredLong.length > 0 && (
              <details className="border-t border-zinc-100">
                <summary className="cursor-pointer px-5 py-2.5 text-xs font-medium text-zinc-400 hover:text-zinc-600">
                  {expiredLong.length} expired 60+ days ago · show
                </summary>
                {expiredLong.map((m: any) => {
                  const cs = contactStatus(m.member_id, "expired");
                  return (
                    <ReminderRow
                      key={m.id}
                      name={`${m.members?.first_name} ${m.members?.last_name ?? ""}`}
                      phone={m.members?.phone}
                      href={`/dashboard/members/${m.member_id}`}
                      info={`${m.packages?.name ?? ""} · expired ${formatDate(m.end_date)}`}
                      member={{ id: m.member_id, first_name: m.members?.first_name, last_name: m.members?.last_name, phone: m.members?.phone }}
                      templates={getTemplates("renewal")}
                      vars={{ name: m.members?.first_name, gym_name: gymName, package_name: m.packages?.name, end_date: formatDate(m.end_date) }}
                      contactStatus={cs}
                    />
                  );
                })}
              </details>
            )}
            {snoozedRows.length > 0 && (
              <details className="border-t border-zinc-100">
                <summary className="cursor-pointer px-5 py-2.5 text-xs font-medium text-zinc-400 hover:text-zinc-600">
                  {snoozedRows.length} snoozed · show
                </summary>
                {snoozedRows.map((m: any) => {
                  const sz = snoozedFor(m.member_id, "expired")!;
                  return (
                    <div key={m.id} className="flex items-center justify-between px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <span className="text-sm text-zinc-500">{m.members?.first_name} {m.members?.last_name}</span>
                        <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">back on {formatDate(sz.snoozed_until)}</span>
                      </div>
                      <form action={wakeReminder.bind(null, sz.id)}>
                        <button type="submit" className="rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-200">Wake</button>
                      </form>
                    </div>
                  );
                })}
              </details>
            )}
          </Section>
        ) : null;
      })()}

      {/* Expiring This Week */}
      {(() => {
        const visible = thisWeek.filter((m: any) => !snoozedFor(m.member_id, "expiring-week"));
        const snoozedRows = thisWeek.filter((m: any) => snoozedFor(m.member_id, "expiring-week"));
        return visible.length > 0 || snoozedRows.length > 0 ? (
          <Section title="Expiring This Week" count={visible.length} dot="bg-amber-400" anchor="expiring-week">
            {visible.map((m: any) => {
              const cs = contactStatus(m.member_id, "expiring-week");
              return (
                <ReminderRow
                  key={m.id}
                  name={`${m.members?.first_name} ${m.members?.last_name ?? ""}`}
                  phone={m.members?.phone}
                  href={`/dashboard/members/${m.member_id}`}
                  info={`${m.packages?.name ?? ""} · ends ${formatDate(m.end_date)}`}
                  member={{ id: m.member_id, first_name: m.members?.first_name, last_name: m.members?.last_name, phone: m.members?.phone }}
                  templates={getTemplates("renewal")}
                  vars={{ name: m.members?.first_name, gym_name: gymName, package_name: m.packages?.name, end_date: formatDate(m.end_date) }}
                  contactStatus={cs}
                  snooze={<SnoozeButton memberId={m.member_id} section="expiring-week" />}
                />
              );
            })}
            {snoozedRows.length > 0 && (
              <details className="border-t border-zinc-100">
                <summary className="cursor-pointer px-5 py-2.5 text-xs font-medium text-zinc-400 hover:text-zinc-600">
                  {snoozedRows.length} snoozed · show
                </summary>
                {snoozedRows.map((m: any) => {
                  const sz = snoozedFor(m.member_id, "expiring-week")!;
                  return (
                    <div key={m.id} className="flex items-center justify-between px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <span className="text-sm text-zinc-500">{m.members?.first_name} {m.members?.last_name}</span>
                        <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">back on {formatDate(sz.snoozed_until)}</span>
                      </div>
                      <form action={wakeReminder.bind(null, sz.id)}>
                        <button type="submit" className="rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-200">Wake</button>
                      </form>
                    </div>
                  );
                })}
              </details>
            )}
          </Section>
        ) : null;
      })()}

      {/* Expiring This Month */}
      {(() => {
        const visible = thisMonth.filter((m: any) => !snoozedFor(m.member_id, "expiring-month"));
        const snoozedRows = thisMonth.filter((m: any) => snoozedFor(m.member_id, "expiring-month"));
        return visible.length > 0 || snoozedRows.length > 0 ? (
          <Section title="Expiring This Month" count={visible.length} dot="bg-zinc-300" anchor="expiring-month">
            {visible.map((m: any) => {
              const cs = contactStatus(m.member_id, "expiring-month");
              return (
                <ReminderRow
                  key={m.id}
                  name={`${m.members?.first_name} ${m.members?.last_name ?? ""}`}
                  phone={m.members?.phone}
                  href={`/dashboard/members/${m.member_id}`}
                  info={`${m.packages?.name ?? ""} · ends ${formatDate(m.end_date)}`}
                  member={{ id: m.member_id, first_name: m.members?.first_name, last_name: m.members?.last_name, phone: m.members?.phone }}
                  templates={getTemplates("renewal")}
                  vars={{ name: m.members?.first_name, gym_name: gymName, package_name: m.packages?.name, end_date: formatDate(m.end_date) }}
                  contactStatus={cs}
                  snooze={<SnoozeButton memberId={m.member_id} section="expiring-month" />}
                />
              );
            })}
            {snoozedRows.length > 0 && (
              <details className="border-t border-zinc-100">
                <summary className="cursor-pointer px-5 py-2.5 text-xs font-medium text-zinc-400 hover:text-zinc-600">
                  {snoozedRows.length} snoozed · show
                </summary>
                {snoozedRows.map((m: any) => {
                  const sz = snoozedFor(m.member_id, "expiring-month")!;
                  return (
                    <div key={m.id} className="flex items-center justify-between px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <span className="text-sm text-zinc-500">{m.members?.first_name} {m.members?.last_name}</span>
                        <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">back on {formatDate(sz.snoozed_until)}</span>
                      </div>
                      <form action={wakeReminder.bind(null, sz.id)}>
                        <button type="submit" className="rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-200">Wake</button>
                      </form>
                    </div>
                  );
                })}
              </details>
            )}
          </Section>
        ) : null;
      })()}

      {/* Pending Dues */}
      {(() => {
        const visible = duesList.filter((d: any) => !snoozedFor(d.member_id, "dues"));
        const snoozedRows = duesList.filter((d: any) => snoozedFor(d.member_id, "dues"));
        return visible.length > 0 || snoozedRows.length > 0 ? (
          <Section title="Pending Dues" count={visible.length} dot="bg-amber-400" anchor="dues">
            {visible.map((d: any) => {
              const balance = Number(d.total_amount) - Number(d.amount_paid);
              const cs = contactStatus(d.member_id, "dues");
              return (
                <ReminderRow
                  key={d.id}
                  name={`${d.members?.first_name} ${d.members?.last_name ?? ""}`}
                  phone={d.members?.phone}
                  href={`/dashboard/members/${d.member_id}`}
                  info={canSeeFinances ? formatCurrency(balance) : "Pending payment"}
                  member={{ id: d.member_id, first_name: d.members?.first_name, last_name: d.members?.last_name, phone: d.members?.phone }}
                  templates={getTemplates("dues")}
                  vars={{ name: d.members?.first_name, gym_name: gymName, amount: formatCurrency(balance) }}
                  contactStatus={cs}
                  snooze={<SnoozeButton memberId={d.member_id} section="dues" />}
                />
              );
            })}
            {snoozedRows.length > 0 && (
              <details className="border-t border-zinc-100">
                <summary className="cursor-pointer px-5 py-2.5 text-xs font-medium text-zinc-400 hover:text-zinc-600">
                  {snoozedRows.length} snoozed · show
                </summary>
                {snoozedRows.map((d: any) => {
                  const sz = snoozedFor(d.member_id, "dues")!;
                  return (
                    <div key={d.id} className="flex items-center justify-between px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <span className="text-sm text-zinc-500">{d.members?.first_name} {d.members?.last_name}</span>
                        <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">back on {formatDate(sz.snoozed_until)}</span>
                      </div>
                      <form action={wakeReminder.bind(null, sz.id)}>
                        <button type="submit" className="rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-200">Wake</button>
                      </form>
                    </div>
                  );
                })}
              </details>
            )}
          </Section>
        ) : null;
      })()}

      {/* Birthdays */}
      {birthdayList.length > 0 && (
        <Section title="Birthdays This Month" count={birthdayList.length} dot="bg-purple-400" anchor="birthdays">
          {birthdayList.map((m: any) => {
            const day = new Date(m.date_of_birth).getDate();
            const today = new Date().getDate();
            const isBelated = day < today;
            const cs = contactStatus(m.id);
            const birthdayTemplates = isBelated
              ? [...getTemplates("belated_birthday"), ...getTemplates("birthday")]
              : getTemplates("birthday");
            return (
              <ReminderRow
                key={m.id}
                name={`${m.first_name} ${m.last_name ?? ""}`}
                phone={m.phone}
                href={`/dashboard/members/${m.id}`}
                info={isBelated ? `Was ${day}${ordinalSuffix(day)}` : `${day}${ordinalSuffix(day)}`}
                member={{ id: m.id, first_name: m.first_name, last_name: m.last_name, phone: m.phone }}
                templates={birthdayTemplates}
                vars={{ name: m.first_name, gym_name: gymName }}
                contactStatus={cs}
              />
            );
          })}
        </Section>
      )}

      {/* Gift Kits Pending */}
      {(() => {
        const visible = giftKitList.filter((g: any) => !snoozedFor(g.member_id, "gift-kits"));
        const snoozedRows = giftKitList.filter((g: any) => snoozedFor(g.member_id, "gift-kits"));
        return visible.length > 0 || snoozedRows.length > 0 ? (
          <Section title="Gift Kits Pending" count={visible.length} dot="bg-blue-400" anchor="gift-kits">
          {visible.map((g: any) => {
            const digitalSent = !!g.digital_sent_at || !!contactMap[g.member_id];
            const giftTemplates = digitalSent ? [] : [...getTemplates("welcome_kit"), ...getTemplates("gift_kit")];
            return (
              <div key={g.id} className="flex items-center justify-between px-5 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/dashboard/members/${g.member_id}`} className="text-sm font-medium text-zinc-700 hover:text-zinc-900">
                    {g.members?.first_name} {g.members?.last_name}
                  </Link>
                  {g.members?.phone && <span className="ml-2 text-xs text-zinc-400">{g.members.phone}</span>}
                  <span className="ml-2 text-xs text-zinc-400">· {digitalSent ? "Digital ✓ Sent" : "Digital not sent"}</span>
                </div>
                <div className="flex items-center gap-2">
                  {!digitalSent && (
                    <WhatsAppButton
                      member={{ id: g.member_id, first_name: g.members?.first_name, last_name: g.members?.last_name, phone: g.members?.phone }}
                      templates={giftTemplates}
                      vars={{ name: g.members?.first_name, gym_name: gymName, digital_kit_url: digitalKitUrl }}
                      redirect_to="/dashboard/reminders"
                    />
                  )}
                  <form action={markGiftKitDelivered.bind(null, g.id, g.member_id)}>
                    <SubmitButton
                      className="rounded-lg bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 transition hover:bg-green-100"
                      label="..."
                    >
                      Mark Delivered
                    </SubmitButton>
                  </form>
                  <SnoozeButton memberId={g.member_id} section="gift-kits" />
                </div>
              </div>
            );
          })}
            {snoozedRows.length > 0 && (
              <details className="border-t border-zinc-100">
                <summary className="cursor-pointer px-5 py-2.5 text-xs font-medium text-zinc-400 hover:text-zinc-600">
                  {snoozedRows.length} snoozed · show
                </summary>
                {snoozedRows.map((g: any) => {
                  const sz = snoozedFor(g.member_id, "gift-kits")!;
                  return (
                    <div key={g.id} className="flex items-center justify-between px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <span className="text-sm text-zinc-500">{g.members?.first_name} {g.members?.last_name}</span>
                        <span className="ml-2 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">back on {formatDate(sz.snoozed_until)}</span>
                      </div>
                      <form action={wakeReminder.bind(null, sz.id)}>
                        <button type="submit" className="rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600 transition hover:bg-zinc-200">Wake</button>
                      </form>
                    </div>
                  );
                })}
              </details>
            )}
          </Section>
        ) : null;
      })()}

      {/* Terms Pending Signature */}
      {pendingTerms.length > 0 && (
        <Section title="Terms Pending Signature" count={pendingTerms.length} dot="bg-violet-400" anchor="terms">
          {pendingTerms.map((t) => (
            <div key={`${t.memberId}-${t.termsVersionId}`} className="flex items-center justify-between px-5 py-3">
              <div className="min-w-0 flex-1">
                <Link href={`/dashboard/members/${t.memberId}`} className="text-sm font-medium text-zinc-700 hover:text-zinc-900">
                  {t.firstName} {t.lastName}
                </Link>
                {t.phone && <span className="ml-2 text-xs text-zinc-400">{t.phone}</span>}
                <span
                  className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    t.category === "swimming" ? "bg-blue-50 text-blue-700" : "bg-violet-50 text-violet-700"
                  }`}
                >
                  {t.category === "swimming" ? "Swimming Rules" : "Gym T&C"}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <form action={sendTermsLink}>
                  <input type="hidden" name="member_id" value={t.memberId} />
                  <input type="hidden" name="terms_version_id" value={t.termsVersionId} />
                  <SubmitButton
                    className="rounded-lg bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 transition hover:bg-green-100"
                    label="Opening…"
                  >
                    Send link
                  </SubmitButton>
                </form>
                <Link
                  href={`/dashboard/members/${t.memberId}/sign-terms`}
                  className="rounded-lg bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:bg-zinc-200"
                >
                  Sign →
                </Link>
              </div>
            </div>
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({
  title,
  count,
  dot,
  anchor,
  children,
}: {
  title: string;
  count: number;
  dot: string;
  anchor?: string;
  children: React.ReactNode;
}) {
  return (
    <div id={anchor} className="scroll-mt-20 rounded-xl bg-white ring-1 ring-zinc-200/60">
      <div className="flex items-center gap-2.5 px-5 py-3.5">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
        <span className="text-sm text-zinc-400">({count})</span>
      </div>
      <div className="divide-y divide-zinc-100 border-t border-zinc-100">
        {children}
      </div>
    </div>
  );
}

function ReminderRow({
  name,
  phone,
  href,
  info,
  member,
  templates,
  vars,
  contactStatus,
  snooze,
}: {
  name: string;
  phone: string | null;
  href: string;
  info?: string;
  member: { id: string; first_name: string; last_name: string | null; phone: string };
  templates: any[];
  vars: Record<string, string | null | undefined>;
  contactStatus?: { last: any; isRecent: boolean; count?: number; by?: string | null } | null;
  snooze?: React.ReactNode;
}) {
  const contacted = !!contactStatus;
  // the section's resend gap governs when the button returns (dues 3d,
  // expiring 7d, else 24h) — messaged rows show ✓ Sent until the gap passes
  const showButton = !contacted || !contactStatus?.isRecent;
  const times = (contactStatus?.count ?? 1) > 1 ? `${contactStatus?.count}× · ` : "";

  return (
    <div className="flex items-center justify-between px-5 py-3">
      <div className="min-w-0 flex-1">
        <Link href={href} className="text-sm font-medium text-zinc-700 hover:text-zinc-900">
          {name}
        </Link>
        {phone && <span className="ml-2 text-xs text-zinc-400">{phone}</span>}
        {info && <span className="ml-2 text-xs text-zinc-400">· {info}</span>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {contacted && !showButton ? (
          <span className="text-xs font-medium text-green-600" title={contactStatus?.by ?? undefined}>
            ✓ Sent {times}{contactStatus?.by ? `${contactStatus.by} · ` : ""}{timeAgo(contactStatus!.last.created_at)}
          </span>
        ) : (
          templates.length > 0 && (
            <WhatsAppButton member={member} templates={templates} vars={vars} redirect_to="/dashboard/reminders" />
          )
        )}
        {snooze}
      </div>
    </div>
  );
}

function ordinalSuffix(day: number): string {
  if (day >= 11 && day <= 13) return "th";
  switch (day % 10) {
    case 1: return "st";
    case 2: return "nd";
    case 3: return "rd";
    default: return "th";
  }
}

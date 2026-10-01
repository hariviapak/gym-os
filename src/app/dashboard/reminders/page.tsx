import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate, daysUntil, todayIST, addDaysIST, timeAgo } from "@/lib/utils";
import Link from "next/link";
import { WhatsAppButton } from "@/components/members/whatsapp-button";
import { markGiftKitDelivered } from "@/lib/actions/gift-kit";
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
  const currentMonth = new Date().getMonth();
  const birthdayList = (birthdayMembers.data ?? [])
    .filter((m: any) => new Date(m.date_of_birth).getMonth() === currentMonth)
    .sort((a: any, b: any) => new Date(a.date_of_birth).getDate() - new Date(b.date_of_birth).getDate());

  const expired = expiringList.filter((m: any) => daysUntil(m.end_date) < 0);
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
      .select("member_id, created_at, title")
      .eq("gym_id", gymId)
      .eq("event_type", "contact")
      .in("member_id", allMemberIds)
      .order("created_at", { ascending: false });
    for (const ev of contactEvents ?? []) {
      if (!contactMap[ev.member_id]) {
        contactMap[ev.member_id] = ev;
      }
    }
  }
  const nowMs = new Date().getTime();

  function contactStatus(memberId: string) {
    const last = contactMap[memberId];
    if (!last) return null;
    return { last, isRecent: (nowMs - new Date(last.created_at).getTime()) / (1000 * 60 * 60) < 24 };
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
                hideButtonAfterContact
              />
            );
          })}
        </Section>
      )}

      {/* Expired */}
      {expired.length > 0 && (
        <Section title="Expired Memberships" count={expired.length} dot="bg-red-400" anchor="expired">
          {expired.map((m: any) => {
            const cs = contactStatus(m.member_id);
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
                hideButtonAfterContact
              />
            );
          })}
        </Section>
      )}

      {/* Expiring This Week */}
      {thisWeek.length > 0 && (
        <Section title="Expiring This Week" count={thisWeek.length} dot="bg-amber-400" anchor="expiring-week">
          {thisWeek.map((m: any) => {
            const cs = contactStatus(m.member_id);
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
                hideButtonAfterContact
              />
            );
          })}
        </Section>
      )}

      {/* Expiring This Month */}
      {thisMonth.length > 0 && (
        <Section title="Expiring This Month" count={thisMonth.length} dot="bg-zinc-300" anchor="expiring-month">
          {thisMonth.map((m: any) => {
            const cs = contactStatus(m.member_id);
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
                hideButtonAfterContact
              />
            );
          })}
        </Section>
      )}

      {/* Pending Dues */}
      {duesList.length > 0 && (
        <Section title="Pending Dues" count={duesList.length} dot="bg-amber-400" anchor="dues">
          {duesList.map((d: any) => {
            const balance = Number(d.total_amount) - Number(d.amount_paid);
            const cs = contactStatus(d.member_id);
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
                hideButtonAfterContact
              />
            );
          })}
        </Section>
      )}

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
                hideButtonAfterContact
              />
            );
          })}
        </Section>
      )}

      {/* Gift Kits Pending */}
      {giftKitList.length > 0 && (
        <Section title="Gift Kits Pending" count={giftKitList.length} dot="bg-blue-400" anchor="gift-kits">
          {giftKitList.map((g: any) => {
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
                </div>
              </div>
            );
          })}
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
  hideButtonAfterContact,
}: {
  name: string;
  phone: string | null;
  href: string;
  info?: string;
  member: { id: string; first_name: string; last_name: string | null; phone: string };
  templates: any[];
  vars: Record<string, string | null | undefined>;
  contactStatus?: { last: any; isRecent: boolean } | null;
  hideButtonAfterContact?: boolean;
}) {
  const contacted = !!contactStatus;
  const showButton = !contacted || (contacted && !hideButtonAfterContact && !contactStatus?.isRecent);

  return (
    <div className="flex items-center justify-between px-5 py-3">
      <div className="min-w-0 flex-1">
        <Link href={href} className="text-sm font-medium text-zinc-700 hover:text-zinc-900">
          {name}
        </Link>
        {phone && <span className="ml-2 text-xs text-zinc-400">{phone}</span>}
        {info && <span className="ml-2 text-xs text-zinc-400">· {info}</span>}
      </div>
      <div className="flex items-center gap-2">
        {contacted ? (
          <span className="text-xs font-medium text-green-600">✓ Sent {timeAgo(contactStatus!.last.created_at)}</span>
        ) : (
          templates.length > 0 && (
            <WhatsAppButton member={member} templates={templates} vars={vars} redirect_to="/dashboard/reminders" />
          )
        )}
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

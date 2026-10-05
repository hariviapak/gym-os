export function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function nowISTISO(): string {
  return new Date().toLocaleString("sv-SE", { timeZone: "Asia/Kolkata" }).replace(" ", "T") + "+05:30";
}

export function addDaysIST(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function dateToIST(date: Date): string {
  return date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function monthStartIST(): string {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

// All displayed dates/times are anchored to IST and calendar dates are
// formatted as written — output is identical on the server (UTC), on Indian
// clients, and on clients in any other timezone. Without this, SSR text and
// client hydration text differ (React #418) and Vercel's UTC functions show
// times 5.5 hours behind IST.
const CAL_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function formatDate(date: string | Date | null): string {
  if (!date) return "—";
  const d = typeof date === "string" && CAL_DATE.test(date)
    ? new Date(`${date}T00:00:00+05:30`)
    : typeof date === "string"
      ? new Date(date)
      : date;
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Asia/Kolkata",
  });
}

export function formatDateTime(date: string | Date | null): string {
  if (!date) return "—";
  const d = typeof date === "string" && CAL_DATE.test(date)
    ? new Date(`${date}T00:00:00+05:30`)
    : typeof date === "string"
      ? new Date(date)
      : date;
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

export function formatCurrency(amount: number, symbol = "₹"): string {
  return `${symbol}${amount.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// Whole rupees without decimal noise (dashboard summaries); keeps decimals
// only when the amount genuinely has a fraction.
export function formatCurrencyCompact(amount: number, symbol = "₹"): string {
  const whole = Number.isInteger(amount);
  return `${symbol}${amount.toLocaleString("en-IN", {
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: whole ? 0 : 2,
  })}`;
}

export function daysBetween(start: string | Date, end: string | Date): number {
  const s = typeof start === "string" ? new Date(start) : start;
  const e = typeof end === "string" ? new Date(end) : end;
  const diff = e.getTime() - s.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export function daysUntil(date: string | Date): number {
  // IST-anchored calendar-day difference — identical on UTC servers and IST
  // clients, and never returns -0 for plans that ended yesterday.
  const targetStr = typeof date === "string"
    ? date.slice(0, 10)
    : date.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const target = new Date(`${targetStr}T00:00:00+05:30`).getTime();
  const now = new Date(`${todayIST()}T00:00:00+05:30`).getTime();
  return Math.round((target - now) / 86400000);
}

export function fullName(member: {
  first_name: string;
  last_name: string | null;
}): string {
  return [member.first_name, member.last_name].filter(Boolean).join(" ");
}

export function initials(member: {
  first_name: string;
  last_name: string | null;
}): string {
  const f = member.first_name?.[0] ?? "";
  const l = member.last_name?.[0] ?? "";
  return (f + l).toUpperCase() || "?";
}

export function maskPhone(phone: string): string {
  if (phone.length < 4) return phone;
  return phone.slice(0, 2) + "•••••" + phone.slice(-3);
}

export function statusColor(status: string): string {
  const colors: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    expired: "bg-red-100 text-red-700",
    frozen: "bg-blue-100 text-blue-700",
    upgraded: "bg-purple-100 text-purple-700",
    cancelled: "bg-zinc-100 text-zinc-600",
    deactivated: "bg-orange-100 text-orange-700",
    blacklisted: "bg-red-100 text-red-700",
    pending: "bg-yellow-100 text-yellow-700",
    paid: "bg-green-100 text-green-700",
    partial: "bg-yellow-100 text-yellow-700",
    approved: "bg-green-100 text-green-700",
    rejected: "bg-red-100 text-red-700",
    assigned: "bg-blue-100 text-blue-700",
    delivered: "bg-green-100 text-green-700",
    "not_applicable": "bg-zinc-100 text-zinc-500",
  };
  return colors[status] ?? "bg-zinc-100 text-zinc-600";
}

export function roleLabel(role: string): string {
  const labels: Record<string, string> = {
    owner: "Owner",
    admin: "Admin",
    manager: "Manager",
    staff: "Staff",
    trainer: "Trainer",
  };
  return labels[role] ?? role;
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) return "91" + digits;
  return digits;
}

export function buildWhatsAppUrl(phone: string, message: string): string {
  const normalized = normalizePhone(phone);
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

export function resolveTemplateVars(
  content: string,
  vars: Record<string, string | null | undefined>
): string {
  let resolved = content;
  for (const [key, value] of Object.entries(vars)) {
    resolved = resolved.replaceAll(`{${key}}`, value ?? "");
  }
  return resolved;
}

export function timeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHr < 24) return `${diffHr}h ago`;
  if (diffDay === 1) return "yesterday";
  return `${diffDay}d ago`;
}

// Derived display status for a member (works for server + client components).
// Takes precedence over raw member.status: an "active" member with only
// expired memberships should show as Expired, not Active.
export function deriveMemberStatus(member: {
  status: string;
  memberships?: Array<{ status: string; start_date?: string; end_date: string }> | null;
}): { label: string; cls: string; activeCount: number; minDays: number | null } {
  if (member.status === "blacklisted") {
    return { label: "Blacklisted", cls: "bg-red-100 text-red-700", activeCount: 0, minDays: null };
  }
  if (member.status === "deactivated") {
    return { label: "Deactivated", cls: "bg-orange-100 text-orange-700", activeCount: 0, minDays: null };
  }
  if (member.status !== "active") {
    return {
      label: member.status.charAt(0).toUpperCase() + member.status.slice(1),
      cls: statusColor(member.status),
      activeCount: 0,
      minDays: null,
    };
  }

  const today = todayIST();
  const all = member.memberships ?? [];
  const active = all.filter(
    (ms) => ms.status === "active" && (ms.start_date === undefined || ms.start_date <= today) && ms.end_date >= today
  );
  if (active.length > 0) {
    const minDays = Math.min(...active.map((ms) => daysUntil(ms.end_date)));
    if (minDays <= 7) {
      return { label: minDays <= 0 ? "Expiring today" : `Expiring (${minDays}d)`, cls: "bg-yellow-100 text-yellow-700", activeCount: active.length, minDays };
    }
    return { label: "Active", cls: "bg-green-100 text-green-700", activeCount: active.length, minDays };
  }
  const hasExpired = all.some((ms) => ms.end_date < today);
  if (hasExpired) {
    return { label: "Expired", cls: "bg-red-100 text-red-700", activeCount: 0, minDays: null };
  }
  return { label: "No active plan", cls: "bg-zinc-100 text-zinc-500", activeCount: 0, minDays: null };
}

// Short label for a package's service type
export function serviceLabel(serviceType: string | null | undefined): string {
  if (serviceType === "swimming") return "Swim";
  if (serviceType === "both") return "Gym+Swim";
  return "Gym";
}

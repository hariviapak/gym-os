"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname } from "next/navigation";
import type { StaffRole } from "@/lib/types/database";
import { Icon } from "@/components/ui/icons";

type NavItem = { label: string; href: string; icon: string; roles?: StaffRole[] };
type MoreItem = { label: string; href: string; roles?: StaffRole[] };

const ITEMS: NavItem[] = [
  { label: "Home", href: "/dashboard", icon: "grid" },
  { label: "Members", href: "/dashboard/members", icon: "users" },
  { label: "Quick Pass", href: "/dashboard/quick-pass", icon: "zap" },
  { label: "Lockers", href: "/dashboard/locker-keys", icon: "key" },
];

// Less frequent areas live behind a More button (bottom sheet), keeping the
// bottom navigation uncluttered.
const MORE: MoreItem[] = [
  { label: "Payments", href: "/dashboard/payments", roles: ["owner", "admin", "manager"] as StaffRole[] },
  { label: "Reminders", href: "/dashboard/reminders" },
  { label: "Packages", href: "/dashboard/packages" },
  { label: "Tasks", href: "/dashboard/tasks" },
  { label: "Expenses", href: "/dashboard/expenses", roles: ["owner", "admin", "manager"] as StaffRole[] },
  { label: "Reports", href: "/dashboard/reports", roles: ["owner", "admin", "manager"] as StaffRole[] },
  { label: "Import", href: "/dashboard/import" },
  { label: "Users", href: "/dashboard/users", roles: ["owner", "admin"] as StaffRole[] },
  { label: "Settings", href: "/dashboard/settings", roles: ["owner", "admin"] as StaffRole[] },
  { label: "Terms & Conditions", href: "/dashboard/terms" },
  { label: "Audit Log", href: "/dashboard/audit", roles: ["owner", "admin"] as StaffRole[] },
];

export function BottomNav({ role, duesCount = 0 }: { role: StaffRole; duesCount?: number }) {
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);
  const items = ITEMS.filter((item) => !item.roles || item.roles.includes(role));
  const moreItems = MORE.filter((item) => !item.roles || item.roles.includes(role));
  const moreActive = moreItems.some((m) => pathname === m.href);

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-30 flex border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
      {items.map((item) => {
        const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(item.href));
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex flex-1 flex-col items-center gap-1 py-2.5 transition ${
              active ? "text-zinc-900" : "text-zinc-400"
            }`}
          >
            <div className={`relative ${active ? "scale-110" : ""} transition`}>
              <Icon name={item.icon} className="h-6 w-6" />
            </div>
            <span className="text-[11px] font-medium">{item.label}</span>
          </Link>
        );
      })}
      <button
        type="button"
        onClick={() => setMoreOpen(true)}
        className={`flex flex-1 flex-col items-center gap-1 py-2.5 transition ${moreActive ? "text-zinc-900" : "text-zinc-400"}`}
      >
        <div className="relative">
          <Icon name="grid" className="h-6 w-6" />
          {duesCount > 0 && (
            <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-zinc-900 px-1 text-[9px] font-bold text-white">
              {duesCount > 99 ? "99+" : duesCount}
            </span>
          )}
        </div>
        <span className="text-[11px] font-medium">More</span>
      </button>

      {/* More drawer — bottom sheet */}
      {moreOpen && (
        <>
          <button type="button" aria-label="Close menu" className="fixed inset-0 z-40 cursor-default bg-black/50" onClick={() => setMoreOpen(false)} />
          <div className="fixed bottom-0 left-0 right-0 z-50 max-h-[80vh] overflow-y-auto rounded-t-2xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl">
            <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-zinc-200" />
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-900">More</h2>
              <button type="button" onClick={() => setMoreOpen(false)} className="rounded-lg px-2 py-1 text-sm text-zinc-400" aria-label="Close">
                ✕
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {moreItems.map((m) => (
                <Link
                  key={m.href}
                  href={m.href}
                  onClick={() => setMoreOpen(false)}
                  className="rounded-lg px-3 py-3 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
                >
                  {m.label}
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </nav>
  );
}

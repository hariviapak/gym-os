"use client";

import { useState } from "react";
import Link from "next/link";
import { NAV_ITEMS } from "@/lib/constants";
import { roleLabel } from "@/lib/utils";
import type { StaffRole } from "@/lib/types/database";
import { logout } from "@/lib/auth/actions";
import { GymLogo } from "@/components/layout/gym-logo";
import { Icon } from "@/components/ui/icons";

// Sticky app header. On mobile the hamburger (left) and the avatar (right)
// both open the same account drawer; on desktop the persistent sidebar shows
// the account + sign out, so the avatar stays display-only.
export function Header({
  userName,
  userRole,
  gymName,
  gymLogoUrl,
}: {
  userName: string;
  userRole: StaffRole;
  gymName: string;
  gymLogoUrl?: string | null;
}) {
  const [open, setOpen] = useState(false);
  const initial = userName.charAt(0).toUpperCase();
  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(userRole)
  );

  return (
    <>
      <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-zinc-200 bg-white px-4 lg:px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg p-2 text-zinc-600 hover:bg-zinc-100 lg:hidden"
            aria-label="Open menu"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-base font-bold text-zinc-900 lg:hidden">{gymName}</span>
        </div>

        <div className="hidden lg:block" />

        <div className="flex items-center gap-3">
          {/* mobile + tablet: whole account block opens the drawer */}
          <button
            onClick={() => setOpen(true)}
            className="flex items-center gap-3 rounded-lg p-1 lg:hidden"
            aria-label="Account menu"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white">
              {initial}
            </span>
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-medium text-zinc-900">{userName}</span>
              <span className="block text-xs text-zinc-500">{roleLabel(userRole)}</span>
            </span>
          </button>
          {/* desktop: display only (sidebar owns the account) */}
          <div className="hidden items-center gap-3 lg:flex">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white">
              {initial}
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-900">{userName}</p>
              <p className="text-xs text-zinc-500">{roleLabel(userRole)}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Overlay */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Account drawer (hamburger + avatar both open this) */}
      {open && (
        <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-zinc-200 bg-white lg:hidden">
          <div className="flex h-16 items-center justify-between gap-2 border-b border-zinc-200 px-4">
            <div className="flex items-center gap-2">
              <GymLogo gymName={gymName} logoUrl={gymLogoUrl} size="sm" />
              <span className="text-lg font-bold text-zinc-900">{gymName}</span>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100"
              aria-label="Close menu"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
            {["main", "manage", "admin"].map((section) => {
              const items = visibleItems.filter((item) => (item.section ?? "main") === section);
              if (items.length === 0) return null;
              return (
                <div key={section}>
                  <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wider text-zinc-400">
                    {section === "main" ? "Menu" : section === "manage" ? "Manage" : "Admin"}
                  </p>
                  <div className="space-y-1">
                    {items.map((item) => (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
                      >
                        <Icon name={item.icon} className="h-5 w-5" />
                        {item.label}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </nav>

          {/* bottom keeps clear of the iOS home-indicator safe area */}
          <div className="border-t border-zinc-200 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
            <div className="mb-2 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white">
                {initial}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900">{userName}</p>
                <p className="text-xs text-zinc-500">{roleLabel(userRole)}</p>
              </div>
            </div>
            <form action={logout}>
              <button
                type="submit"
                className="w-full rounded-lg border border-zinc-200 px-3 py-2 text-center text-sm font-medium text-zinc-600 transition hover:bg-zinc-100 hover:text-zinc-900"
              >
                Sign out
              </button>
            </form>
          </div>
        </aside>
      )}
    </>
  );
}

import Link from "next/link";
import { NAV_ITEMS } from "@/lib/constants";
import { roleLabel } from "@/lib/utils";
import type { StaffRole } from "@/lib/types/database";
import { logout } from "@/lib/auth/actions";
import { GymLogo } from "@/components/layout/gym-logo";
import { Icon } from "@/components/ui/icons";

export function Sidebar({
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
  const visibleItems = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(userRole)
  );

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-zinc-200 bg-white lg:flex">
      <div className="flex h-16 items-center gap-2 border-b border-zinc-200 px-4">
        <GymLogo gymName={gymName} logoUrl={gymLogoUrl} size="sm" />
        <span className="truncate text-lg font-bold text-zinc-900">{gymName}</span>
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

      <div className="border-t border-zinc-200 p-4">
        <div className="mb-2 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white">
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-zinc-900">{userName}</p>
            <p className="text-xs text-zinc-500">{roleLabel(userRole)}</p>
          </div>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="w-full rounded-lg px-3 py-1.5 text-left text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900"
          >
            Sign out
          </button>
        </form>
      </div>
    </aside>
  );
}

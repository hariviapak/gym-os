import { roleLabel } from "@/lib/utils";
import type { StaffRole } from "@/lib/types/database";
import { MobileSidebar } from "@/components/layout/mobile-sidebar";

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
  return (
    <header className="sticky top-0 z-10 flex h-16 items-center justify-between border-b border-zinc-200 bg-white px-4 lg:px-6">
      <div className="flex items-center gap-3">
        <MobileSidebar userName={userName} userRole={userRole} gymName={gymName} gymLogoUrl={gymLogoUrl} />
        <span className="text-base font-bold text-zinc-900 lg:hidden">{gymName}</span>
      </div>

      <div className="hidden lg:block" />

      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white">
          {userName.charAt(0).toUpperCase()}
        </div>
        <div className="hidden sm:block">
          <p className="text-sm font-medium text-zinc-900">{userName}</p>
          <p className="text-xs text-zinc-500">{roleLabel(userRole)}</p>
        </div>
      </div>
    </header>
  );
}

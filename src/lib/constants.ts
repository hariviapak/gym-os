import type { StaffRole } from "@/lib/types/database";

export interface NavItem {
  label: string;
  href: string;
  icon: string;
  roles?: StaffRole[];
  section?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/dashboard", icon: "grid", section: "main" },
  { label: "Quick Pass", href: "/dashboard/quick-pass", icon: "zap", section: "main" },
  { label: "Reminders", href: "/dashboard/reminders", icon: "bell", section: "main" },
  { label: "Members", href: "/dashboard/members", icon: "users", section: "main" },
  { label: "Payments", href: "/dashboard/payments", icon: "rupee", roles: ["owner", "admin", "manager"], section: "main" },
  { label: "Packages", href: "/dashboard/packages", icon: "package", section: "manage" },
  { label: "Tasks", href: "/dashboard/tasks", icon: "check-square", section: "manage" },
  { label: "Locker Keys", href: "/dashboard/locker-keys", icon: "key", section: "manage" },
  { label: "Expenses", href: "/dashboard/expenses", icon: "receipt", roles: ["owner", "admin", "manager"], section: "manage" },
  { label: "Import", href: "/dashboard/import", icon: "upload", roles: ["owner", "admin", "manager"], section: "manage" },
  { label: "Reports", href: "/dashboard/reports", icon: "chart", roles: ["owner", "admin", "manager"], section: "admin" },
  { label: "Users", href: "/dashboard/users", icon: "user-cog", roles: ["owner", "admin"], section: "admin" },
  { label: "Settings", href: "/dashboard/settings", icon: "settings", roles: ["owner", "admin"], section: "admin" },
  { label: "Terms & Conditions", href: "/dashboard/terms", icon: "file", roles: ["owner", "admin", "manager"], section: "admin" },
  { label: "Audit Log", href: "/dashboard/audit", icon: "shield", roles: ["owner", "admin", "manager"], section: "admin" },
];

export const ROLE_PERMISSIONS: Record<StaffRole, string[]> = {
  owner: ["*"],
  admin: ["*"],
  manager: [
    "members:*",
    "packages:*",
    "memberships:*",
    "payments:*",
    "expenses:*",
    "import:*",
    "tasks:*",
    "templates:*",
    "terms:read",
    "audit:read",
    "settings:read",
    "reports:read",
  ],
  staff: [
    "members:*",
    "packages:read",
    "memberships:*",
    "payments:create",
    "tasks:*",
    "templates:read",
    "terms:read",
  ],
  trainer: [
    "members:read",
    "memberships:read",
    "tasks:read",
  ],
};

export function canAccess(role: StaffRole, permission: string): boolean {
  const perms = ROLE_PERMISSIONS[role];
  if (perms.includes("*")) return true;
  if (perms.includes(permission)) return true;
  const [resource] = permission.split(":");
  return perms.includes(`${resource}:*`);
}

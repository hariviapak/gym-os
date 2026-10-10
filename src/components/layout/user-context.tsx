"use client";

import { createContext, useContext } from "react";
import type { StaffRole } from "@/lib/types/database";

// Role context for client components that render role-aware UI (e.g. the
// start-date backdate cap). Server actions re-check the role anyway — this
// only shapes the inputs and hints.
const UserContext = createContext<{ role: StaffRole | null }>({ role: null });

export function UserProvider({
  role,
  children,
}: {
  role: StaffRole;
  children: React.ReactNode;
}) {
  return <UserContext.Provider value={{ role }}>{children}</UserContext.Provider>;
}

export function useUser() {
  return useContext(UserContext);
}

export function canBackdateFreely(role: StaffRole | null): boolean {
  return role === "owner" || role === "admin";
}

"use client";

import { useState } from "react";
import { RenewalModal, CurrentPlan } from "@/components/members/renewal-modal";

// Inline [Renew] button used by dashboard lists
export function RenewButton({
  memberId,
  plans,
  packages,
  gstMode,
  className = "whitespace-nowrap rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-800",
}: {
  memberId: string;
  plans: CurrentPlan[];
  packages: any[];
  gstMode: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        Renew
      </button>
      {open && (
        <RenewalModal
          memberId={memberId}
          packages={packages}
          gstMode={gstMode}
          currentPlans={plans}
          forceOpen
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

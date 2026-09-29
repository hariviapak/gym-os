"use client";

import { useState } from "react";
import { RenewalModal } from "@/components/members/renewal-modal";
import { ExtendModal } from "@/components/members/extend-modal";
import { CancelMembershipModal } from "@/components/members/cancel-membership-modal";
import { ReactivateButton } from "@/components/members/reactivate-button";
import { PopoverMenu } from "@/components/ui/popover-menu";

interface Plan {
  id: string;
  serviceType: string;
  name: string;
  endDate: string;
  daysLeft: number;
  amountPaid: number;
  status: string;
  paymentStatus: string;
  upcoming?: boolean;
}

// Per-membership contextual actions — only what makes sense for the state
export function MembershipRowActions({
  memberId,
  plan,
  packages,
  gstMode,
  allPlans,
}: {
  memberId: string;
  plan: Plan;
  packages: any[];
  gstMode: string;
  allPlans: Plan[];
}) {
  const [activeModal, setActiveModal] = useState<"renew" | "extend" | "cancel" | null>(null);

  const item = "block w-full px-3 py-1.5 text-left text-xs text-zinc-700 transition hover:bg-zinc-50";
  const currentPlans = allPlans.map((p) => ({
    id: p.id,
    serviceType: p.serviceType,
    name: p.name,
    endDate: p.endDate,
    daysLeft: p.daysLeft,
  }));

  return (
    <div className="inline-block text-left">
      <PopoverMenu
        panelClassName="w-48"
        trigger={({ toggle }) => (
          <button
            type="button"
            onClick={toggle}
            className="whitespace-nowrap rounded-lg border border-zinc-300 px-3 py-2 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50"
          >
            ⋯
          </button>
        )}
      >
        <div className="py-1">
            {!plan.upcoming && (
              <button type="button" onClick={() => setActiveModal("renew")} className={item}>
                Renew / Change Package
              </button>
            )}
            {plan.status === "active" && !plan.upcoming && (
              <button type="button" onClick={() => setActiveModal("extend")} className={item}>
                Extend
              </button>
            )}
            {plan.status === "active" && (
              <button type="button" onClick={() => setActiveModal("cancel")} className={item}>
                Cancel…
              </button>
            )}
            {plan.status === "cancelled" && <ReactivateButton membershipId={plan.id} onDone={() => {}} />}
        </div>
      </PopoverMenu>

      {activeModal === "renew" && (
        <RenewalModal
          memberId={memberId}
          packages={packages}
          gstMode={gstMode}
          currentPlans={currentPlans}
          forceOpen
          onClose={() => setActiveModal(null)}
        />
      )}
      {activeModal === "extend" && (
        <ExtendModal
          memberId={memberId}
          currentPlans={currentPlans.map((p) => ({ id: p.id, name: p.name, serviceType: p.serviceType, endDate: p.endDate }))}
          forceOpen
          onClose={() => setActiveModal(null)}
        />
      )}
      {activeModal === "cancel" && (
        <CancelMembershipModal
          membershipId={plan.id}
          packageName={plan.name}
          amountPaid={plan.amountPaid}
          forceOpen
          onClose={() => setActiveModal(null)}
        />
      )}
    </div>
  );
}

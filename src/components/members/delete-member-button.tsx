"use client";

import { deleteMember } from "@/lib/actions/members";

export function DeleteMemberButton({
  memberId,
  memberName,
  membershipCount = 0,
  paymentCount = 0,
}: {
  memberId: string;
  memberName: string;
  membershipCount?: number;
  paymentCount?: number;
}) {
  const hasHistory = membershipCount > 0 || paymentCount > 0;

  return (
    <form
      action={deleteMember.bind(null, memberId)}
      onSubmit={(e) => {
        const ok = window.confirm(
          `Delete ${memberName} permanently? They will disappear from the member list. This cannot be undone.`
        );
        if (!ok) {
          e.preventDefault();
          return;
        }
        if (hasHistory) {
          const really = window.confirm(
            `${memberName} has ${membershipCount} membership(s) and ${paymentCount} payment(s).\n\nDeleting them will ALSO permanently delete these memberships, payments and their receipts.\n\nIf you only want them off the active list, cancel now and use "Deactivate" instead.\n\nDelete everything?`
          );
          if (!really) e.preventDefault();
        }
      }}
    >
      <button
        type="submit"
        className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
      >
        Delete member
      </button>
    </form>
  );
}

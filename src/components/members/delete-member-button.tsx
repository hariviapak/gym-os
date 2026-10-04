"use client";

import { useState } from "react";
import { deleteMember } from "@/lib/actions/members";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

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
  const [open, setOpen] = useState(false);
  const hasHistory = membershipCount > 0 || paymentCount > 0;

  return (
    <>
      <button
        type="button"
        data-popover-keep
        onClick={() => setOpen(true)}
        className="rounded-lg px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50"
      >
        Delete member
      </button>
      <ConfirmDialog
        open={open}
        title={`Delete ${memberName} permanently?`}
        body={
          hasHistory ? (
            <div className="space-y-2">
              <p>
                They have {membershipCount} membership(s) and {paymentCount} payment(s). Deleting them will ALSO
                permanently delete these memberships, payments, and their receipts.
              </p>
              <p className="text-zinc-500">
                If you only want them off the active list, cancel now and use &quot;Deactivate&quot; instead.
              </p>
            </div>
          ) : (
            "They will disappear from the member list. This cannot be undone."
          )
        }
        confirmLabel="Delete everything"
        danger
        onConfirm={() => {
          setOpen(false);
          // direct server-action call (no form needed — native confirms are
          // suppressed in iOS PWAs, so the confirm lives in the dialog)
          void deleteMember(memberId);
        }}
        onCancel={() => setOpen(false)}
      />
    </>
  );
}

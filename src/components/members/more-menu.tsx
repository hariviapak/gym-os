"use client";

import Link from "next/link";
import { updateMemberStatus } from "@/lib/actions/members";
import { DeleteMemberButton } from "@/components/members/delete-member-button";
import { PopoverMenu } from "@/components/ui/popover-menu";

// Header "More ▾" — less-common actions, away from the primary row
export function MoreMenu({
  memberId,
  memberStatus,
  memberName,
  membershipCount = 0,
  paymentCount = 0,
}: {
  memberId: string;
  memberStatus: string;
  memberName: string;
  membershipCount?: number;
  paymentCount?: number;
}) {
  const item = "block w-full px-3 py-1.5 text-left text-xs text-zinc-700 transition hover:bg-zinc-50";

  return (
    <div className="inline-block text-left">
      <PopoverMenu
        key={memberStatus}
        panelClassName="w-52"
        trigger={({ toggle }) => (
          <button
            type="button"
            onClick={toggle}
            className="whitespace-nowrap rounded-lg border border-zinc-300 px-3.5 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
          >
            More ▾
          </button>
        )}
      >
        <div className="py-1">
            <Link href={`/dashboard/members/${memberId}/edit`} className={`${item} font-semibold`}>
              Edit member
            </Link>
            <Link href={`/dashboard/members/${memberId}/sign-terms`} className={item}>
              Sign terms
            </Link>
            <Link href={`/print/member-profile/${memberId}`} target="_blank" className={item}>
              Print / PDF profile
            </Link>
            <div className="my-1 border-t border-zinc-100" />
            {memberStatus === "active" ? (
              <>
                <form action={updateMemberStatus.bind(null, memberId, "deactivated", null)}>
                  <button type="submit" className={item}>
                    Deactivate member
                  </button>
                </form>
                <form action={updateMemberStatus.bind(null, memberId, "blacklisted", "Blacklisted by admin")}>
                  <button type="submit" className={item}>
                    Blacklist member
                  </button>
                </form>
              </>
            ) : (
              <form action={updateMemberStatus.bind(null, memberId, "active", null)}>
                <button type="submit" className={item}>
                  Reactivate member
                </button>
              </form>
            )}
            <div className="my-1 border-t border-zinc-100" />
            <div className="px-3 py-1">
              <DeleteMemberButton
                memberId={memberId}
                memberName={memberName}
                membershipCount={membershipCount}
                paymentCount={paymentCount}
              />
            </div>
        </div>
      </PopoverMenu>
    </div>
  );
}

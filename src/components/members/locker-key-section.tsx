"use client";

import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { SubmitButton } from "@/components/ui/submit-button";
import { returnLockerKey } from "@/lib/actions/locker-keys";

interface IssuedKey {
  id: string;
  keyNumber: string;
  lockerNumber: string | null;
  issuedAt: string | null;
  attention: boolean;
}

// Member profile: the keys this member currently holds (+ recent returns)
export function LockerKeySection({
  memberId,
  keys,
  history,
}: {
  memberId: string;
  keys: IssuedKey[];
  history: Array<{ keyNumber: string | null; issuedAt: string; returnedAt: string | null }>;
}) {
  const recentReturns = history.filter((h) => h.returnedAt).slice(0, 3);

  return (
    <div className="space-y-1">
      {keys.length === 0 && <p className="text-xs text-zinc-400">No keys issued.</p>}
      {keys.map((k) => (
        <div key={k.id} className="flex items-center justify-between gap-2 py-0.5">
          <span className="whitespace-nowrap text-sm">
            <span className="font-semibold text-zinc-900">{k.keyNumber}</span>
            {k.lockerNumber && <span className="ml-1 text-xs text-zinc-400">· locker {k.lockerNumber}</span>}
            {k.attention && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">attention</span>}
          </span>
          <form action={async (fd: FormData) => { await returnLockerKey(k.id, fd); }}>
            <input type="hidden" name="redirect_to" value={`/dashboard/members/${memberId}`} />
            <SubmitButton className="rounded px-2 py-0.5 text-xs text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-900" label="Returning…">
              Return
            </SubmitButton>
          </form>
        </div>
      ))}
      {recentReturns.length > 0 && (
        <p className="text-[10px] text-zinc-400">
          Returned: {recentReturns.map((h) => `${h.keyNumber ?? "key"} (${formatDate(h.returnedAt!)})`).join(", ")}
        </p>
      )}
      <Link href="/dashboard/locker-keys" className="mt-1 inline-block text-[10px] font-medium text-zinc-400 transition hover:text-zinc-700">
        Manage locker keys →
      </Link>
    </div>
  );
}

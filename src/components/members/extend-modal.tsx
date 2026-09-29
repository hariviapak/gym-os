"use client";

import { useState, useRef } from "react";
import { extendMembership } from "@/lib/actions/memberships";
import { SubmitButton } from "@/components/ui/submit-button";
import { formatDate, daysUntil } from "@/lib/utils";

export function ExtendModal({
  memberId,
  currentPlans = [],
  forceOpen,
  onClose,
}: {
  memberId: string;
  currentPlans?: Array<{ id: string; name: string; serviceType?: string; endDate: string }>;
  forceOpen?: boolean;
  onClose?: () => void;
}) {
  const [openState, setOpenState] = useState(false);
  const isControlled = forceOpen !== undefined;
  const open = isControlled ? forceOpen : openState;
  const setOpen = (v: boolean) => {
    if (!v && isControlled) onClose?.();
    else setOpenState(v);
  };
  const dialogRef = useRef<HTMLDivElement>(null);

  const boundAction = extendMembership.bind(null, memberId);

  return (
    <>
      {!isControlled && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="whitespace-nowrap rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
        >
          Extend
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            ref={dialogRef}
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-zinc-900">Extend Membership</h2>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                aria-label="Close"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form action={boundAction} className="space-y-4">
              {currentPlans.length > 1 ? (
                <div>
                  <label className="block text-xs font-medium text-zinc-600">Which membership? *</label>
                  <div className="mt-1 space-y-1.5">
                    {currentPlans.map((p, i) => (
                      <label
                        key={p.id}
                        className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-zinc-200 px-3 py-2 transition hover:bg-zinc-50"
                      >
                        <input
                          type="radio"
                          name="membership_id"
                          value={p.id}
                          defaultChecked={i === 0}
                          className="h-4 w-4 accent-zinc-900"
                          required
                        />
                        <span className="flex-1 text-sm text-zinc-800">{p.name}</span>
                        <span className="text-xs text-zinc-400">
                          ends {formatDate(p.endDate)} ({daysUntil(p.endDate)}d)
                        </span>
                      </label>
                    ))}
                  </div>
                </div>
              ) : currentPlans.length === 1 ? (
                <input type="hidden" name="membership_id" value={currentPlans[0].id} />
              ) : null}

              <div>
                <label className="block text-xs font-medium text-zinc-600">Days *</label>
                <input
                  name="days"
                  type="number"
                  required
                  min={1}
                  max={365}
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  placeholder="30"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-600">Reason *</label>
                <input
                  name="reason"
                  type="text"
                  required
                  className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  placeholder="Lockdown, medical leave, etc."
                />
              </div>

              <div className="flex justify-end gap-2 border-t border-zinc-200 pt-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <SubmitButton
                  className="rounded-lg bg-zinc-900 px-6 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
                  label="Extending..."
                >
                  Extend Membership
                </SubmitButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

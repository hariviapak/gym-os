"use client";

import { useState } from "react";
import { createPackage } from "@/lib/actions/packages";
import { SubmitButton } from "@/components/ui/submit-button";

export function AddPackageModal({ gymId, gstInclusive }: { gymId: string; gstInclusive: boolean }) {
  const [open, setOpen] = useState(false);

  const inputCls =
    "mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900";
  const labelCls = "block text-xs font-medium text-zinc-600";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
      >
        <span className="text-base leading-none">+</span> Add Package
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:items-center">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-zinc-900">Add Package</h2>
                <p className="mt-0.5 text-xs text-zinc-500">Memberships, day passes, trials, family packages</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded-lg px-2 py-1 text-sm text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <form action={createPackage} className="space-y-4">
              <input type="hidden" name="gym_id" value={gymId} />

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Name *</label>
                  <input name="name" required placeholder="Monthly Membership" className={inputCls} autoFocus />
                </div>

                <div>
                  <label className={labelCls}>Type</label>
                  <select name="type" className={inputCls}>
                    <option value="membership">Membership</option>
                    <option value="day_pass">Day Pass</option>
                    <option value="trial">Trial</option>
                    <option value="pt">Personal Training</option>
                  </select>
                </div>

                <div>
                  <label className={labelCls}>Service</label>
                  <select name="service_type" className={inputCls}>
                    <option value="gym">Gym</option>
                    <option value="swimming">Swimming</option>
                    <option value="both">Gym + Swimming</option>
                  </select>
                  <p className="mt-1 text-[11px] text-zinc-400">
                    Terms auto-attach by service: Gym → Gym T&amp;C, Swimming → Pool Rules, Both → both.
                  </p>
                </div>

                <div>
                  <label className={labelCls}>Duration (days) *</label>
                  <input name="duration_days" type="number" required min={1} placeholder="30" className={inputCls} />
                </div>

                <div>
                  <label className={labelCls}>Amount (₹) *</label>
                  <input name="amount" type="number" step="0.01" required min={0} placeholder="1500" className={inputCls} />
                </div>

                <div>
                  <label className={labelCls}>GST Rate (%)</label>
                  <input name="gst_rate" type="number" step="0.01" defaultValue={18} className={inputCls} />
                  <p className="mt-1 text-[11px] text-zinc-400">
                    {gstInclusive ? "Included in the amount (final price)" : "Added on top of the amount"}
                  </p>
                </div>

                <div>
                  <label className={labelCls}>Digital Kit URL</label>
                  <input name="digital_kit_url" type="url" placeholder="Leave empty for gym default" className={inputCls} />
                </div>

                <div className="sm:col-span-2">
                  <label className={labelCls}>Description</label>
                  <input name="description" placeholder="Optional" className={inputCls} />
                </div>

                <div className="sm:col-span-2 rounded-lg bg-violet-50/60 px-3 py-2.5 ring-1 ring-violet-100">
                  <label className="flex items-center gap-2 text-xs font-medium text-zinc-700">
                    <input
                      type="checkbox"
                      name="is_group_package"
                      value="yes"
                      className="h-4 w-4 rounded border-zinc-300 accent-zinc-900"
                    />
                    Group / Family package
                  </label>
                  <p className="mt-1 pl-6 text-[11px] text-zinc-400">
                    Amount is the group total (e.g. ₹70,000 for 2 members) — it gets split across members at enrollment.
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-zinc-100 pt-4">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
                >
                  Cancel
                </button>
                <SubmitButton
                  className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
                  label="Adding..."
                >
                  Add Package
                </SubmitButton>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { formatDate } from "@/lib/utils";
import { PopoverMenu } from "@/components/ui/popover-menu";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  issueLockerKey,
  returnLockerKey,
  transferLockerKey,
  setLockerKeyAttention,
  addLockerKeysBulk,
  addLockerKey,
} from "@/lib/actions/locker-keys";

// LOCKER KEYS — mobile-first, receptionist-speed.
// All issue/return/transfer/attention actions run through the server (RLS,
// audit, history) but return a result instead of redirecting: the page then
// patches its local state, so the UI reflects the change instantly with no
// full page reload.

interface KeyRow {
  id: string;
  keyNumber: string;
  lockerNumber: string | null;
  status: string;
  attention: boolean;
  issuedAt: string | null;
  memberId: string | null;
  memberName: string | null;
  memberPhone: string | null;
}

interface MemberOption {
  id: string;
  name: string;
  phone: string;
}

interface HistoryRow {
  id: string;
  keyId: string | null;
  keyNumber: string | null;
  memberName: string;
  issuedAt: string;
  returnedAt: string | null;
  notes: string | null;
}

export function LockersTable({
  keys: serverKeys,
  members,
  history,
  statusFilter,
  search: initialSearch,
}: {
  keys: KeyRow[];
  members: MemberOption[];
  history: HistoryRow[];
  statusFilter: string;
  search: string;
}) {
  // local mirror of the server data: patched instantly after each action and
  // re-synced whenever a fresh server payload arrives (render-phase reset,
  // no cascading effect)
  const [keys, setKeys] = useState(serverKeys);
  const [syncedFrom, setSyncedFrom] = useState(serverKeys);
  if (serverKeys !== syncedFrom) {
    setSyncedFrom(serverKeys);
    setKeys(serverKeys);
  }

  const [issueFor, setIssueFor] = useState<KeyRow | null>(null);
  const [transferFor, setTransferFor] = useState<KeyRow | null>(null);
  const [detailFor, setDetailFor] = useState<KeyRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // INSTANT client-side search + status filter — no round trips while typing
  const [q, setQ] = useState(initialSearch);
  const [status, setStatus] = useState(statusFilter);

  const counts = {
    all: keys.length,
    available: keys.filter((k) => k.status === "available").length,
    issued: keys.filter((k) => k.status === "issued").length,
    flagged: keys.filter((k) => k.attention).length,
  };

  const patchKey = (id: string, partial: Partial<KeyRow>) =>
    setKeys((ks) => ks.map((k) => (k.id === id ? { ...k, ...partial } : k)));

  // call a locker action in local mode; returns an error message or null
  const runAction = async (action: (fd: FormData) => Promise<any>, fd: FormData) => {
    fd.set("__local", "1");
    setActionError(null);
    const res = await action(fd);
    if (res && res.ok === false) {
      setActionError(res.error ?? "Something went wrong");
      return false;
    }
    return true;
  };

  const memberById = (id: string) => members.find((m) => m.id === id);

  const confirmIssue = async (memberId: string) => {
    const fd = new FormData();
    fd.set("member_id", memberId);
    const ok = await runAction(issueLockerKey.bind(null, issueFor!.id), fd);
    if (!ok) return false;
    const m = memberById(memberId);
    patchKey(issueFor!.id, {
      status: "issued",
      memberId,
      memberName: m?.name ?? null,
      memberPhone: m?.phone ?? null,
      issuedAt: new Date().toISOString(),
    });
    setIssueFor(null);
    return true;
  };

  const confirmTransfer = async (memberId: string) => {
    const fd = new FormData();
    fd.set("member_id", memberId);
    const ok = await runAction(transferLockerKey.bind(null, transferFor!.id), fd);
    if (!ok) return false;
    const m = memberById(memberId);
    patchKey(transferFor!.id, {
      memberId,
      memberName: m?.name ?? null,
      memberPhone: m?.phone ?? null,
      issuedAt: new Date().toISOString(),
    });
    setTransferFor(null);
    return true;
  };

  // native confirms are suppressed in iOS PWAs — the return confirm is a
  // real dialog; askReturn opens it, doReturn executes
  const [confirmReturn, setConfirmReturn] = useState<KeyRow | null>(null);
  const askReturn = (k: KeyRow) => setConfirmReturn(k);

  const doReturn = async (k: KeyRow) => {
    setConfirmReturn(null);
    const ok = await runAction(returnLockerKey.bind(null, k.id), new FormData());
    if (!ok) return;
    patchKey(k.id, { status: "available", memberId: null, memberName: null, memberPhone: null, issuedAt: null, attention: false });
  };

  const doAttention = async (k: KeyRow, attention: boolean) => {
    const ok = await runAction(setLockerKeyAttention.bind(null, k.id, attention), new FormData());
    if (!ok) return;
    patchKey(k.id, { attention });
    setDetailFor((d) => (d && d.id === k.id ? { ...d, attention } : d));
  };

  const query = q.trim().toLowerCase();
  const visible = keys.filter((k) => {
    if (status === "available" && k.status !== "available") return false;
    if (status === "issued" && k.status !== "issued") return false;
    if (status === "attention" && !k.attention) return false;
    if (!query) return true;
    const member = (k.memberName ?? "").toLowerCase();
    return (
      k.keyNumber.toLowerCase().includes(query) ||
      (k.lockerNumber ?? "").toLowerCase().includes(query) ||
      member.includes(query) ||
      (k.memberPhone ?? "").replace(/\D/g, "").endsWith(query.replace(/\D/g, "").slice(-10))
    );
  });

  const tabs = [
    { key: "all", label: "All", count: counts.all },
    { key: "available", label: "Available", count: counts.available },
    { key: "issued", label: "Issued", count: counts.issued },
    { key: "attention", label: "Attention", count: counts.flagged },
  ];

  const emptyInventory = keys.length === 0;

  return (
    <div className="space-y-3">
      {/* Search + Add Key — one row, portal panel for add forms */}
      {!emptyInventory && (
        <>
          <div className="flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              type="search"
              inputMode="search"
              placeholder="Search key, locker or member..."
              className="min-w-0 flex-1 rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            />
            <PopoverMenu
              panelClassName="w-72 p-4"
              trigger={({ toggle }) => (
                <button
                  type="button"
                  onClick={toggle}
                  className="shrink-0 whitespace-nowrap rounded-lg border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
                >
                  + Add Key
                </button>
              )}
            >
              <div className="space-y-3">
                <form action={addLockerKey} className="flex gap-2">
                  <input name="key_number" required placeholder="Key no (K-031)" className="w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs focus:border-zinc-900 focus:outline-none" />
                  <input name="locker_number" placeholder="Locker" className="w-20 rounded-lg border border-zinc-300 px-2.5 py-1.5 text-xs focus:border-zinc-900 focus:outline-none" />
                  <button type="submit" className="shrink-0 rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-800">
                    Add
                  </button>
                </form>
                <form action={addLockerKeysBulk} className="space-y-2 border-t border-zinc-100 pt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-zinc-400">Bulk create</p>
                  <div className="flex items-center gap-2">
                    <input name="count" type="number" min={1} max={500} defaultValue={10} className="w-16 rounded-lg border border-zinc-300 px-2 py-1.5 text-xs focus:border-zinc-900 focus:outline-none" title="How many" />
                    <input name="key_prefix" defaultValue="K" className="w-14 rounded-lg border border-zinc-300 px-2 py-1.5 text-xs focus:border-zinc-900 focus:outline-none" title="Key prefix" />
                    <input name="start_number" type="number" min={1} defaultValue={counts.all + 1} className="w-16 rounded-lg border border-zinc-300 px-2 py-1.5 text-xs focus:border-zinc-900 focus:outline-none" title="Start at" />
                    <label className="flex items-center gap-1 text-[10px] text-zinc-500">
                      <input type="checkbox" name="lockers_same" value="yes" defaultChecked className="accent-zinc-900" />
                      lockers = key no
                    </label>
                  </div>
                  <button type="submit" className="w-full rounded-lg bg-zinc-100 px-3 py-2 text-xs font-semibold text-zinc-700 transition hover:bg-zinc-200">
                    Create keys
                  </button>
                </form>
              </div>
            </PopoverMenu>
          </div>

          {/* Status tabs — compact, always visible, with counts */}
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 md:overflow-visible">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setStatus(t.key)}
                className={`whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  status === t.key
                    ? "bg-zinc-900 text-white"
                    : "bg-white text-zinc-600 ring-1 ring-zinc-200/60 hover:bg-zinc-50"
                }`}
              >
                {t.label} {t.count}
              </button>
            ))}
          </div>

          {actionError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-700">{actionError}</p>
          )}
        </>
      )}

      {/* First-run empty state */}
      {emptyInventory ? (
        <div className="rounded-xl bg-white p-8 text-center ring-1 ring-zinc-200/60">
          <h2 className="text-lg font-semibold text-zinc-900">No locker keys configured</h2>
          <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">
            Create your gym&apos;s locker inventory. You can add more, rename, or remove keys anytime — start with a
            bulk set or add them one by one.
          </p>
          <form action={addLockerKeysBulk} className="mx-auto mt-5 flex max-w-md flex-wrap items-center justify-center gap-2">
            <input name="count" type="number" min={1} max={500} defaultValue={30} className="w-20 rounded-lg border border-zinc-300 px-3 py-2.5 text-sm focus:border-zinc-900 focus:outline-none" title="How many keys" />
            <input name="key_prefix" defaultValue="K" className="w-16 rounded-lg border border-zinc-300 px-3 py-2.5 text-sm focus:border-zinc-900 focus:outline-none" title="Key prefix" />
            <input name="start_number" type="number" min={1} defaultValue={1} className="w-16 rounded-lg border border-zinc-300 px-3 py-2.5 text-sm focus:border-zinc-900 focus:outline-none" title="Start at" />
            <label className="flex items-center gap-1 text-xs text-zinc-500">
              <input type="checkbox" name="lockers_same" value="yes" defaultChecked className="accent-zinc-900" />
              lockers = key no
            </label>
            <button type="submit" className="rounded-lg bg-zinc-900 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800">
              Create 30 keys (K-001…K-030)
            </button>
          </form>
        </div>
      ) : (
        <>
          {/* Compact card grid — Key → Locker → Member → Status → Action */}
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visible.map((k) => (
              <div
                key={k.id}
                className={`rounded-lg p-2.5 ring-1 transition ${
                  k.attention ? "bg-amber-50/70 ring-amber-200" : "bg-white ring-zinc-200/60"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => setDetailFor(k)}
                    className="flex min-w-0 items-baseline gap-1.5 truncate text-left"
                  >
                    <span className="truncate text-sm font-bold text-zinc-900">{k.keyNumber}</span>
                    {k.lockerNumber && (
                      <span className="shrink-0 text-[11px] font-medium text-zinc-400">· L{k.lockerNumber}</span>
                    )}
                  </button>
                  <StatusChip k={k} />
                </div>
                <div className="mt-1 min-h-[1rem] truncate text-xs text-zinc-500">
                  {k.memberId ? (
                    <Link href={`/dashboard/members/${k.memberId}`} className="text-zinc-800 hover:underline">
                      {k.memberName} <span className="text-zinc-400">{k.memberPhone}</span>
                    </Link>
                  ) : (
                    <span className="text-zinc-400">{k.attention ? "Returned — needs attention" : "Available for issue"}</span>
                  )}
                </div>
                <div className="mt-1.5">
                  <KeyActions
                    k={k}
                    onIssue={() => setIssueFor(k)}
                    onTransfer={() => setTransferFor(k)}
                    onManage={() => setDetailFor(k)}
                    onReturn={askReturn}
                    onAttention={doAttention}
                  />
                </div>
              </div>
            ))}
          </div>
          {visible.length === 0 && (
            <p className="rounded-lg bg-white px-4 py-8 text-center text-sm text-zinc-400 ring-1 ring-zinc-200/60">
              No keys match this view.
            </p>
          )}
        </>
      )}

      <ConfirmDialog
        open={!!confirmReturn}
        title={`Return ${confirmReturn?.keyNumber ?? ""}?`}
        body="The key becomes available for the next member."
        confirmLabel="Return key"
        onConfirm={() => confirmReturn && doReturn(confirmReturn)}
        onCancel={() => setConfirmReturn(null)}
      />

      {/* Issue modal */}
      {issueFor && (
        <MemberPickerModal
          title={`Issue ${issueFor.keyNumber}`}
          subtitle="Pick the member receiving this key."
          members={members}
          onConfirm={confirmIssue}
          onClose={() => setIssueFor(null)}
        />
      )}

      {/* Transfer modal */}
      {transferFor && (
        <MemberPickerModal
          title={`Transfer ${transferFor.keyNumber}`}
          subtitle={`Currently with ${transferFor.memberName ?? "—"}. Pick the new holder.`}
          members={members}
          onConfirm={confirmTransfer}
          onClose={() => setTransferFor(null)}
        />
      )}

      {/* Key detail modal */}
      {detailFor && (
        <KeyDetailModal
          k={detailFor}
          history={history}
          onClose={() => setDetailFor(null)}
          onTransfer={() => {
            setDetailFor(null);
            setTransferFor(detailFor);
          }}
          onIssue={() => {
            setDetailFor(null);
            setIssueFor(detailFor);
          }}
          onReturn={askReturn}
          onAttention={doAttention}
        />
      )}
    </div>
  );
}

function StatusChip({ k }: { k: KeyRow }) {
  if (k.attention)
    return <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">Attention</span>;
  if (k.status === "issued")
    return <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-medium text-blue-700">Issued</span>;
  return <span className="shrink-0 rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500">Available</span>;
}

// Per-card actions.
//   Available → [Issue]        Issued → [Return] [•••]        Attention → [Manage] [•••]
// All actions call the server and patch local state — instant, no reload.
function KeyActions({
  k,
  onIssue,
  onTransfer,
  onManage,
  onReturn,
  onAttention,
}: {
  k: KeyRow;
  onIssue: () => void;
  onTransfer: () => void;
  onManage: () => void;
  onReturn: (k: KeyRow) => void;
  onAttention: (k: KeyRow, attention: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const item = "block w-full px-3 py-2 text-left text-xs text-zinc-700 transition hover:bg-zinc-50";

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  if (k.status === "available" && !k.attention) {
    return (
      <button
        type="button"
        disabled={busy}
        onClick={onIssue}
        className="w-full rounded-lg border border-zinc-300 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:opacity-50"
      >
        Issue
      </button>
    );
  }

  const primary =
    k.attention ? (
      <button
        type="button"
        disabled={busy}
        onClick={onManage}
        className="flex-1 rounded-lg bg-amber-600 py-2 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50"
      >
        Manage
      </button>
    ) : (
      <button
        type="button"
        disabled={busy}
        onClick={() => onReturn(k)}
        className="flex-1 rounded-lg bg-zinc-900 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50"
      >
        {busy ? "Returning…" : "Return"}
      </button>
    );

  return (
    <div className="flex items-center gap-1.5">
      {primary}
      <PopoverMenu
        trigger={({ toggle }) => (
          <button
            type="button"
            disabled={busy}
            onClick={toggle}
            className="shrink-0 rounded-lg border border-zinc-300 px-3.5 py-2 text-xs font-medium text-zinc-600 transition hover:bg-zinc-50 disabled:opacity-50"
            title="More actions"
          >
            •••
          </button>
        )}
      >
        <div className="py-1">
          {k.attention && k.status === "issued" && (
            <button type="button" data-popover-keep onClick={() => onReturn(k)} className={item}>Return key</button>
          )}
          {k.attention && k.status === "available" && (
            <button type="button" onClick={onIssue} className={item}>Issue key…</button>
          )}
          {k.status === "issued" && (
            <button type="button" onClick={onTransfer} className={item}>Transfer key…</button>
          )}
          {!k.attention && (
            <button type="button" onClick={() => run(() => onAttention(k, true))} className={item}>Flag for attention</button>
          )}
          {k.attention && (
            <button type="button" onClick={() => run(() => onAttention(k, false))} className={item}>Clear attention</button>
          )}
        </div>
      </PopoverMenu>
    </div>
  );
}

// Key detail: current state, actions, full history
function KeyDetailModal({
  k,
  history,
  onClose,
  onTransfer,
  onIssue,
  onReturn,
  onAttention,
}: {
  k: KeyRow;
  history: HistoryRow[];
  onClose: () => void;
  onTransfer: () => void;
  onIssue: () => void;
  onReturn: (k: KeyRow) => void;
  onAttention: (k: KeyRow, attention: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl sm:p-6 sm:pb-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">Locker Key {k.keyNumber}</h2>
          <button onClick={onClose} className="rounded-lg px-2 py-1 text-sm text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900" aria-label="Close">
            ✕
          </button>
        </div>
        <dl className="space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-zinc-400">Status</dt>
            <dd className="font-medium text-zinc-900">
              {k.attention ? "Needs attention" : k.status === "issued" ? "Issued" : "Available"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-zinc-400">Locker</dt>
            <dd className="text-zinc-900">{k.lockerNumber ?? "—"}</dd>
          </div>
          {k.memberId && (
            <>
              <div className="flex justify-between">
                <dt className="text-zinc-400">Member</dt>
                <dd className="text-zinc-900">{k.memberName}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-zinc-400">Issued</dt>
                <dd className="text-zinc-900">{k.issuedAt ? formatDate(k.issuedAt) : "—"}</dd>
              </div>
            </>
          )}
        </dl>
        <div className="mt-4 flex flex-wrap gap-2 border-t border-zinc-100 pt-4">
          {k.status === "issued" ? (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => onReturn(k)}
                className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50"
              >
                {busy ? "Returning…" : "Return Key"}
              </button>
              <button
                type="button"
                onClick={onTransfer}
                className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
              >
                Transfer Key
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={onIssue}
              className="rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              Issue Key
            </button>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => onAttention(k, !k.attention))}
            className="rounded-lg px-4 py-2.5 text-sm font-medium text-zinc-500 transition hover:bg-zinc-50 hover:text-zinc-900 disabled:opacity-50"
          >
            {k.attention ? "Clear attention" : "Flag for attention"}
          </button>
        </div>

        {/* history */}
        <div className="mt-4 border-t border-zinc-100 pt-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-zinc-400">History</p>
          <div className="max-h-40 space-y-1.5 overflow-y-auto">
            {history.filter((h) => h.keyId === k.id).length === 0 && (
              <p className="text-xs text-zinc-400">Never issued.</p>
            )}
            {history
              .filter((h) => h.keyId === k.id)
              .map((h) => (
                <p key={h.id} className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="text-zinc-700">{h.memberName}</span>
                  <span className="text-zinc-400">
                    {formatDate(h.issuedAt)} → {h.returnedAt ? formatDate(h.returnedAt) : "still out"}
                  </span>
                </p>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// Issue / Transfer member picker (bottom sheet on mobile). Confirms via a
// callback so the caller can patch state instantly — no page reload.
function MemberPickerModal({
  title,
  subtitle,
  members,
  onConfirm,
  onClose,
}: {
  title: string;
  subtitle: string;
  members: MemberOption[];
  onConfirm: (memberId: string) => Promise<boolean>;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const [selected, setSelected] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const query = q.trim().toLowerCase();
  const digits = query.replace(/\D/g, "");
  const results = members.filter((m) => {
    if (!query) return true;
    if (m.name.toLowerCase().includes(query)) return true;
    return digits.length >= 3 && (m.phone ?? "").replace(/\D/g, "").endsWith(digits.slice(-10));
  });

  const confirm = async () => {
    if (!selected || busy) return;
    setBusy(true);
    setError(null);
    const ok = await onConfirm(selected);
    if (!ok) setError("Could not save — please try again.");
    setBusy(false);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center sm:p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl sm:p-6 sm:pb-6">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900">{title}</h2>
          <button onClick={() => !busy && onClose()} className="rounded-lg px-2 py-1 text-sm text-zinc-400 transition hover:bg-zinc-100 hover:text-zinc-900" aria-label="Close">
            ✕
          </button>
        </div>
        <p className="mb-3 text-xs text-zinc-500">{subtitle}</p>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          type="search"
          inputMode="search"
          placeholder="Search member by name or phone…"
          className="block w-full rounded-lg border border-zinc-300 px-3 py-2.5 text-base focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
        />
        <div className="mt-3 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-zinc-200 p-1 sm:max-h-64">
          {results.slice(0, 12).map((m) => (
            <button
              type="button"
              key={m.id}
              onClick={() => setSelected(m.id)}
              className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left text-sm transition sm:py-2 ${
                selected === m.id ? "bg-zinc-900 text-white" : "hover:bg-zinc-50"
              }`}
            >
              <span className="font-medium">{m.name}</span>
              <span className={`text-xs ${selected === m.id ? "text-zinc-300" : "text-zinc-400"}`}>{m.phone}</span>
            </button>
          ))}
          {results.length === 0 && <p className="px-3 py-2 text-xs text-zinc-400">No members found.</p>}
        </div>
        {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
        <button
          type="button"
          disabled={!selected || busy}
          onClick={confirm}
          className="mt-3 w-full rounded-lg bg-zinc-900 px-4 py-3 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:bg-zinc-200 disabled:text-zinc-400"
        >
          {busy ? "Saving…" : "Confirm"}
        </button>
      </div>
    </div>
  );
}

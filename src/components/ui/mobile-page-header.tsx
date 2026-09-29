import Link from "next/link";

// Compact mobile header: "← {title}" + optional primary action. Desktop keeps
// the full page heading, so this renders below md only.
export function MobilePageHeader({ title, actionHref, actionLabel }: { title: string; actionHref?: string; actionLabel?: string }) {
  return (
    <div className="flex items-center justify-between md:hidden">
      <Link href="/dashboard" className="text-sm font-semibold text-zinc-500 transition hover:text-zinc-900">
        ← {title}
      </Link>
      {actionHref && actionLabel && (
        <Link
          href={actionHref}
          className="rounded-lg bg-zinc-900 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-zinc-800"
        >
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

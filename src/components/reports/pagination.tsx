import Link from "next/link";

// Server-side pagination footer: "Showing 1–50 of 427" + Prev/Next, preserving
// every active filter in the URL.
export function ReportPagination({
  page,
  pageSize,
  total,
  basePath,
  params,
}: {
  page: number;
  pageSize: number;
  total: number;
  basePath: string;
  params: Record<string, string | undefined>;
}) {
  if (total === 0) return null;
  const buildHref = (p: number) => {
    const sp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => v && sp.set(k, v));
    sp.set("page", String(p));
    return `${basePath}?${sp.toString()}`;
  };
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-zinc-500">
        Showing {from}–{to} of {total}
      </p>
      <div className="flex gap-2">
        {page > 1 && (
          <Link href={buildHref(page - 1)} className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50">
            ← Previous
          </Link>
        )}
        {page * pageSize < total && (
          <Link href={buildHref(page + 1)} className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50">
            Next →
          </Link>
        )}
      </div>
    </div>
  );
}

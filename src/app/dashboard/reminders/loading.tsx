export default function RemindersLoading() {
  return (
    <div className="space-y-5">
      <div>
        <div className="h-8 w-40 animate-pulse rounded-lg bg-zinc-200/60" />
        <div className="mt-1.5 h-4 w-64 animate-pulse rounded bg-zinc-100" />
      </div>
      {[...Array(4)].map((_, i) => (
        <div key={i} className="rounded-xl bg-white ring-1 ring-zinc-200/60">
          <div className="px-5 py-3.5">
            <div className="h-5 w-48 animate-pulse rounded bg-zinc-100" />
          </div>
          <div className="divide-y divide-zinc-100 border-t border-zinc-100">
            {[...Array(3)].map((_, j) => (
              <div key={j} className="h-14 animate-pulse" />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

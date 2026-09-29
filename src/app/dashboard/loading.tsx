export default function DashboardLoading() {
  return (
    <div className="space-y-5">
      <div>
        <div className="h-8 w-40 animate-pulse rounded-lg bg-zinc-200/60" />
        <div className="mt-1.5 h-4 w-56 animate-pulse rounded bg-zinc-100" />
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-[88px] animate-pulse rounded-xl bg-zinc-100" />
        ))}
      </div>

      <div className="h-16 animate-pulse rounded-xl bg-zinc-100" />

      <div className="h-28 animate-pulse rounded-xl bg-zinc-100" />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-48 animate-pulse rounded-xl bg-zinc-100" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        {[...Array(2)].map((_, i) => (
          <div key={i} className="h-40 animate-pulse rounded-xl bg-zinc-100" />
        ))}
      </div>

      <div className="h-32 animate-pulse rounded-xl bg-zinc-100" />
    </div>
  );
}

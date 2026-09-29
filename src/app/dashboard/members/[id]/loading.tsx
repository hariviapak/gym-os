export default function MemberProfileLoading() {
  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <div className="h-16 w-16 animate-pulse rounded-full bg-zinc-200" />
        <div className="flex-1 space-y-2">
          <div className="h-7 w-48 animate-pulse rounded-lg bg-zinc-200" />
          <div className="h-4 w-32 animate-pulse rounded bg-zinc-100" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-20 animate-pulse rounded-lg bg-zinc-100" />
          <div className="h-9 w-20 animate-pulse rounded-lg bg-zinc-100" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="h-24 animate-pulse rounded-xl bg-white ring-1 ring-zinc-200" />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6">
          <div className="h-48 animate-pulse rounded-xl bg-zinc-100" />
          <div className="h-32 animate-pulse rounded-xl bg-zinc-100" />
        </div>
        <div className="space-y-6 lg:col-span-2">
          <div className="h-64 animate-pulse rounded-xl bg-zinc-100" />
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="h-48 animate-pulse rounded-xl bg-zinc-100" />
            <div className="h-48 animate-pulse rounded-xl bg-zinc-100" />
          </div>
        </div>
      </div>
    </div>
  );
}

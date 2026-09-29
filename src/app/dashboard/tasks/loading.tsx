export default function TasksLoading() {
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <div className="h-8 w-32 animate-pulse rounded-lg bg-zinc-200/60" />
          <div className="mt-1.5 h-4 w-48 animate-pulse rounded bg-zinc-100" />
        </div>
        <div className="h-8 w-24 animate-pulse rounded-lg bg-zinc-100" />
      </div>
      <div className="flex gap-2">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-8 w-20 animate-pulse rounded-lg bg-zinc-100" />
        ))}
      </div>
      <div className="space-y-2">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="h-20 animate-pulse rounded-xl bg-zinc-100" />
        ))}
      </div>
    </div>
  );
}

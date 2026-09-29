export default function PaymentsLoading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-32 animate-pulse rounded-lg bg-zinc-200" />

      <div className="flex gap-3">
        <div className="h-10 flex-1 animate-pulse rounded-lg bg-zinc-200" />
        <div className="h-10 w-32 animate-pulse rounded-lg bg-zinc-100" />
        <div className="h-10 w-32 animate-pulse rounded-lg bg-zinc-100" />
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="h-20 animate-pulse rounded-xl bg-zinc-100" />
        <div className="h-20 animate-pulse rounded-xl bg-zinc-100" />
      </div>

      <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-zinc-200">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50">
              {[...Array(6)].map((_, i) => (
                <th key={i} className="px-4 py-3">
                  <div className="h-3 w-16 animate-pulse rounded bg-zinc-200" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {[...Array(10)].map((_, i) => (
              <tr key={i}>
                {[...Array(6)].map((_, j) => (
                  <td key={j} className="px-4 py-3">
                    <div className="h-4 w-full animate-pulse rounded bg-zinc-100" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

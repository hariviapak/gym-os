import { createClient } from "@/lib/supabase/server";
import { AuditFilters } from "@/components/audit/audit-filters";
import { formatDateTime } from "@/lib/utils";
import Link from "next/link";

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{
    entity_type?: string;
    from?: string;
    to?: string;
    page?: string;
    sort?: string;
    order?: string;
  }>;
}) {
  const supabase = await createClient();
// zero-network session read: the middleware already verified this session,
  // and RLS enforces all data access regardless of where it was checked
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  const { data: userData } = await supabase
    .from("users")
    .select("gym_id, role")
    .eq("id", user!.id)
    .single();

  if (!["owner", "admin", "manager"].includes(userData!.role)) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-sm text-zinc-400">You don&apos;t have access to audit logs.</p>
      </div>
    );
  }

  const gymId = userData!.gym_id;
  const params = await searchParams;
  const entityType = params.entity_type ?? "all";
  const page = Math.max(1, parseInt(params.page ?? "1"));
  const pageSize = 25;
  const sort = params.sort ?? "created_at";
  const order = params.order ?? "desc";

  let query = supabase
    .from("audit_logs")
    .select("*, users(name)", { count: "exact" })
    .eq("gym_id", gymId)
    .order(sort, { ascending: order === "asc" })
    .range((page - 1) * pageSize, page * pageSize - 1);

  if (entityType !== "all") {
    query = query.eq("entity_type", entityType);
  }

  if (params.from) {
    query = query.gte("created_at", params.from);
  }

  if (params.to) {
    query = query.lte("created_at", params.to);
  }

  const { data: logs, count } = await query;

  const sortUrl = (column: string) =>
    `/dashboard/audit?${new URLSearchParams({
      ...params,
      sort: column,
      order: sort === column && order === "asc" ? "desc" : "asc",
      page: "1",
    }).toString()}`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Audit Log</h1>
        <p className="mt-1 text-sm text-zinc-500">Who changed what, when</p>
      </div>

      <AuditFilters entityType={entityType} from={params.from ?? ""} to={params.to ?? ""} />

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-zinc-200">
        <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-3">
                <Link href={sortUrl("created_at")} className="inline-flex items-center gap-1 hover:text-zinc-900">
                  When
                  {sort === "created_at" && <span>{order === "asc" ? "↑" : "↓"}</span>}
                </Link>
              </th>
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Entity</th>
              <th className="px-4 py-3">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {logs?.length === 0 || !logs ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-zinc-400">
                  No audit entries found.
                </td>
              </tr>
            ) : (
              logs.map((log: any) => (
                <tr key={log.id} className="hover:bg-zinc-50">
                  <td className="px-4 py-3 text-sm text-zinc-600">
                    {formatDateTime(log.created_at)}
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-900">
                    {log.users?.name ?? "System"}
                  </td>
                  <td className="px-4 py-3 text-sm text-zinc-600">{log.action}</td>
                  <td className="px-4 py-3 text-sm text-zinc-500">
                    {log.entity_type}
                    {log.entity_id && (
                      <span className="ml-1 font-mono text-xs text-zinc-400">
                        ({log.entity_id.slice(0, 8)})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {log.changes ? (
                      <details>
                        <summary className="cursor-pointer text-xs text-zinc-500 hover:text-zinc-900">View</summary>
                        <pre className="mt-1 max-w-xs overflow-x-auto rounded bg-zinc-50 p-2 text-xs text-zinc-600">
                          {JSON.stringify(log.changes, null, 2)}
                        </pre>
                      </details>
                    ) : (
                      <span className="text-xs text-zinc-400">—</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
      </div>

      {/* Pagination */}
      {count && count > pageSize && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-zinc-500">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, count)} of {count}
          </p>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={`/dashboard/audit?${new URLSearchParams({ ...params, page: String(page - 1) }).toString()}`}
                className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
              >
                ← Previous
              </Link>
            )}
            {page * pageSize < count && (
              <Link
                href={`/dashboard/audit?${new URLSearchParams({ ...params, page: String(page + 1) }).toString()}`}
                className="rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-700 transition hover:bg-zinc-50"
              >
                Next →
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

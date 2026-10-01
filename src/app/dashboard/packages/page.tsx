import { createClient } from "@/lib/supabase/server";
import { formatCurrency, formatDate, statusColor } from "@/lib/utils";
import Link from "next/link";
import { togglePackageActive, movePackage } from "@/lib/actions/packages";
import { AddPackageModal } from "@/components/packages/add-package-modal";
import { EditPackageModal } from "@/components/packages/edit-package-modal";

export default async function PackagesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; type?: string; service?: string; view?: string }>;
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

  const gymId = userData!.gym_id;
  const canEdit = ["owner", "admin", "manager"].includes(userData!.role);
  const params = await searchParams;
  const typeFilter = params.type ?? "all";
  const serviceFilter = params.service ?? "all";
  const view = params.view === "grid" ? "grid" : "list";

  const { data: settings } = await supabase
    .from("gym_settings")
    .select("gst_mode")
    .eq("gym_id", gymId)
    .single();
  const gstInclusive = (settings?.gst_mode ?? "exclusive") === "inclusive";

  // Build a packages URL preserving current filters (optionally overriding entries)
  function pkgHref(overrides: Record<string, string | undefined> = {}) {
    const p = new URLSearchParams();
    const state: Record<string, string> = {
      service: serviceFilter,
      type: typeFilter,
      view,
    };
    Object.entries({ ...state, ...overrides }).forEach(([k, v]) => {
      if (v && v !== "all" && !(k === "view" && v === "list")) p.set(k, v);
    });
    const qs = p.toString();
    return qs ? `/dashboard/packages?${qs}` : "/dashboard/packages";
  }

  const { data: packages } = await supabase
    .from("packages")
    .select("*")
    .eq("gym_id", gymId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });

  // Get member counts per package
  const { data: memberCounts } = await supabase
    .from("memberships")
    .select("package_id")
    .eq("gym_id", gymId)
    .eq("status", "active");

  const countMap: Record<string, number> = {};
  (memberCounts ?? []).forEach((m: any) => {
    countMap[m.package_id] = (countMap[m.package_id] ?? 0) + 1;
  });

  const filteredPackages = (packages ?? []).filter((p) => {
    if (typeFilter !== "all" && p.type !== typeFilter) return false;
    if (serviceFilter !== "all") {
      if (serviceFilter === "gym" && p.service_type !== "gym") return false;
      if (serviceFilter === "swimming" && p.service_type !== "swimming") return false;
      if (serviceFilter === "both" && p.service_type !== "both") return false;
    }
    return true;
  });

  const serviceBadge: Record<string, string> = {
    gym: "bg-zinc-100 text-zinc-600",
    swimming: "bg-cyan-50 text-cyan-700",
    both: "bg-purple-50 text-purple-700",
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900">Packages</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Membership plans, day passes, and trials
          </p>
        </div>
        {canEdit && <AddPackageModal gymId={gymId} gstInclusive={gstInclusive} />}
      </div>

      {params.error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {params.error}
        </div>
      )}

      {/* Service filter */}
      <div className="flex flex-wrap gap-2">
        {[
          { key: "all", label: "All Services" },
          { key: "gym", label: "🏋️ Gym" },
          { key: "swimming", label: "🏊 Swimming" },
          { key: "both", label: "⚡ Combo" },
        ].map((s) => (
          <Link
            key={s.key}
            href={pkgHref({ service: s.key })}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              serviceFilter === s.key
                ? "bg-zinc-900 text-white"
                : "border border-zinc-300 text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            {s.label}
          </Link>
        ))}
      </div>

      {/* Type filter + view toggle */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          {["all", "membership", "day_pass", "trial", "pt"].map((t) => (
            <Link
              key={t}
              href={pkgHref({ type: t })}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                typeFilter === t
                  ? "bg-zinc-900 text-white"
                  : "border border-zinc-300 text-zinc-600 hover:bg-zinc-50"
              }`}
            >
              {t === "all" ? "All" : t === "day_pass" ? "Day Pass" : t === "pt" ? "Personal Training" : t.charAt(0).toUpperCase() + t.slice(1)}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-lg border border-zinc-300 p-0.5">
          <Link
            href={pkgHref({ view: "grid" })}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              view === "grid" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-100"
            }`}
          >
            Grid
          </Link>
          <Link
            href={pkgHref({ view: "list" })}
            className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
              view === "list" ? "bg-zinc-900 text-white" : "text-zinc-500 hover:bg-zinc-100"
            }`}
          >
            List
          </Link>
        </div>
      </div>

      {view === "grid" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredPackages?.map((pkg, index) => {
          const memberCount = countMap[pkg.id] ?? 0;
          return (
            <div
              key={pkg.id}
              className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200"
            >
                <>
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="text-lg font-semibold text-zinc-900">{pkg.name}</h3>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(pkg.type)}`}
                        >
                          {pkg.type.replace("_", " ")}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${serviceBadge[pkg.service_type] ?? serviceBadge.gym}`}
                        >
                          {pkg.service_type === "both" ? "Gym + Swim" : pkg.service_type === "swimming" ? "🏊 Swimming" : "🏋️ Gym"}
                        </span>
                        {pkg.is_group_package && (
                          <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-violet-200">
                            Family
                          </span>
                        )}
                      </div>
                    </div>
                    <span className="text-xl font-bold text-zinc-900">
                      {formatCurrency(pkg.amount)}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-zinc-500">
                    {pkg.duration_days} day{pkg.duration_days === 1 ? "" : "s"}
                    {pkg.gst_rate > 0 && ` · GST ${pkg.gst_rate}%${gstInclusive ? " incl." : " extra"}`}
                  </p>
                  {pkg.description && (
                    <p className="mt-2 text-xs text-zinc-400">{pkg.description}</p>
                  )}
                  <div className="mt-3 flex items-center gap-3 text-xs">
                    <span className="text-zinc-500">
                      <span className="font-semibold text-zinc-900">{memberCount}</span> active member{memberCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="mt-4 flex items-center gap-2">
                    {pkg.is_active ? (
                      <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        Active
                      </span>
                    ) : (
                      <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">
                        Inactive
                      </span>
                    )}
                    {canEdit && (
                      <div className="ml-auto flex items-center gap-1">
                        {index > 0 && (
                          <form action={movePackage.bind(null, pkg.id, "up")}>
                            <button
                              type="submit"
                              className="rounded px-1.5 py-1 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
                              title="Move up"
                            >
                              ↑
                            </button>
                          </form>
                        )}
                        {index < filteredPackages.length - 1 && (
                          <form action={movePackage.bind(null, pkg.id, "down")}>
                            <button
                              type="submit"
                              className="rounded px-1.5 py-1 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900"
                              title="Move down"
                            >
                              ↓
                            </button>
                          </form>
                        )}
                        <EditPackageModal
                          pkg={{
                            id: pkg.id,
                            name: pkg.name,
                            type: pkg.type,
                            service_type: pkg.service_type,
                            duration_days: pkg.duration_days,
                            amount: Number(pkg.amount),
                            gst_rate: pkg.gst_rate,
                            description: pkg.description,
                            digital_kit_url: pkg.digital_kit_url,
                            is_group_package: !!pkg.is_group_package,
                          }}
                          gstInclusive={gstInclusive}
                        />
                        <form action={togglePackageActive.bind(null, pkg.id, !pkg.is_active)}>
                          <button
                            type="submit"
                            className="rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                          >
                            {pkg.is_active ? "Disable" : "Enable"}
                          </button>
                        </form>
                      </div>
                    )}
                  </div>
                </>
            </div>
          );
          })}
        </div>
      )}

      {view === "list" && (
        <div className="overflow-x-auto rounded-xl bg-white ring-1 ring-zinc-200/60">
          <table className="w-full">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50/50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                <th className="px-4 py-3">Package</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Service</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Members</th>
                <th className="px-4 py-3">Status</th>
                {canEdit && <th className="px-4 py-3"></th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {filteredPackages?.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 8 : 7} className="px-4 py-8 text-center text-sm text-zinc-400">
                    No packages found.
                  </td>
                </tr>
              )}
              {filteredPackages?.map((pkg, index) => {
                const memberCount = countMap[pkg.id] ?? 0;
                return (
                    <tr key={pkg.id} className="transition hover:bg-zinc-50">
                      <td className="px-4 py-3">
                        <span className="text-sm font-semibold text-zinc-900">{pkg.name}</span>
                        {pkg.is_group_package && (
                          <span className="ml-1.5 rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold text-violet-700 ring-1 ring-violet-200">
                            Family
                          </span>
                        )}
                        {pkg.description && (
                          <p className="text-xs text-zinc-400">{pkg.description}</p>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusColor(pkg.type)}`}>
                          {pkg.type.replace("_", " ")}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${serviceBadge[pkg.service_type] ?? serviceBadge.gym}`}>
                          {pkg.service_type === "both" ? "Gym + Swim" : pkg.service_type === "swimming" ? "Swimming" : "Gym"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-600">
                        {pkg.duration_days} day{pkg.duration_days === 1 ? "" : "s"}
                      </td>
                      <td className="px-4 py-3 text-sm font-semibold text-zinc-900">
                        {formatCurrency(pkg.amount)}
                        {pkg.gst_rate > 0 && (
                          <span className="ml-1 text-xs font-normal text-zinc-400">
                            {gstInclusive ? `GST ${pkg.gst_rate}% incl.` : `+${pkg.gst_rate}% GST`}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-zinc-600">{memberCount}</td>
                      <td className="px-4 py-3">
                        {pkg.is_active ? (
                          <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">Active</span>
                        ) : (
                          <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">Inactive</span>
                        )}
                      </td>
                      {canEdit && (
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            {index > 0 && (
                              <form action={movePackage.bind(null, pkg.id, "up")}>
                                <button type="submit" className="rounded px-1.5 py-1 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900" title="Move up">↑</button>
                              </form>
                            )}
                            {index < filteredPackages.length - 1 && (
                              <form action={movePackage.bind(null, pkg.id, "down")}>
                                <button type="submit" className="rounded px-1.5 py-1 text-xs text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900" title="Move down">↓</button>
                              </form>
                            )}
                            <EditPackageModal pkg={{ id: pkg.id, name: pkg.name, type: pkg.type, service_type: pkg.service_type, duration_days: pkg.duration_days, amount: Number(pkg.amount), gst_rate: pkg.gst_rate, description: pkg.description, digital_kit_url: pkg.digital_kit_url, is_group_package: !!pkg.is_group_package }} gstInclusive={gstInclusive} />
                            <form action={togglePackageActive.bind(null, pkg.id, !pkg.is_active)}>
                              <button type="submit" className="rounded px-2 py-1 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">
                                {pkg.is_active ? "Disable" : "Enable"}
                              </button>
                            </form>
                          </div>
                        </td>
                      )}
                    </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

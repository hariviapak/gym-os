import { createClient } from "@/lib/supabase/server";
import { roleLabel } from "@/lib/utils";
import { createUser, updateUserRole, toggleUserActive } from "@/lib/actions/users";
import { SubmitButton } from "@/components/ui/submit-button";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
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

  if (!["owner", "admin"].includes(userData!.role)) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-sm text-zinc-400">You don&apos;t have access to user management.</p>
      </div>
    );
  }

  const params = await searchParams;

  const { data: users } = await supabase
    .from("users")
    .select("*")
    .eq("gym_id", userData!.gym_id)
    .order("created_at", { ascending: true });

  const roleColors: Record<string, string> = {
    owner: "bg-purple-100 text-purple-700",
    admin: "bg-blue-100 text-blue-700",
    manager: "bg-green-100 text-green-700",
    staff: "bg-zinc-100 text-zinc-700",
    trainer: "bg-orange-100 text-orange-700",
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-zinc-900">Users</h1>
        <p className="mt-1 text-sm text-zinc-500">Manage staff accounts and roles</p>
      </div>

      {params.error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {params.error}
        </div>
      )}

      {/* User list */}
      <div className="overflow-x-auto rounded-xl bg-white shadow-sm ring-1 ring-zinc-200">
        <table className="w-full">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Phone</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200">
            {users?.length === 0 || !users ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-zinc-400">
                  No users found.
                </td>
              </tr>
            ) : (
              users.map((u) => {
                const isSelf = u.id === user!.id;
                return (
                  <tr key={u.id} className="hover:bg-zinc-50">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-sm font-medium text-zinc-900">
                          {u.name}
                          {isSelf && <span className="ml-1 text-xs text-zinc-400">(you)</span>}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-zinc-600">{u.email}</td>
                    <td className="px-4 py-3 text-sm text-zinc-600">{u.phone ?? "—"}</td>
                    <td className="px-4 py-3">
                      {isSelf ? (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${roleColors[u.role] ?? "bg-zinc-100 text-zinc-600"}`}>
                          {roleLabel(u.role)}
                        </span>
                      ) : (
                        <div className="flex items-center gap-1">
                          <form action={updateUserRole.bind(null, u.id)}>
                            <select
                              name="role"
                              defaultValue={u.role}
                              className="rounded-lg border border-zinc-300 px-2 py-0.5 text-xs focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                            >
                              <option value="admin">Admin</option>
                              <option value="manager">Manager</option>
                              <option value="staff">Staff</option>
                              <option value="trainer">Trainer</option>
                            </select>
                            <button
                              type="submit"
                              className="ml-1 rounded px-1.5 py-0.5 text-xs text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
                            >
                              Save
                            </button>
                          </form>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${u.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                        {u.is_active ? "Active" : "Inactive"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {!isSelf && (
                        <form action={toggleUserActive.bind(null, u.id, !u.is_active)}>
                          <button
                            type="submit"
                            className={`rounded px-2 py-1 text-xs font-medium transition ${
                              u.is_active
                                ? "text-red-600 hover:bg-red-50"
                                : "text-green-600 hover:bg-green-50"
                            }`}
                          >
                            {u.is_active ? "Deactivate" : "Activate"}
                          </button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add user form */}
      <div className="rounded-xl bg-white p-5 shadow-sm ring-1 ring-zinc-200">
        <h2 className="mb-4 text-lg font-semibold text-zinc-900">Add Staff Member</h2>
        <form action={createUser} className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-medium text-zinc-600">Name *</label>
            <input
              name="name"
              required
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              placeholder="John Doe"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">Email *</label>
            <input
              name="email"
              type="email"
              required
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              placeholder="john@792fitness.com"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">Phone</label>
            <input
              name="phone"
              type="tel"
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              placeholder="9876543210"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-600">Role *</label>
            <select
              name="role"
              required
              defaultValue="staff"
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            >
              <option value="admin">Admin</option>
              <option value="manager">Manager</option>
              <option value="staff">Staff</option>
              <option value="trainer">Trainer</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-zinc-600">Temporary Password *</label>
            <input
              name="password"
              type="text"
              required
              minLength={6}
              className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              placeholder="Min 6 characters"
            />
            <p className="mt-1 text-xs text-zinc-400">User can change this after first login.</p>
          </div>
          <div className="sm:col-span-2">
            <SubmitButton
              className="rounded-lg bg-zinc-900 px-6 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
              label="Creating..."
            >
              Create Account
            </SubmitButton>
          </div>
        </form>
      </div>
    </div>
  );
}

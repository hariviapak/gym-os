import { createClient } from "@/lib/supabase/server";
import { MobilePageHeader } from "@/components/ui/mobile-page-header";
import { todayIST } from "@/lib/utils";
import { TaskForm } from "@/components/tasks/task-form";
import { TaskCard } from "@/components/tasks/task-card";
import { Icon } from "@/components/ui/icons";

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; status?: string }>;
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
  const params = await searchParams;
  const statusFilter = params.status ?? "pending";

  const [{ data: tasks }, { data: staff }] = await Promise.all([
    supabase
      .from("gym_tasks")
      .select("*, assigned_to_user:users!gym_tasks_assigned_to_fkey(name), created_by_user:users!gym_tasks_created_by_fkey(name), completed_by_user:users!gym_tasks_completed_by_fkey(name)")
      .eq("gym_id", gymId)
      .order(statusFilter === "done" ? "completed_at" : "created_at", { ascending: false }),
    supabase
      .from("users")
      .select("id, name")
      .eq("gym_id", gymId)
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);

  const filtered = (tasks ?? []).filter((t: any) =>
    statusFilter === "all" ? true : t.status === statusFilter
  );

  const today = todayIST();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="hidden text-2xl font-bold text-zinc-900 md:block">Tasks</h1>
          <p className="mt-0.5 hidden text-sm text-zinc-500 md:block">Operational tasks and maintenance</p>
        </div>
        <MobilePageHeader title="Tasks" />
        <TaskForm staff={staff ?? []} />
      </div>

      {params.error && (
        <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{params.error}</div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2">
        {[
          { label: "Pending", value: "pending" },
          { label: "Done", value: "done" },
          { label: "All", value: "all" },
        ].map((tab) => (
          <a
            key={tab.value}
            href={`/dashboard/tasks?status=${tab.value}`}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
              statusFilter === tab.value
                ? "bg-zinc-900 text-white"
                : "bg-white text-zinc-500 ring-1 ring-zinc-200/60 hover:bg-zinc-50"
            }`}
          >
            {tab.label}
          </a>
        ))}
      </div>

      {/* Task list */}
      {filtered.length === 0 ? (
        <div className="rounded-xl bg-white p-8 text-center ring-1 ring-zinc-200/60">
          <Icon name="check-square" className="mx-auto h-8 w-8 text-zinc-300" />
          <p className="mt-2 text-sm text-zinc-400">
            {statusFilter === "pending" ? "No pending tasks. All caught up!" : "No tasks found."}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((task: any) => (
            <TaskCard key={task.id} task={task} today={today} />
          ))}
        </div>
      )}
    </div>
  );
}

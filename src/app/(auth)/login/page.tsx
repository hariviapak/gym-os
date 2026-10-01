import { login } from "@/lib/auth/actions";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; gym?: string }>;
}) {
  const supabase = await createClient();
// zero-network session read: the middleware already verified this session,
  // and RLS enforces all data access regardless of where it was checked
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;

  if (user) {
    redirect("/");
  }

  const params = await searchParams;

  let gymQuery = supabase.from("gyms").select("name, logo_url, code");
  if (params.gym) {
    gymQuery = gymQuery.eq("code", params.gym).limit(1);
  } else {
    gymQuery = gymQuery.limit(1);
  }
  const { data: gym } = await gymQuery.maybeSingle();

  return (
    <div className="rounded-2xl bg-white p-8 shadow-2xl">
      <div className="mb-8 flex flex-col items-center text-center">
        {gym?.logo_url && (
          <img
            src={gym.logo_url}
            alt={gym.name}
            className="mb-3 h-16 w-16 rounded-lg object-contain"
          />
        )}
        <h1 className="text-2xl font-bold text-zinc-900">{gym?.name ?? "Gym"}</h1>
        <p className="mt-1 text-sm text-zinc-500">Gym Management System</p>
      </div>

      {params.error && (
        <div className="mb-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {params.error}
        </div>
      )}

      {params.message && (
        <div className="mb-4 rounded-lg bg-green-50 px-4 py-3 text-sm text-green-700">
          {params.message}
        </div>
      )}

      <form className="space-y-4">
        {params.gym && <input type="hidden" name="gym_code" value={params.gym} />}
        <div>
          <label htmlFor="email" className="block text-xs font-medium text-zinc-600">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            required
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            placeholder="you@gym.com"
          />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="block text-xs font-medium text-zinc-600">
              Password
            </label>
            <a href={params.gym ? `/forgot-password?gym=${params.gym}` : "/forgot-password"} className="text-xs font-medium text-zinc-400 transition hover:text-zinc-900">
              Forgot?
            </a>
          </div>
          <input
            id="password"
            name="password"
            type="password"
            required
            className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
            placeholder="••••••••"
          />
        </div>
        <button
          formAction={login}
          className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2"
        >
          Sign in
        </button>
      </form>

      <div className="mt-6 border-t border-zinc-200 pt-4">
        <p className="text-center text-xs text-zinc-500">
          New staff member? Ask your admin to create an account.
        </p>
      </div>
    </div>
  );
}

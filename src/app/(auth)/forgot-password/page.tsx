import { requestPasswordReset } from "@/lib/auth/actions";

export default async function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; gym?: string }>;
}) {
  const params = await searchParams;

  return (
    <div className="rounded-2xl bg-white p-8 shadow-2xl">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-bold text-zinc-900">Forgot Password?</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Enter your email and we&apos;ll send you a reset link.
        </p>
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
          <label htmlFor="email" className="block text-sm font-medium text-zinc-700">
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
        <button
          formAction={requestPasswordReset}
          className="w-full rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2"
        >
          Send Reset Link
        </button>
      </form>

      <div className="mt-6 border-t border-zinc-200 pt-4 text-center">
        <a href={params.gym ? `/login?gym=${params.gym}` : "/login"} className="text-xs font-medium text-zinc-500 transition hover:text-zinc-900">
          ← Back to login
        </a>
      </div>
    </div>
  );
}

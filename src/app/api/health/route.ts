import { NextResponse } from "next/server";

// Public health endpoint — also used by the keep-warm cron (pg_cron on
// Supabase) to prevent Vercel lambda cold starts during gym hours.
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({ ok: true });
}

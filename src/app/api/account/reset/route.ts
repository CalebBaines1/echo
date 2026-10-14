import { NextResponse } from 'next/server';
import { guard } from '@/lib/api/guard';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * "Start over": deletes the caller's account. Their profile, plans, groups,
 * shared links and answers go with it (every table cascades from the user).
 */
export async function POST(req: Request) {
  const caller = await guard(req, 'reset');
  if (caller instanceof Response) return caller;
  const admin = getSupabaseAdmin();
  if (!admin) return NextResponse.json({ ok: true }); // Local-only mode: nothing on a server to delete.
  const { error } = await admin.auth.admin.deleteUser(caller.userId);
  if (error) {
    console.error('Account reset failed', error.message);
    return NextResponse.json({ error: "Echo couldn't reset your account just now. Try again." }, { status: 502 });
  }
  return NextResponse.json({ ok: true });
}

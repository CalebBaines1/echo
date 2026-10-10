import 'server-only';
import { NextResponse } from 'next/server';
import { getSupabaseAdmin, getSupabaseVerifier } from '@/lib/supabase/admin';
import { supabaseConfigured } from '@/lib/supabase/config';

/** Daily limits per user. Each covers model calls, and most also cover Qloo calls. */
export const DAILY_LIMITS = {
  turn: 80,
  resolve: 60,
  profile: 12,
  mission: 12,
  hobby: 10,
  checkin: 20,
  compare: 20,
  group: 6,
} as const;

export type UsageKind = keyof typeof DAILY_LIMITS;

/**
 * Checks who's calling and counts the call against their daily limit.
 * Returns the user id, or a response to send back instead.
 *
 * Without Supabase configured (local development), every request is allowed.
 */
export async function guard(req: Request, kind: UsageKind): Promise<{ userId: string } | Response> {
  if (!supabaseConfigured()) {
    if (process.env.NODE_ENV === 'production') {
      return NextResponse.json({ error: "Echo isn't fully set up yet." }, { status: 503 });
    }
    return { userId: 'local-dev' };
  }

  const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  const verifier = getSupabaseVerifier();
  const { data, error } = token && verifier ? await verifier.auth.getUser(token) : { data: { user: null }, error: null };
  if (error || !data.user) {
    return NextResponse.json({ error: 'Your session expired. Reload the page and try again.' }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  if (admin) {
    const { data: allowed, error: usageError } = await admin.rpc('increment_usage', {
      p_user: data.user.id,
      p_kind: kind,
      p_limit: DAILY_LIMITS[kind],
    });
    if (usageError) console.error('Usage check failed', usageError.message);
    else if (allowed === false) {
      return NextResponse.json({ error: "You've reached today's limit for this. Try again tomorrow." }, { status: 429 });
    }
  }
  return { userId: data.user.id };
}

import 'server-only';
import { NextResponse } from 'next/server';
import { budgetAllows } from '@/lib/ai/spend';
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
  geo: 40,
  picker: 40,
  covers: 40,
  speak: 200,
  reset: 5,
} as const;

export type UsageKind = keyof typeof DAILY_LIMITS;

/**
 * Upper estimate of Claude cost per request, in dollars: about 2-3x what was
 * measured on Oct 10, 2026 (onboarding turn $0.0003, profile build $0.0001,
 * mission $0.022). A request only starts if this fits in what's left of the
 * global daily budget; the actual cost is what gets recorded.
 */
const COST_ESTIMATE: Record<UsageKind, number> = {
  turn: 0.002,
  resolve: 0,
  profile: 0.002,
  mission: 0.06,
  hobby: 0.005,
  checkin: 0.002,
  compare: 0,
  group: 0.05,
  geo: 0,
  picker: 0,
  covers: 0,
  speak: 0,
  reset: 0,
};

const BUDGET_MESSAGE = "Echo has used today's budget. It resets at midnight UTC.";

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
    if (COST_ESTIMATE[kind] > 0 && !(await budgetAllows(COST_ESTIMATE[kind]))) {
      return NextResponse.json({ error: BUDGET_MESSAGE }, { status: 429 });
    }
    return { userId: 'local-dev' };
  }

  const token = req.headers.get('authorization')?.match(/^Bearer (.+)$/i)?.[1];
  const verifier = getSupabaseVerifier();
  const { data, error } = token && verifier ? await verifier.auth.getUser(token) : { data: { user: null }, error: null };
  if (error || !data.user) {
    return NextResponse.json({ error: 'Your session expired. Reload the page and try again.' }, { status: 401 });
  }

  if (COST_ESTIMATE[kind] > 0 && !(await budgetAllows(COST_ESTIMATE[kind]))) {
    return NextResponse.json({ error: BUDGET_MESSAGE }, { status: 429 });
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

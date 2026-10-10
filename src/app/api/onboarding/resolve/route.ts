import { NextResponse } from 'next/server';
import { z } from 'zod';
import { resolveMention } from '@/lib/onboarding/resolve';
import { MENTION_TYPES } from '@/lib/onboarding/types';
import { getQloo } from '@/lib/qloo/server';
import { guard } from '@/lib/api/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  name: z.string().trim().min(1).max(200),
  type: z.enum(MENTION_TYPES).default('unknown'),
});

/** Matches one typed name to Qloo, for "add something" on the review screen. No model call. */
export async function POST(req: Request) {
  const caller = await guard(req, 'resolve');
  if (caller instanceof Response) return caller;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Enter a name.' }, { status: 400 });
  return NextResponse.json(await resolveMention(getQloo(), parsed.data));
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAnthropic } from '@/lib/ai/anthropic';
import { MENTION_TYPES } from '@/lib/onboarding/types';
import { buildProfile } from '@/lib/profile/build';
import { getQloo } from '@/lib/qloo/server';
import { guard } from '@/lib/api/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Entity = z.object({
  id: z.string(),
  name: z.string(),
  type: z.string(),
  disambiguation: z.string().optional(),
  year: z.number().optional(),
});

const Body = z.object({
  tastes: z
    .array(
      z.object({
        key: z.string(),
        name: z.string().max(200),
        type: z.enum(MENTION_TYPES),
        status: z.enum(['matched', 'ambiguous', 'pending', 'not_found']),
        entity: Entity.optional(),
      }),
    )
    .max(60),
  activities: z.array(z.object({ name: z.string().max(100), status: z.enum(['does', 'used_to', 'wants_to']), hobbyId: z.string().optional() })).max(30),
  preferences: z.object({
    company: z.enum(['solo', 'group', 'either']).optional(),
    setting: z.enum(['indoor', 'outdoor', 'either']).optional(),
    budget: z.number().optional(),
    maxMiles: z.number().optional(),
    notes: z.array(z.string().max(120)).max(20),
  }),
});

export async function POST(req: Request) {
  const caller = await guard(req, 'profile');
  if (caller instanceof Response) return caller;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  try {
    return NextResponse.json(await buildProfile(parsed.data, { qloo: getQloo(), model: getAnthropic().messages }));
  } catch (err) {
    console.error('Profile build failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Echo couldn't build your profile just now. Try again." }, { status: 502 });
  }
}

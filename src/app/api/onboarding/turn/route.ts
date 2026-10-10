import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAnthropic } from '@/lib/ai/anthropic';
import { runInterviewerTurn } from '@/lib/onboarding/interviewer';
import { MENTION_TYPES } from '@/lib/onboarding/types';
import { getQloo } from '@/lib/qloo/server';
import { guard } from '@/lib/api/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  messages: z
    .array(z.object({ role: z.enum(['echo', 'user']), text: z.string().trim().min(1).max(600) }))
    .min(1)
    .max(40),
  heard: z
    .array(z.object({ name: z.string().max(200), type: z.enum(MENTION_TYPES), status: z.string().max(20) }))
    .max(60)
    .default([]),
  activities: z
    .array(z.object({ name: z.string().max(100), status: z.enum(['does', 'used_to', 'wants_to']) }))
    .max(30)
    .default([]),
  preferences: z
    .object({
      company: z.enum(['solo', 'group', 'either']).optional(),
      setting: z.enum(['indoor', 'outdoor', 'either']).optional(),
      budget: z.number().optional(),
      maxMiles: z.number().optional(),
      notes: z.array(z.string().max(120)).max(20).optional(),
    })
    .default({}),
});

export async function POST(req: Request) {
  const caller = await guard(req, 'turn');
  if (caller instanceof Response) return caller;

  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  try {
    const heard = body.heard.map((h) => ({ ...h, status: h.status === 'ambiguous' ? ('ambiguous' as const) : ('matched' as const) }));
    const result = await runInterviewerTurn(
      { messages: body.messages, heard, activities: body.activities, preferences: body.preferences },
      { model: getAnthropic().messages, qloo: getQloo() },
    );
    return NextResponse.json(result);
  } catch (err) {
    const status = err instanceof Anthropic.APIError ? err.status : undefined;
    console.error('Onboarding turn failed', status ?? '', err instanceof Error ? err.message : err);
    const message =
      status === 429 || status === 529 ? 'Echo is busy right now. Try again in a moment.' : "Echo couldn't respond just now. Try again.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

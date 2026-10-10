import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAnthropic } from '@/lib/ai/anthropic';
import { guard } from '@/lib/api/guard';
import { adaptHobbyPlan } from '@/lib/plans/coach';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Week = z.object({
  week: z.string().max(40),
  title: z.string().max(120),
  detail: z.string().max(300),
  done: z.boolean().optional(),
  date: z.string().max(10).optional(),
  planId: z.string().max(80).optional(),
  note: z.string().max(400).optional(),
});

const Body = z.object({
  hobby: z.string().trim().min(1).max(100),
  weeks: z.array(Week).min(1).max(8),
  index: z.number().int().min(0).max(7),
  note: z.string().trim().min(1).max(400),
});

/** After a hobby step: a short reply, and the remaining steps revised to fit how it went. */
export async function POST(req: Request) {
  const caller = await guard(req, 'checkin');
  if (caller instanceof Response) return caller;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success || parsed.data.index >= parsed.data.weeks.length) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  try {
    return NextResponse.json(await adaptHobbyPlan(parsed.data, getAnthropic().messages));
  } catch (err) {
    console.error('Hobby adapt failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Echo couldn't update the plan just now. Try again." }, { status: 502 });
  }
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAnthropic } from '@/lib/ai/anthropic';
import { writeHobbyPlan } from '@/lib/plans/coach';
import { guard } from '@/lib/api/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Stop = z.object({ placeId: z.string(), name: z.string().max(200), why: z.string().max(400).optional() }).passthrough();
const Body = z.object({
  hobby: z.string().trim().min(1).max(100),
  stop: Stop,
  backup: Stop.optional(),
  tastes: z.array(z.string().max(200)).max(60),
  notes: z.array(z.string().max(120)).max(20),
});

export async function POST(req: Request) {
  const caller = await guard(req, 'hobby');
  if (caller instanceof Response) return caller;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  try {
    return NextResponse.json(await writeHobbyPlan(parsed.data, getAnthropic().messages));
  } catch (err) {
    console.error('Hobby plan failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Echo couldn't write this plan just now. Try again." }, { status: 502 });
  }
}

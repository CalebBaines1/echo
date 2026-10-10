import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAnthropic } from '@/lib/ai/anthropic';
import { runCheckIn } from '@/lib/plans/coach';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  planTitle: z.string().trim().min(1).max(200),
  stops: z.array(z.string().max(200)).max(6),
  answer: z.string().trim().min(1).max(800),
  knownNotes: z.array(z.string().max(120)).max(30),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tell Echo how it went first.' }, { status: 400 });
  try {
    return NextResponse.json(await runCheckIn(parsed.data, getAnthropic().messages));
  } catch (err) {
    console.error('Check-in failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Echo couldn't respond just now. Try again." }, { status: 502 });
  }
}

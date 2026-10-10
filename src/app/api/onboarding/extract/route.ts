import Anthropic from '@anthropic-ai/sdk';
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAnthropic } from '@/lib/ai/anthropic';
import { guard } from '@/lib/api/guard';
import { extractFromAnswer } from '@/lib/onboarding/extract';
import { getQloo } from '@/lib/qloo/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  text: z.string().trim().min(1).max(600),
  known: z.array(z.string().max(240)).max(80).default([]),
});

/** The one open question in onboarding: pulls names out of a free answer. */
export async function POST(req: Request) {
  const caller = await guard(req, 'turn');
  if (caller instanceof Response) return caller;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Tell Echo something first.' }, { status: 400 });
  try {
    return NextResponse.json(await extractFromAnswer(parsed.data, { model: getAnthropic().messages, qloo: getQloo() }));
  } catch (err) {
    const status = err instanceof Anthropic.APIError ? err.status : undefined;
    console.error('Extract failed', status ?? '', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Echo couldn't catch that just now. Try again." }, { status: 502 });
  }
}

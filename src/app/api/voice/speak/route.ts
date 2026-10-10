import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/api/guard';
import { MAX_SPEECH_CHARS, speechCost, synthesize, ttsConfigured, voiceBudgetAllows } from '@/lib/voice/tts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ text: z.string().trim().min(1).max(MAX_SPEECH_CHARS) });

/**
 * Echo's spoken voice as MP3. 503 means neural speech isn't available right
 * now (no key, or today's voice budget is used); the browser voice takes over.
 */
export async function POST(req: Request) {
  if (!ttsConfigured()) return NextResponse.json({ error: 'Neural voice is off.' }, { status: 503 });
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Nothing to say.' }, { status: 400 });

  // Both checks at once: every bit of latency here delays the first word.
  const [caller, affordable] = await Promise.all([guard(req, 'speak'), voiceBudgetAllows(speechCost(parsed.data.text))]);
  if (caller instanceof Response) return caller;
  if (!affordable) return NextResponse.json({ error: "Today's voice budget is used." }, { status: 503 });
  try {
    const audio = await synthesize(parsed.data.text);
    return new Response(audio, { headers: { 'content-type': 'audio/mpeg', 'cache-control': 'private, max-age=86400' } });
  } catch (err) {
    console.error('Speech failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Neural voice failed.' }, { status: 503 });
  }
}

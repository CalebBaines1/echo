import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/api/guard';
import { guessCards, seedCards } from '@/lib/onboarding/picker';
import { getQloo } from '@/lib/qloo/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.discriminatedUnion('action', [
  z.object({ action: z.literal('seed') }),
  z.object({
    action: z.literal('guess'),
    ids: z.array(z.string().max(80)).min(1).max(30),
    names: z.record(z.string().max(80), z.string().max(200)).default({}),
    exclude: z.array(z.string().max(80)).max(200).default([]),
  }),
]);

/** Cards for the onboarding picker: the starting titles, or Echo's guesses from what was tapped. */
export async function POST(req: Request) {
  const caller = await guard(req, 'picker');
  if (caller instanceof Response) return caller;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  const qloo = getQloo();
  const data = parsed.data;
  const cards = data.action === 'seed' ? await seedCards(qloo) : await guessCards(qloo, data);
  return NextResponse.json({ cards });
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { compareGroup } from '@/lib/plans/group';
import { QlooError } from '@/lib/qloo/errors';
import { getQloo } from '@/lib/qloo/server';
import { PersonSchema } from '../route-shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({ people: z.array(PersonSchema).min(2).max(6) });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Pick at least one friend.' }, { status: 400 });
  try {
    return NextResponse.json(await compareGroup(parsed.data.people, getQloo()));
  } catch (err) {
    const offline = err instanceof QlooError && err.status === 0;
    console.error('Group compare failed', err instanceof Error ? err.message : err);
    return NextResponse.json(
      { error: offline ? 'Comparing tastes needs live Qloo data, which is off right now.' : "Echo couldn't compare tastes just now. Try again." },
      { status: 502 },
    );
  }
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/api/guard';
import { coversFor } from '@/lib/covers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.object({
  items: z
    .array(z.object({ key: z.string().max(240), name: z.string().trim().min(1).max(200), type: z.string().max(20) }))
    .min(1)
    .max(60),
});

/** Cover image URLs for titles, from public sources. Returns a key → URL map; missing keys have no cover. */
export async function POST(req: Request) {
  const caller = await guard(req, 'covers');
  if (caller instanceof Response) return caller;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  return NextResponse.json({ covers: await coversFor(parsed.data.items) });
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { guard } from '@/lib/api/guard';
import { reverseArea, searchAreas } from '@/lib/geo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Body = z.union([
  z.object({ query: z.string().trim().min(2).max(120) }),
  z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }),
]);

/** Finds an area by name, or names the area around a point from the browser's location. */
export async function POST(req: Request) {
  const caller = await guard(req, 'geo');
  if (caller instanceof Response) return caller;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Type a neighbourhood or city.' }, { status: 400 });
  try {
    if ('query' in parsed.data) return NextResponse.json({ areas: await searchAreas(parsed.data.query) });
    return NextResponse.json({ areas: [await reverseArea(parsed.data.lat, parsed.data.lon)] });
  } catch (err) {
    console.error('Area lookup failed', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Couldn't look that place up just now. Try again." }, { status: 502 });
  }
}

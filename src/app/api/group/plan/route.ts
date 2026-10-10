import { z } from 'zod';
import { getAnthropic } from '@/lib/ai/anthropic';
import { GroupDataError, planGroup } from '@/lib/plans/group';
import { getQloo } from '@/lib/qloo/server';
import { AreaSchema, PersonSchema } from '../route-shared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const Body = z.object({
  people: z.array(PersonSchema).min(2).max(6),
  area: AreaSchema,
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  request: z.string().trim().min(1).max(400),
});

/** Streams {"type":"step"} lines, then {"type":"group","result":...} or {"type":"error"}. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid request.' }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const result = await planGroup(parsed.data, {
          qloo: getQloo(),
          model: getAnthropic().beta.messages,
          onStep: (step) => send({ type: 'step', step }),
        });
        send({ type: 'group', result });
      } catch (err) {
        console.error('Group plan failed', err instanceof Error ? err.message : err);
        send({
          type: 'error',
          message:
            err instanceof GroupDataError
              ? 'Planning together needs live Qloo place data for everyone, which is off right now.'
              : "Echo couldn't finish this plan. Try again.",
        });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' } });
}

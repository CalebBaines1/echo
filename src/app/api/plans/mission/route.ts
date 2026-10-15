import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { getAnthropic } from '@/lib/ai/anthropic';
import { MENTION_TYPES } from '@/lib/onboarding/types';
import { osmPlaceScout } from '@/lib/plans/place-scout';
import { PlannerDataError, runPlanner } from '@/lib/plans/planner';
import { getQloo } from '@/lib/qloo/server';
import { guard } from '@/lib/api/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const Entity = z.object({ id: z.string(), name: z.string(), type: z.string() }).passthrough();

const Body = z.object({
  request: z.string().trim().min(1).max(400),
  mode: z.enum(['hobby', 'day']),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  part: z.enum(['morning', 'afternoon', 'evening', 'any']).default('any'),
  moods: z.array(z.enum(['quiet', 'cozy', 'soloFriendly', 'handsOn', 'goodForGroups'])).max(5).default([]),
  avoidPlaceIds: z.array(z.string().max(80)).max(50).default([]),
  avoidStrict: z.boolean().default(false),
  profile: z.object({
    tastes: z
      .array(z.object({ key: z.string(), name: z.string().max(200), type: z.enum(MENTION_TYPES), status: z.enum(['matched', 'ambiguous', 'pending', 'not_found']), entity: Entity.optional() }))
      .max(60),
    activities: z.array(z.object({ name: z.string().max(100), status: z.enum(['does', 'used_to', 'wants_to']), hobbyId: z.string().optional() })).max(30),
    preferences: z.object({
      company: z.enum(['solo', 'group', 'either']).optional(),
      setting: z.enum(['indoor', 'outdoor', 'either']).optional(),
      budget: z.number().optional(),
      maxMiles: z.number().optional(),
      notes: z.array(z.string().max(120)).max(20),
    }),
    area: z.object({ label: z.string().max(120), lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180), sample: z.boolean().optional() }),
    traits: z.array(z.string().max(60)).max(8).optional(),
  }),
});

/**
 * Runs the planner and streams newline-delimited JSON events:
 *   {"type":"step","step":{...}}   one per agent step
 *   {"type":"plan","plan":{...}}   the finished plan
 *   {"type":"error","message":"..."}
 */
export async function POST(req: Request) {
  const caller = await guard(req, 'mission');
  if (caller instanceof Response) return caller;

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Invalid request.' }, { status: 400 });
  const { request, mode, date, part, moods, avoidPlaceIds, avoidStrict, profile } = parsed.data;

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: object) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
      try {
        const plan = await runPlanner(
          { request, mode, date, part, moods, avoidPlaceIds, avoidStrict, ...profile },
          { model: getAnthropic().beta.messages, qloo: getQloo(), onEvent: send, scout: osmPlaceScout },
        );
        send({ type: 'plan', plan });
      } catch (err) {
        const status = err instanceof Anthropic.APIError ? err.status : undefined;
        console.error('Mission failed', status ?? '', err instanceof Error ? err.message : err);
        send({
          type: 'error',
          message:
            err instanceof PlannerDataError
              ? `Echo can't look up places near ${profile.area.label} right now. Try again later, or switch your area to the sample one.`
              : status === 429 || status === 529
                ? 'Echo is busy right now. Try again in a moment.'
                : "Echo couldn't finish this plan. Try again.",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { 'content-type': 'application/x-ndjson; charset=utf-8', 'cache-control': 'no-store' } });
}

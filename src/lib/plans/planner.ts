import type Anthropic from '@anthropic-ai/sdk';
import { MODELS } from '@/lib/ai/models';
import type { HeardTaste } from '@/lib/onboarding/types';
import type { Activity, Area, Preferences } from '@/lib/profile/types';
import { signalIds } from '@/lib/profile/types';
import type { QlooClient } from '@/lib/qloo/client';
import { QlooOfflineError } from '@/lib/qloo/errors';
import { PLACE_CATEGORIES, placeCategory } from '@/lib/qloo/tags';
import type { PlaceSummary } from '@/lib/qloo/types';
import { hoursOn, isOpenAt, weekdayOf } from './time';
import type { PlanMode, PlanStop, Step } from './types';

export interface PlannerInput {
  request: string;
  mode: Exclude<PlanMode, 'group'>;
  date: string;
  tastes: HeardTaste[];
  activities: Activity[];
  preferences: Preferences;
  area: Area;
  traits?: string[];
}

export interface PlannerResult {
  title: string;
  summary: string;
  hobbyId?: string;
  stops: PlanStop[];
  backup?: PlanStop;
}

export type PlannerEvent = { type: 'step'; step: Step };

type BetaMessages = Pick<Anthropic['beta']['messages'], 'create'>;
type QlooPlaces = Pick<QlooClient, 'findPlaces' | 'findTags'>;

const METERS_PER_MILE = 1609.34;
const MAX_MODEL_TURNS = 10;

export const PLANNER_SYSTEM = `You are Echo's planner. You plan real outings for one person, grounded in Qloo's taste graph and the places it returns.

Rules:
- Every place in a plan must come from a find_places result in this conversation. Never invent places, opening hours, prices, classes, events, or schedules.
- Place results include distance in miles, a price level from 1 to 4 when known (often missing), opening hours for the plan's day when known, and a match score showing how well the place fits their taste.
- Respect their limits: distance, budget (treat price level 1 as under $15, 2 as $15-40, 3 as $40-80, 4 as over $80, and don't rule a place out just because price is unknown), and any notes such as "prefers quiet places".

How to work:
1. Pick three or four candidate categories that fit the request. Favor activities they want to try or already do, then categories that fit their tastes. Use the category ids listed below. If an activity isn't listed, call search_categories to find a place category tag for it.
2. Call find_places for each candidate. Calling several at once is fine.
3. Use rule_out for each option you set aside, with a short, specific reason (for example "nothing open on Saturday" or "classes over $40").
4. Call finish_plan.

For a hobby mission: one main stop plus a backup from a different category. For a full day: three or four stops in a sensible order with realistic times, mostly close together. Every time must fall within the place's opening hours when hours are known.

Writing:
- summary is spoken to the person: one or two sentences, under 35 words, second person, no lists.
- why is a short phrase linking the place to their taste, such as "quiet, small-group vibe; fits your craft side".
- If class times matter, say to check the place's website rather than guessing.

Category ids:
${PLACE_CATEGORIES.map((c) => `- ${c.id}: ${c.label}`).join('\n')}`;

const TOOLS: Anthropic.Beta.BetaTool[] = [
  {
    name: 'find_places',
    description:
      "Finds places of one category near the person, ranked by how well they fit the person's taste. Returns up to five places with distance, price level, opening hours on the plan's day, match score, and why they match.",
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', description: 'A category id from the list, or a place category tag from search_categories.' },
        purpose: { type: 'string', description: 'A few words on why this category fits them.' },
      },
      required: ['category', 'purpose'],
      additionalProperties: false,
    },
  },
  {
    name: 'search_categories',
    description: "Looks up Qloo place category tags for an activity that isn't in the category list, such as 'yoga' or 'bouldering'.",
    strict: true,
    input_schema: {
      type: 'object',
      properties: { query: { type: 'string' } },
      required: ['query'],
      additionalProperties: false,
    },
  },
  {
    name: 'rule_out',
    description: 'Records an option you decided against and why. Shown to the person as part of your work.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { option: { type: 'string' }, reason: { type: 'string' } },
      required: ['option', 'reason'],
      additionalProperties: false,
    },
  },
  {
    name: 'finish_plan',
    description: 'Submits the final plan. Every place_id must come from find_places results.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Short name for the plan, like "Wheel pottery" or "A slow Saturday".' },
        summary: { type: 'string' },
        stops: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              place_id: { type: 'string' },
              time: { type: 'string', description: '24-hour local time, HH:MM.' },
              why: { type: 'string' },
            },
            required: ['place_id', 'time', 'why'],
            additionalProperties: false,
          },
        },
        backup: {
          anyOf: [
            {
              type: 'object',
              properties: { place_id: { type: 'string' }, why: { type: 'string' } },
              required: ['place_id', 'why'],
              additionalProperties: false,
            },
            { type: 'null' },
          ],
        },
      },
      required: ['title', 'summary', 'stops', 'backup'],
      additionalProperties: false,
    },
  },
];

interface FoundPlace {
  place: PlaceSummary;
  categoryId?: string;
  categoryLabel: string;
  hoursThatDay?: string;
}

function describeProfile(input: PlannerInput): string {
  const p = input.preferences;
  const prefs = [
    p.company && `prefers going ${p.company === 'either' ? 'solo or with people' : p.company === 'solo' ? 'solo' : 'with people'}`,
    p.setting && `setting: ${p.setting}`,
    p.budget !== undefined && `budget about $${p.budget} per outing`,
    p.maxMiles !== undefined && `will travel up to ${p.maxMiles} miles`,
    ...p.notes,
  ].filter(Boolean);
  return [
    `Request: ${input.request}`,
    `Mode: ${input.mode === 'hobby' ? 'hobby mission (one main stop plus a backup)' : 'full day out (three or four stops)'}`,
    `Day: ${weekdayOf(input.date)} ${input.date}`,
    `Area: ${input.area.label}`,
    `Tastes: ${input.tastes.map((t) => t.entity?.name ?? t.name).join(', ') || 'none yet'}`,
    `Traits: ${input.traits?.join(', ') || 'unknown'}`,
    `Activities: ${input.activities.map((a) => `${a.name} (${a.status.replace('_', ' ')})`).join(', ') || 'none mentioned'}`,
    `Preferences: ${prefs.join('; ') || 'none stated'}`,
  ].join('\n');
}

export async function runPlanner(
  input: PlannerInput,
  deps: { model: BetaMessages; qloo: QlooPlaces; onEvent: (e: PlannerEvent) => void },
): Promise<PlannerResult> {
  const emit = (step: Step) => deps.onEvent({ type: 'step', step });
  const ids = signalIds(input.tastes);
  const names = new Map(input.tastes.flatMap((t) => (t.entity ? [[t.entity.id, t.entity.name] as const] : [])));
  const day = weekdayOf(input.date);
  // A fixed 8 km search radius keeps requests cacheable; longer limits widen it.
  const maxMiles = input.preferences.maxMiles;
  const radiusMeters = maxMiles && maxMiles > 5 ? Math.round(maxMiles * METERS_PER_MILE) : 8000;
  const found = new Map<string, FoundPlace>();

  const traitText = input.traits?.length ? input.traits.slice(0, 3).join(', ').toLowerCase() : input.tastes.slice(0, 3).map((t) => t.entity?.name ?? t.name).join(', ');
  emit({ kind: 'ok', text: `Read your echo: ${traitText || 'no tastes yet'}` });

  async function findPlaces(categoryArg: string): Promise<{ content: string; isError?: boolean }> {
    const known = placeCategory(categoryArg);
    const tag = known?.placeTag ?? (categoryArg.startsWith('urn:tag:') ? categoryArg : undefined);
    if (!tag) return { content: `Unknown category "${categoryArg}". Use an id from the list or a tag from search_categories.`, isError: true };
    const label = known?.places ?? categoryArg.split(':').pop()!.replace(/_/g, ' ');

    let places: PlaceSummary[];
    try {
      places = await deps.qloo.findPlaces({
        near: { lat: input.area.lat, lon: input.area.lon },
        tags: [tag],
        signals: { entities: ids },
        radiusMeters,
        take: 5,
        explain: true,
      });
    } catch (err) {
      emit({ kind: 'dropped', text: `Couldn't reach Qloo for ${label}` });
      const offline = err instanceof QlooOfflineError;
      return { content: offline ? 'Place data for this search is unavailable right now. Try other categories or finish with what you have.' : 'Place search failed.', isError: true };
    }

    const limit = maxMiles ?? Infinity;
    const usable = places.filter((p) => p.distanceMeters === undefined || p.distanceMeters / METERS_PER_MILE <= limit);
    emit(
      usable.length
        ? { kind: 'ok', text: `Found ${usable.length} ${label} near you` }
        : { kind: 'info', text: `No ${label} within reach` },
    );

    const rows = usable.map((p) => {
      const hoursThatDay = hoursOn(p.hours, day);
      found.set(p.id, { place: p, categoryId: known?.id, categoryLabel: known?.label ?? label, hoursThatDay });
      const because = p.reasons
        .filter((r) => r.kind === 'entity' && names.has(r.id))
        .slice(0, 2)
        .map((r) => names.get(r.id));
      return {
        place_id: p.id,
        name: p.name,
        miles: p.distanceMeters !== undefined ? Math.round((p.distanceMeters / METERS_PER_MILE) * 10) / 10 : null,
        price_level: p.priceLevel ?? null,
        [`hours_${day}`]: hoursThatDay ?? 'unknown',
        match: p.affinity !== undefined ? Math.round(p.affinity * 100) : null,
        matches_tastes: because,
        tags: p.tags.slice(0, 5),
        description: p.description ?? null,
      };
    });
    return { content: JSON.stringify(rows.length ? rows : { note: `No ${label} found within reach.` }) };
  }

  async function searchCategories(query: string): Promise<{ content: string; isError?: boolean }> {
    try {
      const tags = await deps.qloo.findTags({ query, take: 10 });
      const categories = tags.filter((t) => t.id.startsWith('urn:tag:category:place:')).slice(0, 5);
      return { content: JSON.stringify(categories.length ? categories.map((t) => ({ tag: t.id, name: t.name })) : { note: 'No place categories found.' }) };
    } catch {
      return { content: 'Category search is unavailable right now. Use the listed categories.', isError: true };
    }
  }

  function toStop(placeId: string, time: string | undefined, why: string): PlanStop {
    const f = found.get(placeId)!;
    const p = f.place;
    return {
      placeId,
      name: p.name,
      time,
      category: f.categoryLabel,
      distanceMiles: p.distanceMeters !== undefined ? Math.round((p.distanceMeters / METERS_PER_MILE) * 10) / 10 : undefined,
      address: p.address,
      website: p.website,
      hoursThatDay: f.hoursThatDay,
      priceLevel: p.priceLevel,
      matchPercent: p.affinity !== undefined ? Math.round(p.affinity * 100) : undefined,
      why: why.trim(),
      location: p.location,
    };
  }

  /** Checks a submitted plan. Returns problems for the model to fix, or the result. */
  function validate(raw: any): { problems: string[]; result?: PlannerResult } {
    const problems: string[] = [];
    const stops: Array<{ place_id: string; time: string; why: string }> = Array.isArray(raw?.stops) ? raw.stops : [];
    const want = input.mode === 'hobby' ? [1, 1] : [2, 5];
    if (stops.length < want[0]! || stops.length > want[1]!) problems.push(`Include ${input.mode === 'hobby' ? 'exactly one stop' : 'three or four stops'}.`);
    for (const s of stops) {
      const f = found.get(s.place_id);
      if (!f) {
        problems.push(`place_id ${s.place_id} didn't come from find_places.`);
        continue;
      }
      if (!/^\d{2}:\d{2}$/.test(s.time)) problems.push(`Time for ${f.place.name} must be HH:MM.`);
      else if (isOpenAt(f.hoursThatDay, s.time) === false) problems.push(`${f.place.name} isn't open at ${s.time} on ${day} (hours: ${f.hoursThatDay}).`);
    }
    if (raw?.backup && !found.has(raw.backup.place_id)) problems.push(`Backup place_id ${raw.backup.place_id} didn't come from find_places.`);
    if (problems.length) return { problems };

    const firstCategory = found.get(stops[0]!.place_id)?.categoryId;
    return {
      problems,
      result: {
        title: String(raw.title || 'Your plan').trim(),
        summary: String(raw.summary || '').trim(),
        hobbyId: input.mode === 'hobby' ? firstCategory : undefined,
        stops: stops.map((s) => toStop(s.place_id, s.time, s.why)),
        backup: raw.backup ? toStop(raw.backup.place_id, undefined, raw.backup.why) : undefined,
      },
    };
  }

  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: describeProfile(input) }];

  for (let turn = 0; turn < MAX_MODEL_TURNS; turn++) {
    const res = await deps.model.create({
      model: MODELS.planner,
      max_tokens: 8000,
      system: PLANNER_SYSTEM,
      tools: TOOLS,
      messages,
      output_config: { effort: 'medium' },
      // Re-runs on another model if a safety classifier declines.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });

    if (res.stop_reason === 'refusal') throw new Error('The planner declined this request.');
    messages.push({ role: 'assistant', content: res.content });
    const calls = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
    if (calls.length === 0) {
      messages.push({ role: 'user', content: 'Call finish_plan with your plan, using places from find_places.' });
      continue;
    }

    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    let finished: PlannerResult | undefined;
    // Searches run in parallel; the client spaces live Qloo calls.
    await Promise.all(
      calls.map(async (call) => {
        const args = call.input as Record<string, any>;
        let out: { content: string; isError?: boolean };
        if (call.name === 'find_places') {
          out = await findPlaces(String(args.category ?? ''));
        } else if (call.name === 'search_categories') {
          out = await searchCategories(String(args.query ?? ''));
        } else if (call.name === 'rule_out') {
          emit({ kind: 'dropped', text: `Dropped ${String(args.option)}: ${String(args.reason)}` });
          out = { content: 'Noted.' };
        } else if (call.name === 'finish_plan') {
          const { problems, result } = validate(args);
          if (result) {
            finished = result;
            out = { content: 'Plan accepted.' };
          } else {
            out = { content: `Fix these and call finish_plan again:\n- ${problems.join('\n- ')}`, isError: true };
          }
        } else {
          out = { content: `Unknown tool ${call.name}.`, isError: true };
        }
        results.push({ type: 'tool_result', tool_use_id: call.id, content: out.content, is_error: out.isError });
      }),
    );

    if (finished) {
      if (finished.stops.some((s) => s.hoursThatDay)) emit({ kind: 'ok', text: `Checked ${day[0]!.toUpperCase()}${day.slice(1)} hours for the picks` });
      return finished;
    }
    // Keep results in the order of the calls.
    results.sort((a, b) => calls.findIndex((c) => c.id === a.tool_use_id) - calls.findIndex((c) => c.id === b.tool_use_id));
    messages.push({ role: 'user', content: results });
  }
  throw new Error('The planner ran out of steps before finishing.');
}

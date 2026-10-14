import type Anthropic from '@anthropic-ai/sdk';
import { MODELS } from '@/lib/ai/models';
import type { HeardTaste } from '@/lib/onboarding/types';
import type { Activity, Area, Preferences } from '@/lib/profile/types';
import { signalIds } from '@/lib/profile/types';
import type { QlooClient } from '@/lib/qloo/client';
import { QlooBudgetError, QlooOfflineError } from '@/lib/qloo/errors';
import type { PlaceScout } from './place-scout';
import { PLACE_CATEGORIES, VIBE_TAGS, placeCategory } from '@/lib/qloo/tags';
import type { PlaceSummary } from '@/lib/qloo/types';
import { hoursOn, isOpenAt, weekdayOf } from './time';
import type { DroppedOption, PlaceCard, PlanMode, PlanStop, Step } from './types';
import { PART_WINDOWS, type DayPart } from './when';

export type Mood = keyof typeof VIBE_TAGS;

export interface PlannerInput {
  request: string;
  mode: Exclude<PlanMode, 'group'>;
  date: string;
  part: DayPart;
  moods?: Mood[];
  /** Places from recent plans to skip, unless the person loved them. */
  avoidPlaceIds?: string[];
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
  dropped: DroppedOption[];
}

export type PlannerEvent =
  | { type: 'step'; step: Step }
  | { type: 'status'; text: string }
  | { type: 'places'; category: string; places: PlaceCard[] }
  | { type: 'dropped'; option: DroppedOption };

type BetaMessages = Pick<Anthropic['beta']['messages'], 'create'>;
type QlooPlaces = Pick<QlooClient, 'findPlaces' | 'findTags'>;

const METERS_PER_MILE = 1609.34;
const MAX_MODEL_TURNS = 10;

const MOOD_WORDS: Record<Mood, string> = {
  quiet: 'quiet',
  cozy: 'cozy',
  soloFriendly: 'good to go to alone',
  handsOn: 'hands-on',
  goodForGroups: 'good for groups',
};

export const PLANNER_SYSTEM = `You are Echo's planner. You plan real outings for one person, grounded in Qloo's taste graph and the places it returns.

Rules:
- Every place in a plan must come from a find_places result in this conversation. Never invent places, opening hours, prices, classes, events, or schedules.
- Results with a "source" field come from OpenStreetMap, used while Qloo has no data for the area: real places with no match score, and hours only when listed. Prefer Qloo results when you have both, judge fit from the name and kind, and when hours are unknown pick ordinary times and mention that hours are worth checking.
- Place results include distance in miles, a price level from 1 to 4 when known (often missing), opening hours for the plan's day when known, and a match score showing how well the place fits their taste.
- Respect their limits: budget (treat price level 1 as under $15, 2 as $15-40, 3 as $40-80, 4 as over $80, and don't rule a place out just because price is unknown), the time window, any moods they picked, and notes such as "prefers quiet places".

How to work:
1. Pick three or four candidate categories that fit the request. Favor activities they want to try or already do, then categories that fit their tastes. Use the category ids listed below. If an activity isn't listed, call search_categories to find a place category tag for it.
2. Call find_places for each candidate. Calling several at once is fine.
3. Use rule_out for each option you set aside, with a short, specific reason (for example "closed on Tuesday evenings" or "loud basement bar with DJs; not quiet"). Name the place exactly as find_places did.
4. Call finish_plan.

What they ask for comes first. If the request or their "want to try" list names an activity, plan that activity. Places marked beyond_usual_distance are past their usual range: pick one only when it's the thing they asked for or want to try and nothing closer fits, and say how far it is in the summary ("it's 6 miles, a bit farther than usual"). Never quietly swap what they asked for for something else; if nothing fits at all, say so in the summary and offer the closest alternative.

Drop results that don't belong in their category or don't suit an adult outing (a golf course listed as a café, a children's store for an adult) with rule_out.

For a hobby mission: one main stop plus a backup from a different category. For a full day: three or four stops in a sensible order with realistic times, mostly close together. Every time must fall inside the time window and within the place's opening hours when hours are known.

Writing:
- summary is spoken to the person: one or two sentences, under 35 words, second person, no lists.
- Write times for people in 12-hour form ("6pm", "10:30pm"), never 24-hour, in summary, why and rule_out reasons. finish_plan times stay HH:MM.
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

const miles = (p: PlaceSummary) => (p.distanceMeters !== undefined ? Math.round((p.distanceMeters / METERS_PER_MILE) * 10) / 10 : undefined);

function describeProfile(input: PlannerInput): string {
  const p = input.preferences;
  const [from, to] = PART_WINDOWS[input.part];
  const prefs = [
    p.company && `prefers going ${p.company === 'either' ? 'solo or with people' : p.company === 'solo' ? 'solo' : 'with people'}`,
    p.setting && `setting: ${p.setting}`,
    p.budget !== undefined && `budget about $${p.budget} per outing`,
    p.maxMiles !== undefined && `usually travels up to ${p.maxMiles} miles`,
    ...p.notes,
  ].filter(Boolean);
  return [
    `Request: ${input.request}`,
    `Mode: ${input.mode === 'hobby' ? 'hobby mission (one main stop plus a backup)' : 'full day out (three or four stops)'}`,
    `Day: ${weekdayOf(input.date)} ${input.date}`,
    `Time window: ${input.part === 'any' ? 'any time of day' : input.part} (${from}-${to})`,
    input.moods?.length ? `Moods they picked: ${input.moods.map((m) => MOOD_WORDS[m]).join(', ')}` : '',
    `Area: ${input.area.label}`,
    `Tastes: ${input.tastes.map((t) => t.entity?.name ?? t.name).join(', ') || 'none yet'}`,
    `Traits: ${input.traits?.join(', ') || 'unknown'}`,
    `Wants to try: ${input.activities.filter((a) => a.status === 'wants_to').map((a) => a.name).join(', ') || 'nothing named'}`,
    `Already does: ${input.activities.filter((a) => a.status !== 'wants_to').map((a) => a.name).join(', ') || 'nothing named'}`,
    `Preferences: ${prefs.join('; ') || 'none stated'}`,
  ]
    .filter(Boolean)
    .join('\n');
}

function inWindow(time: string, part: DayPart): boolean {
  const [from, to] = PART_WINDOWS[part];
  return time >= from && time <= to;
}

/** No place data could be fetched for this person's area, usually because live Qloo calls are off. */
export class PlannerDataError extends Error {
  constructor() {
    super('No place data for this area.');
    this.name = 'PlannerDataError';
  }
}

export async function runPlanner(
  input: PlannerInput,
  deps: { model: BetaMessages; qloo: QlooPlaces; onEvent: (e: PlannerEvent) => void; scout?: PlaceScout },
): Promise<PlannerResult> {
  const emit = (step: Step) => deps.onEvent({ type: 'step', step });
  const status = (text: string) => deps.onEvent({ type: 'status', text });
  const ids = signalIds(input.tastes);
  const names = new Map(input.tastes.flatMap((t) => (t.entity ? [[t.entity.id, t.entity.name] as const] : [])));
  const moodTags = (input.moods ?? []).map((m) => VIBE_TAGS[m]).filter(Boolean);
  const avoid = new Set(input.avoidPlaceIds ?? []);
  const day = weekdayOf(input.date);
  // A fixed 8 km search radius keeps requests cacheable; longer limits widen it.
  const maxMiles = input.preferences.maxMiles;
  const radiusMeters = maxMiles && maxMiles > 5 ? Math.round(maxMiles * METERS_PER_MILE) : 8000;
  const found = new Map<string, FoundPlace>();
  let unavailable = 0; // Searches that failed because place data couldn't be fetched.
  const dropped: DroppedOption[] = [];

  const traitText = input.traits?.length ? input.traits.slice(0, 3).join(', ').toLowerCase() : input.tastes.slice(0, 3).map((t) => t.entity?.name ?? t.name).join(', ');
  emit({ kind: 'ok', text: `Read your echo: ${traitText || 'no tastes yet'}` });

  function because(p: PlaceSummary): string[] {
    return p.reasons
      .filter((r) => r.kind === 'entity' && names.has(r.id))
      .slice(0, 2)
      .map((r) => names.get(r.id)!);
  }

  async function scout(categoryId: string | undefined, label: string): Promise<PlaceSummary[]> {
    try {
      return await deps.scout!({ categoryId, places: label, area: input.area });
    } catch (err) {
      console.error('Place scout failed', err instanceof Error ? err.message : err);
      return [];
    }
  }

  async function findPlaces(categoryArg: string): Promise<{ content: string; isError?: boolean }> {
    const known = placeCategory(categoryArg);
    const tag = known?.placeTag ?? (categoryArg.startsWith('urn:tag:') ? categoryArg : undefined);
    if (!tag) return { content: `Unknown category "${categoryArg}". Use an id from the list or a tag from search_categories.`, isError: true };
    const label = known?.places ?? categoryArg.split(':').pop()!.replace(/_/g, ' ');
    status(`Searching ${label} near ${input.area.label}`);

    const search = (radius: number) =>
      deps.qloo.findPlaces({
        near: { lat: input.area.lat, lon: input.area.lon },
        tags: [tag],
        // Moods boost matching places instead of filtering everything else out.
        signals: { entities: ids, tags: moodTags.length ? moodTags : undefined },
        radiusMeters: radius,
        take: 5,
        explain: true,
      });
    let places: PlaceSummary[];
    try {
      places = await search(radiusMeters);
      // Nothing close: look twice as far rather than giving up on what they asked for.
      if (!places.some((p) => !avoid.has(p.id))) {
        const wider = await search(radiusMeters * 2).catch(() => []);
        if (wider.length) {
          places = wider;
          emit({ kind: 'info', text: `Nothing close, so I looked farther for ${label}` });
        }
      }
      // Qloo has nothing at all for this category here: real places from OpenStreetMap instead.
      if (!places.length && deps.scout) {
        const scouted = await scout(known?.id, label);
        if (scouted.length) {
          places = scouted;
          emit({ kind: 'info', text: `Qloo had no ${label} here, so I checked OpenStreetMap` });
        }
      }
    } catch (err) {
      const offline = err instanceof QlooOfflineError || err instanceof QlooBudgetError;
      // No Qloo data: ask Claude for places it knows, marked unverified.
      const scouted = offline && deps.scout ? await scout(known?.id, label) : [];
      if (scouted.length) {
        places = scouted;
        emit({ kind: 'info', text: `Qloo has no data here yet, so I found ${label} on OpenStreetMap` });
      } else {
        emit({ kind: 'dropped', text: `Couldn't reach Qloo for ${label}` });
        if (offline) unavailable++;
        return { content: offline ? 'Place data for this search is unavailable right now. Try other categories or finish with what you have.' : 'Place search failed.', isError: true };
      }
    }

    // Up to twice their usual distance is allowed but flagged; the planner only goes there for something they asked for.
    const limit = maxMiles ? maxMiles * 2 : Infinity;
    const usual = maxMiles ?? radiusMeters / METERS_PER_MILE;
    const recent = places.filter((p) => avoid.has(p.id));
    const usable = places.filter((p) => !avoid.has(p.id) && (p.distanceMeters === undefined || p.distanceMeters / METERS_PER_MILE <= limit));
    emit(usable.length ? { kind: 'ok', text: usable.length === 1 ? `Found one of the ${label} near you` : `Found ${usable.length} ${label} near you` } : { kind: 'info', text: `No ${label} within reach` });
    if (recent.length) emit({ kind: 'info', text: `Skipped ${recent.map((p) => p.name).join(', ')}: already in your plans` });

    const cards: PlaceCard[] = [];
    const rows = usable.map((p) => {
      const hoursThatDay = hoursOn(p.hours, day);
      found.set(p.id, { place: p, categoryId: known?.id, categoryLabel: known?.label ?? label, hoursThatDay });
      const tasteReasons = because(p);
      cards.push({
        id: p.id,
        name: p.name,
        category: known?.label ?? label,
        miles: miles(p),
        priceLevel: p.priceLevel,
        matchPercent: p.affinity !== undefined ? Math.round(p.affinity * 100) : undefined,
        reason: p.unverified ? p.description : tasteReasons.length ? `Because you like ${tasteReasons.join(' and ')}` : undefined,
        hoursThatDay,
        unverified: p.unverified,
      });
      return {
        place_id: p.id,
        name: p.name,
        miles: miles(p) ?? null,
        price_level: p.priceLevel ?? null,
        [`hours_${day}`]: hoursThatDay ?? 'unknown',
        match: p.affinity !== undefined ? Math.round(p.affinity * 100) : null,
        ...(p.distanceMeters !== undefined && p.distanceMeters / METERS_PER_MILE > usual ? { beyond_usual_distance: true } : {}),
        matches_tastes: tasteReasons,
        tags: p.tags.slice(0, 5),
        description: p.description ?? null,
        ...(p.unverified ? { source: 'OpenStreetMap: a real place, but with no taste match score. Judge the fit from its name and kind.' } : {}),
      };
    });
    if (cards.length) deps.onEvent({ type: 'places', category: known?.label ?? label, places: cards });
    return { content: JSON.stringify(rows.length ? rows : { note: `No ${label} found within reach.` }) };
  }

  async function searchCategories(query: string): Promise<{ content: string; isError?: boolean }> {
    status(`Looking up places for ${query}`);
    try {
      const tags = await deps.qloo.findTags({ query, take: 10 });
      const categories = tags.filter((t) => t.id.startsWith('urn:tag:category:place:')).slice(0, 5);
      return { content: JSON.stringify(categories.length ? categories.map((t) => ({ tag: t.id, name: t.name })) : { note: 'No place categories found.' }) };
    } catch {
      return { content: 'Category search is unavailable right now. Use the listed categories.', isError: true };
    }
  }

  function ruleOut(option: string, reason: string) {
    const needle = option.trim().toLowerCase();
    const match = [...found.values()].find((f) => f.place.name.toLowerCase() === needle) ?? [...found.values()].find((f) => needle.includes(f.place.name.toLowerCase()) || f.place.name.toLowerCase().includes(needle));
    const d: DroppedOption = { name: match?.place.name ?? option.trim(), reason: reason.trim(), placeId: match?.place.id };
    dropped.push(d);
    emit({ kind: 'dropped', text: `Dropped ${d.name}: ${d.reason}` });
    deps.onEvent({ type: 'dropped', option: d });
  }

  function toStop(placeId: string, time: string | undefined, why: string): PlanStop {
    const f = found.get(placeId)!;
    const p = f.place;
    return {
      placeId,
      name: p.name,
      time,
      category: f.categoryLabel,
      distanceMiles: miles(p),
      address: p.address,
      website: p.website,
      hoursThatDay: f.hoursThatDay,
      priceLevel: p.priceLevel,
      matchPercent: p.affinity !== undefined ? Math.round(p.affinity * 100) : undefined,
      why: why.trim(),
      location: p.location,
      unverified: p.unverified,
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
      else {
        if (isOpenAt(f.hoursThatDay, s.time) === false) problems.push(`${f.place.name} isn't open at ${s.time} on ${day} (hours: ${f.hoursThatDay}).`);
        if (!inWindow(s.time, input.part)) problems.push(`${s.time} is outside the ${input.part} window (${PART_WINDOWS[input.part].join('-')}).`);
      }
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
        dropped,
      },
    };
  }

  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: 'user', content: describeProfile(input) }];

  for (let turn = 0; turn < MAX_MODEL_TURNS; turn++) {
    status(turn === 0 ? 'Choosing what to look for' : 'Comparing options');
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
          ruleOut(String(args.option ?? ''), String(args.reason ?? ''));
          out = { content: 'Noted.' };
        } else if (call.name === 'finish_plan') {
          status('Checking hours and times');
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

    // Nothing found and the searches can't reach place data: stop rather than spend more model turns.
    if (!finished && found.size === 0 && unavailable >= 3) throw new PlannerDataError();
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

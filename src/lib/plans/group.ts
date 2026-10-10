import type Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { MODELS } from '@/lib/ai/models';
import type { Area } from '@/lib/profile/types';
import type { QlooClient } from '@/lib/qloo/client';
import { placeCategory } from '@/lib/qloo/tags';
import type { CompareResult, PlaceSummary } from '@/lib/qloo/types';
import { hoursOn, isOpenAt, weekdayOf } from './time';
import type { GroupTurn, PlaceCard, PlanStop, Step } from './types';
import { PART_WINDOWS, type DayPart } from './when';

const METERS_PER_MILE = 1609.34;

export interface Person {
  id: string;
  name: string;
  /** Qloo entity IDs for this person's tastes, in the order heard. */
  ids: string[];
  /** Hobby ids from activities they do or want to try. */
  hobbyIds?: string[];
  notes?: string[];
  /** What they love in their own words, for friends without an echo whose tastes aren't matched yet. */
  loves?: string[];
  /** Names of a few of their favorites, so the writer can speak for them. */
  tasteNames?: string[];
}

// ---------------------------------------------------------------------------
// Comparing tastes

export interface GroupComparison {
  shared: string[];
  differences: Array<{ personId: string; tags: string[] }>;
  picks: Array<{ id: string; name: string; year?: number; type: string }>;
  /** True when Qloo couldn't be reached and this was worked out from the profiles alone. */
  rough?: boolean;
}

// Tag kinds that say something about taste. Compare also returns occupations,
// languages, regions, ethnicity, platforms and so on, which don't belong here.
const TASTE_TAG_KINDS = /^urn:tag:(genre|subgenre|theme|style|hobby|emotional_tone|aesthetic_property|audience)(:|$)/;

function topNames(tags: CompareResult['shared'], n: number, exclude: string[] = []): string[] {
  const seen = new Set<string>(exclude.map((e) => e.toLowerCase().replace(/[^a-z]/g, '')));
  const out: string[] = [];
  for (const t of tags) {
    if (!t.name || !TASTE_TAG_KINDS.test(t.type)) continue;
    const key = t.name.toLowerCase().replace(/[^a-z]/g, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t.name.replace(/,\s*$/, ''));
    if (out.length === n) break;
  }
  return out;
}

const PICK_TYPES = ['movie', 'tv_show', 'book'] as const;

/** Without Qloo: what everyone named in common, and the hobbies everyone shares. */
function roughComparison(people: Person[]): GroupComparison {
  const common = <T,>(lists: T[][]) => (lists[0] ?? []).filter((x) => lists.every((l) => l.includes(x)));
  const sameFavorites = common(people.map((p) => p.ids)).length;
  const shared = [
    ...(sameFavorites ? [`${sameFavorites} of the same favorites`] : []),
    ...common(people.map((p) => p.hobbyIds ?? [])).map((h) => placeCategory(h)?.label ?? h),
  ];
  return {
    shared,
    differences: people.map((p) => ({ personId: p.id, tags: (p.loves ?? []).slice(0, 3) })),
    picks: [],
    rough: true,
  };
}

export async function compareGroup(people: Person[], qloo: Pick<QlooClient, 'compare' | 'recommend'>): Promise<GroupComparison> {
  const [you, ...everyoneElse] = people;
  if (!you || everyoneElse.length === 0) throw new Error('Add at least one friend to compare.');
  // Friends without matched tastes can't be compared on Qloo; they show what they love instead.
  const others = everyoneElse.filter((p) => p.ids.length > 0);
  const unmatched = everyoneElse.filter((p) => p.ids.length === 0).map((p) => ({ personId: p.id, tags: (p.loves ?? []).slice(0, 3) }));
  const othersIds = others.flatMap((p) => p.ids);
  if (you.ids.length === 0 || othersIds.length === 0) return roughComparison(people);

  let overall: CompareResult;
  let pairs: CompareResult[];
  try {
    [overall, ...pairs] = (await Promise.all([
      qloo.compare({ a: you.ids, b: othersIds, take: 10 }),
      ...(others.length > 1 ? others.map((o) => qloo.compare({ a: you.ids, b: o.ids, take: 10 })) : []),
    ])) as [CompareResult, ...CompareResult[]];
  } catch {
    return roughComparison(people);
  }
  const shared = topNames(overall.shared, 6);
  const differences = [
    { personId: you.id, tags: topNames(overall.onlyA, 3, shared) },
    ...others.map((o, i) => ({ personId: o.id, tags: topNames((others.length > 1 ? pairs[i]! : overall).onlyB, 3, shared) })),
    ...unmatched,
  ];

  // One pick of each kind everyone should like. Picks are a nice extra; the comparison stands without them.
  const known = new Set(people.flatMap((p) => p.ids));
  const picks = (
    await Promise.all(
      PICK_TYPES.map(async (type) => {
        try {
          const found = await qloo.recommend({ type, signals: { entities: people.flatMap((p) => p.ids) }, take: 8, explain: false });
          const pick = found.find((m) => !known.has(m.id));
          return pick ? [{ id: pick.id, name: pick.name, year: pick.year, type }] : [];
        } catch {
          return [];
        }
      }),
    )
  ).flat();
  return { shared, differences, picks };
}

// ---------------------------------------------------------------------------
// Planning together

export interface ScoredPlace {
  place: PlaceSummary;
  categoryLabel: string;
  hoursThatDay?: string;
  /** Estimated fit per person, 0 to 99. */
  fit: Record<string, number>;
}

/**
 * Estimates how well a place fits each person. Qloo's explainability says how
 * much each input entity contributed to the match; a person whose tastes drove
 * more of it fits better. With an even split everyone gets the overall match.
 * Someone who contributed nothing still gets half of it: that means their
 * tastes didn't drive the match, not that they'd dislike the place.
 */
export function personalFit(place: PlaceSummary, people: Person[]): Record<string, number> {
  const owner = new Map<string, string>();
  for (const p of people) for (const id of p.ids) owner.set(id, p.id);
  const total = place.reasons.filter((r) => r.kind === 'entity').reduce((s, r) => s + r.score, 0);
  const affinity = place.affinity ?? 0.5;
  const out: Record<string, number> = {};
  for (const p of people) {
    const mine = place.reasons.filter((r) => r.kind === 'entity' && owner.get(r.id) === p.id).reduce((s, r) => s + r.score, 0);
    const share = total > 0 ? mine / total : 1 / people.length;
    out[p.id] = Math.min(99, Math.round(100 * affinity * (0.5 + 0.5 * Math.sqrt(share * people.length))));
  }
  return out;
}

const DEFAULT_CATEGORIES = ['board_games', 'records', 'film', 'books', 'cafe'];

// Words in a request that point at a category.
const REQUEST_WORDS: Record<string, RegExp> = {
  pottery: /pott|ceramic|clay|wheel/i,
  board_games: /board ?game|games? night|game caf/i,
  climbing: /climb|boulder/i,
  records: /record|vinyl/i,
  books: /book|read/i,
  art: /\bart|draw|paint|sketch/i,
  film: /film|movie|cinema/i,
  live_music: /music|concert|gig|\bshow|band/i,
  cafe: /coffee|caf[eé]|brunch|tea\b/i,
};

/** Up to four categories: those the request names, then everyone's hobbies, then defaults. */
export function groupCategories(request: string, people: Person[]): string[] {
  const asked = Object.entries(REQUEST_WORDS).filter(([, re]) => re.test(request)).map(([id]) => id);
  return [...new Set([...asked, ...people.flatMap((p) => p.hobbyIds ?? []), ...DEFAULT_CATEGORIES])].slice(0, 4);
}

const GroupSchema = z.object({
  exchange: z
    .array(z.object({ member_id: z.string(), text: z.string() }))
    .describe("Five to seven short turns. Each person's Echo speaks for that person."),
  title: z.string(),
  summary: z.string().describe('One or two sentences, spoken to the whole group.'),
  stops: z.array(z.object({ place_id: z.string(), time: z.string().describe('HH:MM, 24-hour'), why: z.string() })),
});

export interface GroupPlanResult {
  title: string;
  summary: string;
  exchange: GroupTurn[];
  stops: PlanStop[];
}

export async function planGroup(
  input: { people: Person[]; area: Area; date: string; part?: DayPart; request: string },
  deps: {
    qloo: Pick<QlooClient, 'findPlaces'>;
    model: Pick<Anthropic['beta']['messages'], 'parse'>;
    onStep: (s: Step) => void;
    onPlaces?: (places: PlaceCard[]) => void;
  },
): Promise<GroupPlanResult> {
  const { people, area, date } = input;
  const part = input.part ?? 'any';
  const [from, to] = PART_WINDOWS[part];
  const day = weekdayOf(date);
  const allIds = people.flatMap((p) => p.ids);
  const you = people[0]!;
  let usedFallback = false;
  const categories = groupCategories(input.request, people);

  const withEcho = people.filter((p) => !p.loves);
  const guests = people.filter((p) => p.loves);
  deps.onStep({
    kind: 'ok',
    text: [
      `Read ${withEcho.length === 1 ? 'your echo' : `${withEcho.length} echoes: ${withEcho.map((p) => p.name).join(' and ')}`}`,
      ...(guests.length ? [`what ${guests.map((p) => p.name).join(' and ')} ${guests.length === 1 ? 'loves' : 'love'}`] : []),
    ].join(', and '),
  });

  const scored: ScoredPlace[] = [];
  await Promise.all(
    categories.map(async (id) => {
      const cat = placeCategory(id);
      if (!cat) return;
      const search = (entities: string[], radiusMeters?: number) =>
        deps.qloo.findPlaces({ near: { lat: area.lat, lon: area.lon }, tags: [cat.placeTag], signals: { entities }, radiusMeters, take: 5, explain: true });
      let places: PlaceSummary[];
      // Only people whose tastes went into the search get a fit score.
      let scoredFor = people.filter((p) => p.ids.length > 0);
      try {
        places = await search(allIds);
        deps.onStep({ kind: places.length ? 'ok' : 'info', text: places.length ? `Found ${places.length} ${cat.places} for everyone` : `No ${cat.places} nearby` });
      } catch {
        // Fail soft: a search on your own echo alone (the same one solo plans run) is often still available.
        try {
          places = await search(you.ids, 8000);
          usedFallback = true;
          scoredFor = [you];
          deps.onStep({ kind: 'info', text: `Found ${places.length} ${cat.places} from your echo; couldn't check everyone's together` });
        } catch {
          deps.onStep({ kind: 'dropped', text: `Couldn't reach Qloo for ${cat.places}` });
          return;
        }
      }
      const cards: PlaceCard[] = [];
      for (const place of places) {
        const s: ScoredPlace = { place, categoryLabel: cat.label, hoursThatDay: hoursOn(place.hours, day), fit: personalFit(place, scoredFor) };
        scored.push(s);
        cards.push({
          id: place.id,
          name: place.name,
          category: cat.label,
          miles: place.distanceMeters !== undefined ? Math.round((place.distanceMeters / METERS_PER_MILE) * 10) / 10 : undefined,
          priceLevel: place.priceLevel,
          matchPercent: place.affinity !== undefined ? Math.round(place.affinity * 100) : undefined,
          hoursThatDay: s.hoursThatDay,
        });
      }
      if (cards.length) deps.onPlaces?.(cards);
    }),
  );
  if (scored.length === 0) throw new GroupDataError();
  deps.onStep({ kind: 'ok', text: 'Scored every place for each person' });

  const table = scored.map((s) => ({
    place_id: s.place.id,
    name: s.place.name,
    category: s.categoryLabel,
    miles: s.place.distanceMeters !== undefined ? Math.round((s.place.distanceMeters / METERS_PER_MILE) * 10) / 10 : null,
    price_level: s.place.priceLevel ?? null,
    [`hours_${day}`]: s.hoursThatDay ?? 'unknown',
    fit: Object.fromEntries(people.map((p) => [p.name, s.fit[p.id] ?? 'unknown'])),
  }));

  const system = `You write a short planning conversation between AI agents ("Echos"), each representing one person, followed by the plan they agree on.
Rules:
- Use only places from the table. Fit numbers are each person's estimated match. Use them to choose, but never say a number: put it in words ("right up Sam's street", "a stretch for Jordan").
- When a fit is unknown, judge it from the person's tastes and notes.
- Each Echo speaks up for its person: their tastes, limits, and notes. Refer to people by name, never "he" or "she". A person marked "no echo" is a friend described in a few words; their Echo speaks from those words only.
- Answer the request. Agree on one to three stops in a sensible order, with times between ${from} and ${to} and inside opening hours when known, and a plan that scores well for everyone rather than one person.
- Keep turns under 25 words. No emoji.
- Each stop's why is a short phrase about why it suits the group, with no numbers.
- member_id must be one of: ${people.map((p) => `${p.id} (${p.name})`).join(', ')}.`;

  const user = [
    `Request: ${input.request}`,
    `Day: ${day} ${date}. Area: ${area.label}.`,
    ...people.map((p) =>
      `${p.name}${p.loves?.length ? ` (no echo; loves ${p.loves.join(', ')})` : p.tasteNames?.length ? ` (loves ${p.tasteNames.join(', ')})` : ''}: ${p.notes?.length ? p.notes.join('; ') : 'no stated limits'}`,
    ),
    ...(usedFallback ? ["Note: some places were ranked on the first person's tastes only. Where a fit is unknown, judge from what that person loves and their notes, and don't mention this."] : []),
    '',
    `Places:\n${JSON.stringify(table)}`,
  ].join('\n');

  let feedback = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await deps.model.parse({
      model: MODELS.groupWriter,
      max_tokens: 6000,
      system,
      messages: [{ role: 'user', content: user + feedback }],
      output_config: { effort: 'medium', format: betaZodOutputFormat(GroupSchema) },
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    });
    const out = res.stop_reason === 'refusal' ? null : res.parsed_output;
    if (!out) throw new Error('The group planner declined this request.');

    const byId = new Map(scored.map((s) => [s.place.id, s]));
    const memberIds = new Set(people.map((p) => p.id));
    const problems: string[] = [];
    if (out.stops.length < 1 || out.stops.length > 3) problems.push('Use one to three stops.');
    for (const s of out.stops) {
      const found = byId.get(s.place_id);
      if (!found) problems.push(`${s.place_id} is not in the table.`);
      else if (isOpenAt(found.hoursThatDay, s.time) === false) problems.push(`${found.place.name} is closed at ${s.time}.`);
      if (s.time < from || s.time > to) problems.push(`${s.time} is outside ${from}-${to}.`);
    }
    if (out.exchange.some((t) => !memberIds.has(t.member_id))) problems.push('Every member_id must match a person.');
    if (problems.length) {
      feedback = `\n\nYour last answer had problems. Fix them:\n- ${problems.join('\n- ')}`;
      continue;
    }

    return {
      title: out.title.trim(),
      summary: out.summary.trim(),
      exchange: out.exchange.map((t) => ({ memberId: t.member_id, text: t.text.trim() })),
      stops: out.stops.map((s) => {
        const f = byId.get(s.place_id)!;
        const p = f.place;
        return {
          placeId: p.id,
          name: p.name,
          time: s.time,
          category: f.categoryLabel,
          distanceMiles: p.distanceMeters !== undefined ? Math.round((p.distanceMeters / METERS_PER_MILE) * 10) / 10 : undefined,
          address: p.address,
          website: p.website,
          hoursThatDay: f.hoursThatDay,
          priceLevel: p.priceLevel,
          matchPercent: p.affinity !== undefined ? Math.round(p.affinity * 100) : undefined,
          why: s.why.trim(),
          location: p.location,
          fit: f.fit,
        };
      }),
    };
  }
  throw new Error("The group plan didn't check out. Try again.");
}

/** No place data at all, usually because live Qloo calls are off. */
export class GroupDataError extends Error {
  constructor() {
    super('No place data came back for this group.');
    this.name = 'GroupDataError';
  }
}

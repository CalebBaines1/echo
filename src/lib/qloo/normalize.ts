// Turns Qloo's large responses into the small shapes the app and the agent use.
// Raw responses include fields like translated titles (akas) that would only
// waste model context.

import type {
  CompareTag,
  EntitySummary,
  MediaSummary,
  OpeningHours,
  PlaceSummary,
  Reason,
  TagSummary,
  TrendPoint,
  Weekday,
} from './types';

type Raw = Record<string, any>;

const WEEKDAYS: Weekday[] = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const MAX_TAGS = 8;
const MAX_DESCRIPTION = 280;

export function stripEntityUrn(urn: string | undefined): string {
  if (!urn) return '';
  const type = urn.replace(/^urn:entity:/, '');
  return type === 'videogame' ? 'video_game' : type;
}

function entityTypeOf(raw: Raw): string {
  const urn = Array.isArray(raw.types) ? raw.types[0] : (raw.subtype ?? raw.type);
  return stripEntityUrn(urn);
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : v;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

function text(v: unknown, max = MAX_DESCRIPTION): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.replace(/\s+/g, ' ').trim();
  if (!t) return undefined;
  return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t;
}

function disambiguationOf(raw: Raw): string | undefined {
  const d = raw.disambiguation;
  return typeof d === 'string' && d.trim() ? d.trim() : undefined;
}

function yearOf(raw: Raw): number | undefined {
  const p = raw.properties ?? {};
  const y = num(p.release_year) ?? num(p.publication_year);
  if (y) return y;
  const d = disambiguationOf(raw);
  return d && /^\d{4}$/.test(d) ? Number(d) : undefined;
}

function tagsOf(raw: Raw): { names: string[]; ids: string[] } {
  const tags: Raw[] = Array.isArray(raw.tags) ? raw.tags : [];
  const seen = new Set<string>();
  const names: string[] = [];
  const ids: string[] = [];
  for (const t of tags) {
    const name = typeof t?.name === 'string' ? t.name : undefined;
    const id = t?.id ?? t?.tag_id;
    if (typeof id === 'string') ids.push(id);
    if (name && !seen.has(name.toLowerCase()) && names.length < MAX_TAGS) {
      seen.add(name.toLowerCase());
      names.push(name);
    }
  }
  return { names, ids };
}

export function reasonsOf(raw: Raw): Reason[] {
  const ex = raw.query?.explainability ?? raw.explainability;
  if (!ex || typeof ex !== 'object') return [];
  const out: Reason[] = [];
  for (const r of ex['signal.interests.entities'] ?? []) {
    const score = num(r?.score);
    if (typeof r?.entity_id === 'string' && score !== undefined) out.push({ kind: 'entity', id: r.entity_id, score });
  }
  for (const r of ex['signal.interests.tags'] ?? []) {
    const id = r?.tag_id ?? r?.id;
    const score = num(r?.score);
    if (typeof id === 'string' && score !== undefined) out.push({ kind: 'tag', id, score });
  }
  return out.sort((a, b) => b.score - a.score);
}

function hhmm(t: unknown): string | undefined {
  const m = typeof t === 'string' ? /(\d{2}):(\d{2})/.exec(t) : null;
  return m ? `${m[1]}:${m[2]}` : undefined;
}

export function normalizeHours(raw: unknown): OpeningHours | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const out: OpeningHours = {};
  let any = false;
  for (const day of WEEKDAYS) {
    const slots = (raw as Raw)[day];
    if (!Array.isArray(slots)) continue;
    any = true;
    out[day] = slots
      .filter((s: Raw) => !s?.closed)
      .map((s: Raw) => {
        const open = hhmm(s?.opens);
        const close = hhmm(s?.closes);
        return open && close ? `${open}-${close}` : undefined;
      })
      .filter((s): s is string => Boolean(s));
  }
  return any ? out : undefined;
}

export function toEntitySummary(raw: Raw): EntitySummary {
  return {
    id: String(raw.entity_id ?? raw.id ?? ''),
    name: String(raw.name ?? ''),
    type: entityTypeOf(raw),
    disambiguation: disambiguationOf(raw),
    year: yearOf(raw),
  };
}

export function toPlaceSummary(raw: Raw): PlaceSummary {
  const p = raw.properties ?? {};
  const { names, ids } = tagsOf(raw);
  const lat = num(raw.location?.lat);
  const lon = num(raw.location?.lon);
  return {
    id: String(raw.entity_id ?? raw.id ?? ''),
    name: String(raw.name ?? ''),
    location: lat !== undefined && lon !== undefined ? { lat, lon } : undefined,
    address: text(p.address, 140),
    neighborhood: text(p.neighborhood, 80),
    distanceMeters: num(raw.query?.distance),
    affinity: num(raw.query?.affinity),
    priceLevel: num(p.price_level),
    hours: normalizeHours(p.hours),
    description: text(p.short_description) ?? text(p.description),
    website: text(p.website, 200),
    tags: names,
    tagIds: ids,
    reasons: reasonsOf(raw),
  };
}

export function toMediaSummary(raw: Raw): MediaSummary {
  const p = raw.properties ?? {};
  return {
    id: String(raw.entity_id ?? raw.id ?? ''),
    name: String(raw.name ?? ''),
    type: entityTypeOf(raw),
    year: yearOf(raw),
    description: text(p.short_description) ?? text(p.description),
    affinity: num(raw.query?.affinity),
    tags: tagsOf(raw).names,
    tagRefs: (Array.isArray(raw.tags) ? raw.tags : []).flatMap((t: Raw) => {
      const id = t?.id ?? t?.tag_id;
      return typeof id === 'string' && typeof t?.name === 'string' ? [{ id, name: t.name }] : [];
    }),
    reasons: reasonsOf(raw),
  };
}

export function toTagSummary(raw: Raw): TagSummary {
  return {
    id: String(raw.id ?? raw.tag_id ?? ''),
    name: String(raw.name ?? ''),
    type: String(raw.type ?? raw.subtype ?? ''),
  };
}

export function toCompareTag(raw: Raw): CompareTag {
  return {
    id: String(raw.tag_id ?? raw.id ?? ''),
    name: String(raw.name ?? ''),
    type: String(raw.subtype ?? raw.type ?? ''),
    score: num(raw.query?.score),
    count: num(raw.query?.count),
  };
}

export function toTrendPoint(raw: Raw): TrendPoint {
  return {
    date: String(raw.date ?? ''),
    percentile: num(raw.population_percentile) ?? 0,
    rank: num(raw.population_rank) ?? 0,
    rankVelocity: num(raw.population_rank_velocity) ?? 0,
    velocityFoldChange: num(raw.velocity_fold_change) ?? 0,
    percentDelta: num(raw.population_percent_delta) ?? 0,
  };
}

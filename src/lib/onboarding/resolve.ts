import type { EntityType } from '@/lib/qloo/types';
import type { EntitySummary } from '@/lib/qloo/types';
import type { HeardTaste, Mention, MentionType } from './types';

/** The part of the Qloo client that name matching needs. */
export interface EntitySearcher {
  searchEntities(opts: { query: string; types?: EntityType[]; take?: number }): Promise<EntitySummary[]>;
}

const SEARCH_TYPES: Record<MentionType, EntityType[] | undefined> = {
  artist: ['artist'],
  movie: ['movie'],
  tv_show: ['tv_show'],
  book: ['book'],
  author: ['person', 'book'],
  video_game: ['video_game'],
  podcast: ['podcast'],
  person: ['person'],
  unknown: undefined,
};

export function tasteKey(name: string, type: MentionType): string {
  return `${normalizeName(name)}|${type}`;
}

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/&amp;/g, '&')
    .replace(/[^a-z0-9&]+/g, ' ')
    .trim();
}

/** True when every word the person said appears in the entity name ("ursula le guin" → "Ursula K. Le Guin"). */
export function namesMatch(said: string, entityName: string): boolean {
  const have = new Set(normalizeName(entityName).split(' '));
  const want = normalizeName(said).split(' ').filter((w) => w && w !== 'the');
  return want.length > 0 && want.every((w) => have.has(w));
}

/**
 * Turns a spoken mention into a taste. Never throws: if Qloo can't be
 * reached (or live calls are off), the taste is kept by name as "pending".
 */
export async function resolveMention(qloo: EntitySearcher, mention: Mention): Promise<HeardTaste> {
  const name = mention.name.trim();
  const base = { key: tasteKey(name, mention.type), name, type: mention.type };

  let results: EntitySummary[];
  try {
    // Lowercased so the same title always hits the same cache entry.
    results = await qloo.searchEntities({ query: name.toLowerCase(), types: SEARCH_TYPES[mention.type], take: 3 });
  } catch {
    return { ...base, status: 'pending' };
  }

  const plausible = results.filter((e) => namesMatch(name, e.name));
  if (plausible.length === 0) {
    return results.length ? { ...base, status: 'ambiguous', options: results } : { ...base, status: 'not_found' };
  }

  // Same name across different kinds of thing (Dune the film and the book): ask.
  // Parentheticals like "(Dune, #1)" don't count toward the name.
  const core = (s: string) => normalizeName(s.replace(/\([^)]*\)/g, ''));
  const exact = plausible.filter((e) => core(e.name) === core(name));
  const kinds = new Set(exact.map((e) => e.type));
  if (kinds.size > 1) {
    const oneEach = [...kinds].map((k) => exact.find((e) => e.type === k)!);
    return { ...base, status: 'ambiguous', options: oneEach };
  }

  return { ...base, status: 'matched', entity: exact[0] ?? plausible[0] };
}

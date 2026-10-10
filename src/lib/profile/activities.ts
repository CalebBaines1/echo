import { HOBBIES } from '@/lib/qloo/tags';

// Words that point to a known hobby. Checked against the activity name.
const KEYWORDS: Record<string, string[]> = {
  pottery: ['pottery', 'ceramic', 'clay', 'wheel throwing'],
  board_games: ['board game', 'tabletop', 'dungeons', 'd&d', 'dnd', 'card game', 'rpg'],
  climbing: ['climb', 'boulder'],
  records: ['record', 'vinyl', 'crate digging'],
  books: ['read', 'book', 'library'],
  art: ['draw', 'paint', 'sketch', 'illustrat', 'art'],
  film: ['film', 'movie', 'cinema'],
  live_music: ['concert', 'live music', 'gig', 'show'],
};

/** Best-effort match from a free-form activity to a known hobby id. */
export function hobbyIdFor(activity: string): string | undefined {
  const a = activity.toLowerCase();
  for (const hobby of HOBBIES) {
    if ((KEYWORDS[hobby.id] ?? []).some((k) => a.includes(k))) return hobby.id;
  }
  return undefined;
}

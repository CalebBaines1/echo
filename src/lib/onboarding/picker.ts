import { PICKER_SEEDS } from '@/data/picker';
import type { QlooClient } from '@/lib/qloo/client';
import type { EntityType, MediaSummary } from '@/lib/qloo/types';
import { resolveMention, tasteKey, type EntitySearcher } from './resolve';
import type { HeardTaste, MentionType } from './types';

/** A tappable title in the onboarding picker. */
export interface PickerCard {
  key: string;
  name: string;
  type: MentionType;
  /** Qloo's image when it has one; the client fills gaps from the covers lookup. */
  image?: string;
  /** Picked by Echo from what was already tapped. */
  guess?: boolean;
  /** Reason for a guess, e.g. "Because you tapped Severance". */
  reason?: string;
  taste: HeardTaste;
}

/** Matches the curated titles to Qloo. Titles Qloo can't confirm stay as cards with their own name. */
export async function seedCards(qloo: EntitySearcher): Promise<PickerCard[]> {
  const tastes = await Promise.all(PICKER_SEEDS.map((s) => resolveMention(qloo, s)));
  return tastes.map((t) => {
    // An unclear match keeps the title as written, never a guessed entity.
    const taste: HeardTaste = t.status === 'matched' ? t : { key: t.key, name: t.name, type: t.type, status: 'pending' };
    return { key: t.key, name: taste.entity?.name ?? t.name, type: t.type, image: taste.entity?.image, taste };
  });
}

const GUESS_TYPES: EntityType[] = ['tv_show', 'artist', 'movie', 'book', 'video_game', 'podcast'];

/**
 * Qloo's picks for what was tapped, spread across kinds, as new cards.
 * Returns nothing if Qloo can't be reached.
 */
export async function guessCards(
  qloo: Pick<QlooClient, 'recommend'>,
  input: { ids: string[]; names: Record<string, string>; exclude: string[] },
): Promise<PickerCard[]> {
  if (input.ids.length === 0) return [];
  const exclude = new Set([...input.exclude, ...input.ids]);
  const perType = await Promise.all(
    GUESS_TYPES.map(async (type) => {
      try {
        return await qloo.recommend({ type, signals: { entities: input.ids }, take: 4, explain: true });
      } catch {
        return [] as MediaSummary[];
      }
    }),
  );
  const cards: PickerCard[] = [];
  // Round-robin across kinds so guesses aren't all one type.
  for (let i = 0; i < 4 && cards.length < 8; i++) {
    for (const list of perType) {
      const m = list.filter((x) => !exclude.has(x.id))[i];
      if (!m || cards.some((c) => c.taste.entity?.id === m.id)) continue;
      const type = String(m.type) as MentionType;
      const from = m.reasons.find((r) => r.kind === 'entity' && input.names[r.id]);
      const key = tasteKey(m.name, type);
      cards.push({
        key,
        name: m.name,
        type,
        image: m.image,
        guess: true,
        reason: from ? `Because you tapped ${input.names[from.id]}` : undefined,
        taste: { key, name: m.name, type, status: 'matched', entity: { id: m.id, name: m.name, type, year: m.year, image: m.image } },
      });
      if (cards.length >= 8) break;
    }
  }
  return cards;
}

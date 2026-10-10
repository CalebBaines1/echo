import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { MODELS } from '@/lib/ai/models';
import type { HeardTaste } from '@/lib/onboarding/types';
import type { QlooClient } from '@/lib/qloo/client';
import type { EntityType, MediaSummary } from '@/lib/qloo/types';
import { signalIds, type Activity, type Leaning, type TastePick, type Preferences } from './types';

/** Media types used for "you might also love", with how many picks each. */
const PICK_TYPES: Array<[EntityType, number]> = [
  ['tv_show', 2],
  ['artist', 2],
  ['book', 1],
  ['podcast', 1],
];

// Tag kinds that describe a taste ("Grief and healing", "Quietly tender",
// "Indie Folk"). Others are formats, instruments, places, or too broad.
const DESCRIPTIVE_TAG_PREFIXES = ['urn:tag:theme:', 'urn:tag:subgenre:', 'urn:tag:style:', 'urn:tag:genre:music', 'urn:tag:music:'];

/** "Because you like A and B", from Qloo's explainability. */
export function reasonFor(item: MediaSummary, names: Map<string, string>): string | undefined {
  const top = item.reasons
    .filter((r) => r.kind === 'entity' && names.has(r.id))
    .slice(0, 2)
    .map((r) => names.get(r.id)!);
  if (top.length === 0) return undefined;
  return `Because you like ${top.join(' and ')}`;
}

/** Most common tags across recommendations, weighted by affinity. Scores are relative to the top tag. */
export function leaningsFrom(items: MediaSummary[], take = 4): Leaning[] {
  const weights = new Map<string, number>();
  for (const item of items) {
    const w = item.affinity ?? 0.5;
    const seen = new Set<string>();
    for (const { id, name } of item.tagRefs) {
      if (!DESCRIPTIVE_TAG_PREFIXES.some((p) => id.startsWith(p))) continue;
      const label = name.trim();
      const key = label.toLowerCase();
      if (!label || seen.has(key)) continue;
      seen.add(key);
      weights.set(label, (weights.get(label) ?? 0) + w);
    }
  }
  const sorted = [...weights.entries()].sort((a, b) => b[1] - a[1]).slice(0, take);
  const max = sorted[0]?.[1] ?? 1;
  return sorted.map(([label, w]) => ({ label, score: Math.round((w / max) * 100) }));
}

const WriterSchema = z.object({
  summary: z.string().describe('One sentence, second person, about what ties their tastes together.'),
  traits: z.array(z.string()).describe('Three or four one- or two-word traits, capitalized.'),
});

export interface BuiltProfile {
  summary: string;
  traits: string[];
  leanings: Leaning[];
  alsoLove: TastePick[];
  /** True when Qloo couldn't be reached, so picks and leanings are missing. */
  qlooUnavailable: boolean;
}

export async function buildProfile(
  input: { tastes: HeardTaste[]; activities: Activity[]; preferences: Preferences },
  deps: { qloo: Pick<QlooClient, 'recommend'>; model: Pick<Anthropic['messages'], 'parse'> },
): Promise<BuiltProfile> {
  const ids = signalIds(input.tastes);
  const names = new Map(input.tastes.flatMap((t) => (t.entity ? [[t.entity.id, t.entity.name] as const] : [])));
  const known = new Set(ids);

  let qlooUnavailable = false;
  const byType = await Promise.all(
    PICK_TYPES.map(async ([type]) => {
      if (ids.length === 0) return [] as MediaSummary[];
      try {
        // take 5 with explainability matches the cached probe requests.
        return await deps.qloo.recommend({ type, signals: { entities: ids }, take: 5, explain: true });
      } catch {
        qlooUnavailable = true;
        return [] as MediaSummary[];
      }
    }),
  );

  const alsoLove: TastePick[] = [];
  PICK_TYPES.forEach(([, count], i) => {
    for (const item of (byType[i] ?? []).filter((m) => !known.has(m.id)).slice(0, count)) {
      alsoLove.push({ id: item.id, name: item.name, type: String(item.type), year: item.year, reason: reasonFor(item, names) });
    }
  });
  const leanings = leaningsFrom(byType.flat());

  const res = await deps.model.parse({
    model: MODELS.profileWriter,
    max_tokens: 2048,
    system:
      'You write the short profile at the top of a taste app. Be warm, specific and plain. Describe what ties their tastes together in mood and style. Never invent facts about the titles. No flattery, no exclamation marks.',
    messages: [
      {
        role: 'user',
        content: [
          `Tastes: ${input.tastes.map((t) => `${t.entity?.name ?? t.name} (${t.type})`).join(', ') || 'none'}`,
          `Activities: ${input.activities.map((a) => `${a.name} (${a.status.replace('_', ' ')})`).join(', ') || 'none'}`,
          `Notes: ${input.preferences.notes.join('; ') || 'none'}`,
          `Common threads in what Qloo recommends for them: ${leanings.map((l) => l.label).join(', ') || 'unknown'}`,
          '',
          'Write the summary sentence (under 25 words, starting with "You") and 3 or 4 traits.',
        ].join('\n'),
      },
    ],
    output_config: { effort: 'low', format: zodOutputFormat(WriterSchema) },
  });
  const out = res.stop_reason === 'refusal' ? null : res.parsed_output;

  return {
    summary: out?.summary.trim() || 'Here’s what you’ve told Echo so far.',
    traits: (out?.traits ?? []).map((t) => t.trim()).filter(Boolean).slice(0, 4),
    leanings,
    alsoLove,
    qlooUnavailable,
  };
}

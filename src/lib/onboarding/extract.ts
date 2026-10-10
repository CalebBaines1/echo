import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { MODELS } from '@/lib/ai/models';
import { hobbyIdFor } from '@/lib/profile/activities';
import type { Activity } from '@/lib/profile/types';
import { resolveMention, tasteKey, type EntitySearcher } from './resolve';
import { MENTION_TYPES, type HeardTaste } from './types';

export const EXTRACT_SYSTEM = `You are Echo, a warm app that learns what someone loves. The person just answered "What's one thing you love that wasn't in there?" by voice or text.

Return:
- reply: one short, specific reaction under 15 words, spoken aloud. No question, no emoji, no claims you aren't sure of.
- mentions: every specific title, artist, author, game, or podcast they named, with canonical spelling ("that show severance" is "Severance"). Types: artist for musicians and bands, author for writers, person for other people, tv_show, movie, book, video_game, podcast, or unknown when the title could be several kinds of thing. Skip genres and vague descriptions.
- activities: any hobbies or activities they mentioned, each with status does, used_to, or wants_to.`;

const ExtractSchema = z.object({
  reply: z.string(),
  mentions: z.array(z.object({ name: z.string(), type: z.enum(MENTION_TYPES) })),
  activities: z.array(z.object({ name: z.string(), status: z.enum(['does', 'used_to', 'wants_to']) })),
});

export type ExtractModel = Pick<Anthropic['messages'], 'parse'>;

export interface ExtractResult {
  reply: string;
  added: HeardTaste[];
  activities: Activity[];
}

/** Reads names and activities out of one free answer and matches the names to Qloo. */
export async function extractFromAnswer(
  input: { text: string; known: string[] },
  deps: { model: ExtractModel; qloo: EntitySearcher },
): Promise<ExtractResult> {
  const res = await deps.model.parse({
    model: MODELS.interviewer,
    max_tokens: 1500,
    system: EXTRACT_SYSTEM,
    messages: [{ role: 'user', content: input.text }],
    output_config: { effort: 'low', format: zodOutputFormat(ExtractSchema) },
  });
  // Haiku has no server-side refusal fallback; a refusal just adds nothing.
  const out = res.stop_reason === 'refusal' ? null : res.parsed_output;
  if (!out) return { reply: 'Got it.', added: [], activities: [] };

  const seen = new Set(input.known);
  const fresh = out.mentions
    .filter((m) => m.name.trim())
    .filter((m) => {
      const key = tasteKey(m.name, m.type);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
  const added = await Promise.all(fresh.map((m) => resolveMention(deps.qloo, m)));
  const activities: Activity[] = out.activities
    .filter((a) => a.name.trim())
    .map((a) => ({ name: a.name.trim(), status: a.status, hobbyId: hobbyIdFor(a.name) }));
  return { reply: out.reply.trim() || 'Got it.', added, activities };
}

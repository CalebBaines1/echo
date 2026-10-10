import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { MODELS } from '@/lib/ai/models';
import { hobbyIdFor } from '@/lib/profile/activities';
import type { Activity, Preferences } from '@/lib/profile/types';
import { resolveMention, tasteKey, type EntitySearcher } from './resolve';
import { MAX_QUESTIONS, MENTION_TYPES, type ChatMessage, type HeardTaste, type TurnResponse } from './types';

export const SYSTEM_PROMPT = `You are Echo, a warm and curious voice interviewer inside an app that learns what someone loves and then helps them find hobbies, places, and plans that fit.

In this conversation, learn three things:
1. Six to eight specific things they love across at least three of: music, TV, movies, books, video games, and podcasts. Specific means a named artist, show, film, book, author, game, or podcast, not a genre.
2. What they do with their free time: hobbies and activities they do now, used to do, or want to try.
3. How they like to spend an outing: alone or with people, indoors or outdoors, a rough budget, and how far they'll travel.

Spend roughly the first five questions on media, then ask about free time and something they've wanted to try, then one question covering how they like to go out. Skip anything they've already answered.

Every reply is spoken aloud by a text-to-speech voice, so:
- Keep it to two short sentences at most, under 30 words in total: one brief reaction, then one question.
- Ask exactly one question, about one thing.
- No lists, emoji, markdown, or stage directions.

How to respond to each answer:
- Briefly react to what they said with something specific about its mood, style, or feel, then ask the next question.
- If they only give a genre or a vibe ("sad indie stuff"), ask for one example.
- If they don't know or don't have one, move on without pushing.
- Never claim facts you aren't sure of, and never recommend anything yet. That happens later in the app.

Extract from the person's latest message only:
- mentions: every specific title, artist, author, game, or podcast. Use the canonical name, cleaned of filler ("that show severance" is "Severance"). Types: artist for musicians and bands, author for writers, person for other people such as directors or comedians, tv_show, movie, book, video_game, podcast, or unknown when the title could be several kinds of thing, like "Dune". Skip genres and anything already heard.
- activities: hobbies or activities, each with status does, used_to, or wants_to. Use short plain names like "pottery", "hiking", "board games". Skip passive media consumption like "watching TV".
- preferences: only what they actually said. company is solo, group, or either. setting is indoor, outdoor, or either. budget is dollars per outing. max_miles is how far they'll go. notes are short phrases like "prefers quiet places" or "no early mornings".

Set done to true when you've covered all three areas, when the person asks to stop, or when the context says you've reached the question limit. When done, the reply is a short wrap-up such as "Got it. Here's what I heard." and asks no question.`;

const TurnSchema = z.object({
  reply: z.string().describe('What Echo says next, spoken aloud.'),
  mentions: z.array(z.object({ name: z.string(), type: z.enum(MENTION_TYPES) })),
  activities: z.array(z.object({ name: z.string(), status: z.enum(['does', 'used_to', 'wants_to']) })),
  preferences: z.object({
    company: z.enum(['solo', 'group', 'either']).nullable(),
    setting: z.enum(['indoor', 'outdoor', 'either']).nullable(),
    budget: z.number().nullable(),
    max_miles: z.number().nullable(),
    notes: z.array(z.string()),
  }),
  done: z.boolean(),
});
export type TurnOutput = z.infer<typeof TurnSchema>;

/** The parts of the Anthropic client this agent uses, so tests can fake it. */
export type InterviewerModel = Pick<Anthropic['messages'], 'parse'>;

export interface InterviewState {
  messages: ChatMessage[];
  heard: Pick<HeardTaste, 'name' | 'type' | 'status'>[];
  activities?: Pick<Activity, 'name' | 'status'>[];
  preferences?: Partial<Preferences>;
}

const FALLBACK_REPLY = "Sorry, I didn't catch that. What's something you've been listening to lately?";

function describePreferences(p: Partial<Preferences> | undefined): string {
  if (!p) return '(nothing yet)';
  const parts = [
    p.company && `company: ${p.company}`,
    p.setting && `setting: ${p.setting}`,
    p.budget !== undefined && `budget: $${p.budget}`,
    p.maxMiles !== undefined && `max distance: ${p.maxMiles} mi`,
    ...(p.notes ?? []),
  ].filter(Boolean);
  return parts.length ? parts.join('; ') : '(nothing yet)';
}

/**
 * Converts the chat into Messages API turns. The API needs the first turn to
 * come from the user, and Echo speaks first, so a short note opens the history.
 * What's been learned so far rides along on the latest user turn.
 */
export function buildMessages(state: InterviewState): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [{ role: 'user', content: '(The person opened Echo and started the conversation.)' }];
  for (const m of state.messages) {
    const role = m.role === 'echo' ? 'assistant' : 'user';
    const last = out[out.length - 1]!;
    if (last.role === role && typeof last.content === 'string') last.content += `\n${m.text}`;
    else out.push({ role, content: m.text });
  }

  const asked = state.messages.filter((m) => m.role === 'echo').length;
  const heardList = state.heard.length
    ? state.heard.map((h) => `- ${h.name} (${h.type}${h.status === 'ambiguous' ? ', unclear which one' : ''})`).join('\n')
    : '(nothing yet)';
  const activityList = state.activities?.length
    ? state.activities.map((a) => `- ${a.name} (${a.status})`).join('\n')
    : '(nothing yet)';
  const context = [
    '',
    '<context>',
    `Questions asked so far: ${asked} of ${MAX_QUESTIONS}.${asked >= MAX_QUESTIONS ? ' This is the limit: set done to true and wrap up.' : ''}`,
    `Media heard:\n${heardList}`,
    `Activities heard:\n${activityList}`,
    `Outing preferences heard: ${describePreferences(state.preferences)}`,
    '</context>',
  ].join('\n');

  const last = out[out.length - 1]!;
  if (last.role === 'user' && typeof last.content === 'string') last.content += context;
  else out.push({ role: 'user', content: `(No answer.)${context}` });
  return out;
}

export function toPreferencePatch(p: TurnOutput['preferences']): Partial<Preferences> {
  const patch: Partial<Preferences> = {};
  if (p.company) patch.company = p.company;
  if (p.setting) patch.setting = p.setting;
  if (p.budget !== null && p.budget > 0) patch.budget = Math.round(p.budget);
  if (p.max_miles !== null && p.max_miles > 0) patch.maxMiles = Math.round(p.max_miles);
  const notes = p.notes.map((n) => n.trim()).filter(Boolean);
  if (notes.length) patch.notes = notes;
  return patch;
}

export async function runInterviewerTurn(
  input: InterviewState,
  deps: { model: InterviewerModel; qloo: EntitySearcher },
): Promise<TurnResponse> {
  const asked = input.messages.filter((m) => m.role === 'echo').length;

  const res = await deps.model.parse({
    model: MODELS.interviewer,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: buildMessages(input),
    output_config: { effort: 'low', format: zodOutputFormat(TurnSchema) },
  });
  // Haiku has no server-side refusal fallback, so a refusal gets a neutral re-ask.
  const output: TurnOutput | null = res.stop_reason === 'refusal' ? null : (res.parsed_output ?? null);
  if (!output) return { reply: FALLBACK_REPLY, done: asked >= MAX_QUESTIONS, added: [], activities: [], preferences: {} };

  // Drop anything already heard, and repeats within this turn.
  const seen = new Set(input.heard.map((h) => tasteKey(h.name, h.type)));
  const fresh = output.mentions
    .filter((m) => m.name.trim().length > 0)
    .filter((m) => {
      const key = tasteKey(m.name, m.type);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);

  const knownActivities = new Set((input.activities ?? []).map((a) => a.name.trim().toLowerCase()));
  const activities: Activity[] = [];
  for (const a of output.activities) {
    const name = a.name.trim();
    if (!name || knownActivities.has(name.toLowerCase())) continue;
    knownActivities.add(name.toLowerCase());
    activities.push({ name, status: a.status, hobbyId: hobbyIdFor(name) });
  }

  const added = await Promise.all(fresh.map((m) => resolveMention(deps.qloo, m)));
  return {
    reply: output.reply.trim() || FALLBACK_REPLY,
    done: output.done || asked >= MAX_QUESTIONS,
    added,
    activities,
    preferences: toPreferencePatch(output.preferences),
  };
}

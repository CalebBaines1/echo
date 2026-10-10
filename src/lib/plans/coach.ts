import type Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';
import { MODELS } from '@/lib/ai/models';
import type { HobbyWeek, PlanStop } from './types';

type Parse = Pick<Anthropic['messages'], 'parse'>;

const HobbySchema = z.object({
  intro: z.string().describe('One sentence, spoken to the person, about where they are in the plan.'),
  weeks: z
    .array(z.object({ week: z.string(), title: z.string(), detail: z.string() }))
    .describe('Five or six steps covering about six weeks.'),
});

export async function writeHobbyPlan(
  input: { hobby: string; stop: PlanStop; backup?: PlanStop; tastes: string[]; notes: string[] },
  model: Parse,
): Promise<{ intro: string; weeks: HobbyWeek[] }> {
  const res = await model.parse({
    model: MODELS.coach,
    max_tokens: 3000,
    system: `You design gentle six-week plans for someone starting a new hobby. Rules:
- Week 1 is the first visit to the place given. Name only the places given; for later steps that need somewhere new, write the detail as "Echo will find a [kind of place] near you".
- Practice that needs equipment or space (a wheel, a wall, an instrument) happens at the first place again or at a place Echo will find. Don't assume they own equipment.
- Never invent classes, schedules, prices, or events.
- Mix doing it, practicing alone, and one step of watching, reading, or listening about the hobby.
- Short titles like "Open studio, solo". Details under 15 words.`,
    messages: [
      {
        role: 'user',
        content: [
          `Hobby: ${input.hobby}`,
          `First place: ${input.stop.name}${input.stop.why ? ` (${input.stop.why})` : ''}`,
          input.backup ? `Other nearby option: ${input.backup.name}` : '',
          `Their tastes: ${input.tastes.join(', ') || 'unknown'}`,
          `Notes: ${input.notes.join('; ') || 'none'}`,
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ],
    output_config: { effort: 'low', format: zodOutputFormat(HobbySchema) },
  });
  const out = res.stop_reason === 'refusal' ? null : res.parsed_output;
  if (!out || out.weeks.length === 0) throw new Error('No hobby plan came back.');
  return { intro: out.intro.trim(), weeks: out.weeks.slice(0, 6).map((w) => ({ week: w.week.trim(), title: w.title.trim(), detail: w.detail.trim() })) };
}

const OUTCOME_WORDS: Record<string, string> = {
  loved: 'They loved it.',
  fine: 'It was fine.',
  skipped: "They didn't go. Suggest something easier to start or at a better time, not a repeat.",
  wrong: 'It was wrong for them. Suggest a different direction, not more of the same.',
};

const CheckInSchema = z.object({
  reply: z.string().describe('One or two warm sentences reacting to what they said.'),
  learned: z.array(z.string()).describe('Up to three short things learned about their preferences, phrased like "prefers open studio over classes".'),
  next_request: z.string().nullable().describe('A request Echo could plan next, in their voice, like "Find open studio times for pottery". Null if nothing fits.'),
});

export async function runCheckIn(
  input: { planTitle: string; stops: string[]; answer: string; knownNotes: string[]; outcome?: string },
  model: Parse,
): Promise<{ reply: string; learned: string[]; suggestion?: string }> {
  const res = await model.parse({
    model: MODELS.coach,
    max_tokens: 2000,
    system:
      'You are Echo, checking in after someone tried a plan you made. React briefly and warmly to what they said, pull out what it tells you about their preferences, and suggest what to plan next. Skip anything already in their notes. Never invent facts about the place.',
    messages: [
      {
        role: 'user',
        content: `Plan: ${input.planTitle} (${input.stops.join(', ')})\nTheir notes so far: ${input.knownNotes.join('; ') || 'none'}\n${input.outcome ? `${OUTCOME_WORDS[input.outcome] ?? ''}\n` : ''}How it went, in their words: ${input.answer}`,
      },
    ],
    output_config: { effort: 'low', format: zodOutputFormat(CheckInSchema) },
  });
  const out = res.stop_reason === 'refusal' ? null : res.parsed_output;
  if (!out) return { reply: 'Thanks for telling me. I’ll keep that in mind for next time.', learned: [] };
  return {
    reply: out.reply.trim(),
    learned: out.learned.map((l) => l.trim()).filter(Boolean).slice(0, 3),
    suggestion: out.next_request?.trim() || undefined,
  };
}

const AdaptSchema = z.object({
  reply: z.string().describe('One warm sentence reacting to how the step went.'),
  remaining: z.array(z.object({ title: z.string(), detail: z.string() })).describe('The steps after the one just finished, revised. Same count as before.'),
  learned: z.string().nullable().describe('One short preference this reveals, like "prefers open studio over classes", or null.'),
});

/** Revises the rest of a hobby plan after one step, based on how it went. */
export async function adaptHobbyPlan(
  input: { hobby: string; weeks: HobbyWeek[]; index: number; note: string },
  model: Parse,
): Promise<{ reply: string; weeks: HobbyWeek[]; learned?: string }> {
  const remaining = input.weeks.slice(input.index + 1);
  const res = await model.parse({
    model: MODELS.coach,
    max_tokens: 2500,
    system: `You adjust a six-week hobby plan after each step. Keep the same number of remaining steps. Change only what the person's answer gives a reason to change: if it was too hard, ease in; if a place didn't suit them, say "Echo will find a different [kind of place]"; if it went well, build on it. Never invent places, classes, schedules or prices. Titles stay short; details under 15 words.`,
    messages: [
      {
        role: 'user',
        content: [
          `Hobby: ${input.hobby}`,
          `Just finished: ${input.weeks[input.index]?.title} (${input.weeks[input.index]?.detail})`,
          `How it went, in their words: ${input.note}`,
          `Remaining steps:\n${remaining.map((w, i) => `${i + 1}. ${w.title}: ${w.detail}`).join('\n') || '(none)'}`,
        ].join('\n'),
      },
    ],
    output_config: { effort: 'low', format: zodOutputFormat(AdaptSchema) },
  });
  const out = res.stop_reason === 'refusal' ? null : res.parsed_output;
  const done = input.weeks.map((w, i) => (i === input.index ? { ...w, done: true, note: input.note } : w));
  if (!out || out.remaining.length !== remaining.length) return { reply: 'Nice. On to the next one.', weeks: done };
  return {
    reply: out.reply.trim(),
    learned: out.learned?.trim() || undefined,
    weeks: done.map((w, i) => (i > input.index ? { ...w, title: out.remaining[i - input.index - 1]!.title.trim(), detail: out.remaining[i - input.index - 1]!.detail.trim() } : w)),
  };
}

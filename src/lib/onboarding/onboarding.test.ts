import { describe, expect, it, vi } from 'vitest';
import { QlooOfflineError } from '@/lib/qloo/errors';
import type { EntitySummary } from '@/lib/qloo/types';
import { buildMessages, runInterviewerTurn, type InterviewerModel } from './interviewer';
import { namesMatch, resolveMention, type EntitySearcher } from './resolve';
import { OPENING_LINE } from './types';

const ent = (name: string, type: string, extra: Partial<EntitySummary> = {}): EntitySummary => ({ id: `${name}-${type}`, name, type, ...extra });

function searcher(results: EntitySummary[] | Error): EntitySearcher & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    async searchEntities(opts) {
      calls.push(opts);
      if (results instanceof Error) throw results;
      return results;
    },
  };
}

describe('namesMatch', () => {
  it('accepts names with extra words and ignores case and punctuation', () => {
    expect(namesMatch('ursula le guin', 'Ursula K. Le Guin')).toBe(true);
    expect(namesMatch('phoebe bridgers', 'Phoebe Bridgers')).toBe(true);
    expect(namesMatch('severance', "That '70s Show")).toBe(false);
  });
});

describe('resolveMention', () => {
  it('matches the first plausible result and searches with lowercase', async () => {
    const q = searcher([ent('Severance', 'tv_show', { year: 2022 })]);
    const t = await resolveMention(q, { name: 'Severance', type: 'tv_show' });
    expect(t).toMatchObject({ status: 'matched', entity: { name: 'Severance' } });
    expect(q.calls[0]).toEqual({ query: 'severance', types: ['tv_show'], take: 3 });
  });

  it('searches people and books for authors', async () => {
    const q = searcher([ent('Ursula K. Le Guin', 'person')]);
    await resolveMention(q, { name: 'Ursula Le Guin', type: 'author' });
    expect(q.calls[0]).toMatchObject({ types: ['person', 'book'] });
  });

  it('asks when the same name is different kinds of thing', async () => {
    const q = searcher([ent('Dune', 'movie', { disambiguation: '2021' }), ent('Dune', 'movie', { disambiguation: '1984' }), ent('Dune (Dune, #1)', 'book')]);
    const t = await resolveMention(q, { name: 'Dune', type: 'unknown' });
    expect(t.status).toBe('ambiguous');
    expect(t.options?.map((o) => o.type)).toEqual(['movie', 'book']);
  });

  it('offers options when nothing matches the name closely', async () => {
    const t = await resolveMention(searcher([ent("That '70s Show", 'tv_show')]), { name: 'that show severance', type: 'tv_show' });
    expect(t.status).toBe('ambiguous');
  });

  it('marks empty results as not found', async () => {
    expect((await resolveMention(searcher([]), { name: 'Zzz', type: 'movie' })).status).toBe('not_found');
  });

  it('keeps the name as pending when Qloo is offline', async () => {
    const t = await resolveMention(searcher(new QlooOfflineError('/search?query=x')), { name: 'Hollow Knight', type: 'video_game' });
    expect(t).toMatchObject({ status: 'pending', name: 'Hollow Knight', key: 'hollow knight|video_game' });
  });
});

describe('buildMessages', () => {
  it('starts with a user turn, alternates roles, and adds context to the last user turn', () => {
    const out = buildMessages({
      messages: [
        { role: 'echo', text: OPENING_LINE },
        { role: 'user', text: 'Severance' },
      ],
      heard: [{ name: 'Dune', type: 'unknown', status: 'ambiguous' }],
      activities: [{ name: 'pottery', status: 'wants_to' }],
      preferences: { company: 'solo', notes: ['prefers quiet places'] },
    });
    expect(out.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    const last = out.at(-1)!.content as string;
    expect(last).toContain('Severance');
    expect(last).toContain('Questions asked so far: 1 of 10');
    expect(last).toContain('pottery (wants_to)');
    expect(last).toContain('company: solo; prefers quiet places');
    expect(last).toContain('Dune (unknown, unclear which one)');
  });
});

describe('runInterviewerTurn', () => {
  function model(parsed: object | null, stop_reason = 'end_turn'): InterviewerModel {
    return { parse: vi.fn(async () => ({ parsed_output: parsed, stop_reason })) } as unknown as InterviewerModel;
  }

  it('resolves new mentions and skips ones already heard', async () => {
    const q = searcher([ent('Bon Iver', 'artist')]);
    const out = await runInterviewerTurn(
      {
        messages: [
          { role: 'echo', text: OPENING_LINE },
          { role: 'user', text: 'Phoebe Bridgers and Bon Iver' },
        ],
        heard: [{ name: 'Phoebe Bridgers', type: 'artist', status: 'matched' }],
      },
      {
        model: model({
          reply: 'Soft and sad, nice. What about games?',
          activities: [{ name: 'Pottery', status: 'wants_to' }],
          preferences: { company: 'solo', setting: null, budget: 40, max_miles: null, notes: [' prefers quiet places '] },
          mentions: [
            { name: 'Phoebe Bridgers', type: 'artist' },
            { name: 'Bon Iver', type: 'artist' },
            { name: 'bon iver', type: 'artist' },
          ],
          done: false,
        }),
        qloo: q,
      },
    );
    expect(out.reply).toBe('Soft and sad, nice. What about games?');
    expect(out.added.map((a) => a.name)).toEqual(['Bon Iver']);
    expect(out.activities).toEqual([{ name: 'Pottery', status: 'wants_to', hobbyId: 'pottery' }]);
    expect(out.preferences).toEqual({ company: 'solo', budget: 40, notes: ['prefers quiet places'] });
    expect(q.calls).toHaveLength(1);
  });

  it('re-asks on a refusal instead of failing', async () => {
    const out = await runInterviewerTurn(
      { messages: [{ role: 'echo', text: OPENING_LINE }, { role: 'user', text: 'hmm' }], heard: [] },
      { model: model(null, 'refusal'), qloo: searcher([]) },
    );
    expect(out.added).toEqual([]);
    expect(out.done).toBe(false);
    expect(out.reply.length).toBeGreaterThan(0);
  });

  it('wraps up at the question limit', async () => {
    const messages = Array.from({ length: 20 }, (_, i) => ({ role: i % 2 ? ('user' as const) : ('echo' as const), text: `m${i}` }));
    const out = await runInterviewerTurn(
      { messages, heard: [] },
      { model: model({ reply: 'One more?', mentions: [], activities: [], preferences: { company: null, setting: null, budget: null, max_miles: null, notes: [] }, done: false }), qloo: searcher([]) },
    );
    expect(out.done).toBe(true);
  });
});

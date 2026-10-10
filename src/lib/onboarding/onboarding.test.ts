import { describe, expect, it, vi } from 'vitest';
import { extractFromAnswer, type ExtractModel } from './extract';
import { guessCards } from './picker';
import { QlooOfflineError } from '@/lib/qloo/errors';
import type { EntitySummary } from '@/lib/qloo/types';
import { namesMatch, resolveMention, type EntitySearcher } from './resolve';

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

describe('extractFromAnswer', () => {
  const model = (parsed: object | null, stop_reason = 'end_turn'): ExtractModel =>
    ({ parse: vi.fn(async () => ({ parsed_output: parsed, stop_reason })) }) as unknown as ExtractModel;

  it('resolves new names, skips known ones, and maps activities to hobbies', async () => {
    const q = searcher([ent('Mitski', 'artist')]);
    const out = await extractFromAnswer(
      { text: 'Mitski, and I want to try pottery', known: ['severance|tv_show'] },
      {
        model: model({
          reply: 'Mitski, of course.',
          mentions: [
            { name: 'Mitski', type: 'artist' },
            { name: 'Severance', type: 'tv_show' },
          ],
          activities: [{ name: 'pottery', status: 'wants_to' }],
        }),
        qloo: q,
      },
    );
    expect(out.reply).toBe('Mitski, of course.');
    expect(out.added.map((a) => a.name)).toEqual(['Mitski']);
    expect(out.activities).toEqual([{ name: 'pottery', status: 'wants_to', hobbyId: 'pottery' }]);
  });

  it('adds nothing on a refusal', async () => {
    const out = await extractFromAnswer({ text: 'hmm', known: [] }, { model: model(null, 'refusal'), qloo: searcher([]) });
    expect(out).toEqual({ reply: 'Got it.', added: [], activities: [] });
  });
});

describe('guessCards', () => {
  const media = (id: string, type: string) => ({ id, name: `${type}-${id}`, type, tags: [], tagRefs: [], reasons: [{ kind: 'entity' as const, id: 'seed', score: 0.5 }] });

  it('mixes kinds, skips what was already shown, and says why', async () => {
    const qloo = {
      recommend: vi.fn(async ({ type }: { type: string }) => (type === 'tv_show' ? [media('t1', 'tv_show'), media('t2', 'tv_show')] : type === 'artist' ? [media('a1', 'artist')] : [])),
    };
    const cards = await guessCards(qloo as never, { ids: ['seed'], names: { seed: 'Severance' }, exclude: ['t1'] });
    expect(cards.map((c) => c.taste.entity?.id)).toEqual(['t2', 'a1']);
    expect(cards[0]!.reason).toBe('Because you tapped Severance');
    expect(cards.every((c) => c.guess && c.taste.status === 'matched')).toBe(true);
  });

  it('returns nothing when Qloo is unreachable', async () => {
    const qloo = { recommend: vi.fn(async () => Promise.reject(new Error('offline'))) };
    expect(await guessCards(qloo as never, { ids: ['seed'], names: {}, exclude: [] })).toEqual([]);
  });
});

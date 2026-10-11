import { describe, expect, it } from 'vitest';
import type { PlaceSummary } from '@/lib/qloo/types';
import { compareGroup, groupCategories, planGroup, type Person } from './group';

const people: Person[] = [
  { id: 'you', name: 'Riley', ids: ['r1'], hobbyIds: ['pottery'] },
  { id: 'g', name: 'Sam', ids: [], loves: ['Taylor Swift', 'climbing'] },
];

const place = (id: string): PlaceSummary => ({
  id,
  name: `Place ${id}`,
  tags: [],
  tagIds: [],
  affinity: 0.8,
  reasons: [{ kind: 'entity', id: 'r1', score: 0.3 }],
  hours: { saturday: ['10:00-20:00'] },
});

describe('groupCategories', () => {
  it('puts what the request names first', () => {
    expect(groupCategories('records then coffee', people).slice(0, 3)).toEqual(['records', 'cafe', 'pottery']);
  });
  it('falls back to hobbies and defaults', () => {
    expect(groupCategories('anything', people)[0]).toBe('pottery');
  });
});

describe('planGroup', () => {
  it("falls back to the first person's echo when the combined search fails, and keeps fit on stops", async () => {
    const group = [people[0]!, { ...people[1]!, ids: ['s1'] }];
    const qloo = {
      findPlaces: async (o: { tags?: string[]; signals?: { entities?: string[] } }) => {
        if (o.signals?.entities?.includes('s1')) throw new Error('offline');
        return [place(o.tags![0]!.split(':').pop()!)];
      },
    };
    const parse = async () => ({
      stop_reason: 'end_turn',
      parsed_output: {
        exchange: [{ member_id: 'you', text: 'Hi' }],
        title: 'Saturday',
        summary: 'Fun.',
        stops: [{ place_id: 'pottery_classes', time: '14:00', why: 'Calm' }],
      },
    });
    const steps: string[] = [];
    const cards: string[] = [];
    const result = await planGroup(
      { people: group, area: { label: 'X', lat: 1, lon: 2 }, date: '2026-10-17', part: 'afternoon', request: 'pottery' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { qloo: qloo as any, model: { parse } as any, onStep: (s) => steps.push(s.text), onPlaces: (p) => cards.push(...p.map((c) => c.id)) },
    );
    expect(steps.some((s) => s.includes("couldn't check everyone's together"))).toBe(true);
    expect(cards.length).toBeGreaterThan(0);
    expect(result.stops[0]!.fit).toEqual({ you: expect.any(Number) });
  });
});

describe('planGroup with no Qloo data', () => {
  it("uses the scout's places, marked unverified and without fit numbers", async () => {
    const qloo = { findPlaces: async () => { throw new Error('offline'); } };
    const scout = async () => [{ ...place('claude:moms'), reasons: [], affinity: undefined, hours: undefined, unverified: true, description: 'Cozy' }];
    const parse = async () => ({
      stop_reason: 'end_turn',
      parsed_output: { exchange: [{ member_id: 'you', text: 'Hi' }], title: 'T', summary: 'S', stops: [{ place_id: 'claude:moms', time: '14:00', why: 'Cozy' }] },
    });
    const result = await planGroup(
      { people, area: { label: 'X', lat: 1, lon: 2 }, date: '2026-10-17', request: 'anything' },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { qloo: qloo as any, model: { parse } as any, onStep: () => {}, scout },
    );
    expect(result.stops[0]).toMatchObject({ unverified: true });
    expect(result.stops[0]!.fit).toBeUndefined();
  });
});

describe('compareGroup', () => {
  it('gives a rough comparison when a friend has no matched tastes', async () => {
    const qloo = { compare: async () => { throw new Error('no'); }, recommend: async () => [] };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await compareGroup(people, qloo as any);
    expect(out.rough).toBe(true);
    expect(out.differences.find((d) => d.personId === 'g')?.tags).toEqual(['Taylor Swift', 'climbing']);
  });
});

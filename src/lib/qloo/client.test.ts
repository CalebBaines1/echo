import { describe, expect, it } from 'vitest';
import { Budget, MemoryBudgetStore } from './budget';
import { MemoryCache, cacheKey, encodeParams } from './cache';
import { QlooClient } from './client';
import { QlooBudgetError, QlooError, QlooOfflineError } from './errors';
import { FAKE_PLACE, TEST_KEY, fakeFetch, json, makeClient } from './test-helpers';

describe('cache keys', () => {
  it('ignores parameter order and empty values, and joins arrays with commas', () => {
    expect(encodeParams({ b: 2, a: ['x', 'y'], c: undefined, d: '', e: [] })).toEqual([
      ['a', 'x,y'],
      ['b', '2'],
    ]);
    expect(cacheKey('/search', { query: 'a', take: 3 })).toBe(cacheKey('/search', { take: 3, query: 'a' }));
    expect(cacheKey('/search', { query: 'a' })).not.toBe(cacheKey('/search', { query: 'b' }));
  });
});

describe('offline mode', () => {
  it('throws on a cache miss without calling Qloo', async () => {
    const f = fakeFetch([json({ results: [] })]);
    const { client } = makeClient({ mode: 'offline', fetch: f.impl });
    await expect(client.searchEntities({ query: 'severance' })).rejects.toBeInstanceOf(QlooOfflineError);
    expect(f.calls).toHaveLength(0);
  });

  it('serves cached responses even when they are past their expiry', async () => {
    const cache = new MemoryCache();
    const f = fakeFetch([json({ results: [] })]);
    const { client } = makeClient({ mode: 'offline', cache, fetch: f.impl });
    const key = cacheKey('/search', { query: 'severance', take: 3 });
    await cache.set(key, {
      value: { results: [{ name: 'Severance', entity_id: 'E-1', types: ['urn:entity:tv_show'] }] },
      request: 'x',
      storedAt: 0,
      expiresAt: 1,
    });
    const out = await client.searchEntities({ query: 'severance' });
    expect(out).toEqual([{ id: 'E-1', name: 'Severance', type: 'tv_show', disambiguation: undefined, year: undefined }]);
    expect(f.calls).toHaveLength(0);
  });
});

describe('live mode', () => {
  it('calls Qloo once, then serves the same request from cache', async () => {
    const f = fakeFetch([json({ results: [{ name: 'Severance', entity_id: 'E-1', types: ['urn:entity:tv_show'] }] })]);
    const { client } = makeClient({ fetch: f.impl });
    await client.searchEntities({ query: 'severance', types: ['tv_show'] });
    await client.searchEntities({ query: 'severance', types: ['tv_show'] });
    expect(f.calls).toHaveLength(1);
    expect(f.calls[0]!.headers['X-Api-Key']).toBe(TEST_KEY);
    expect(f.calls[0]!.url.origin).toBe('https://qloo.test');
    expect(client.stats).toEqual({ cacheHits: 1, liveCalls: 1 });
  });

  it('makes one call for identical concurrent requests', async () => {
    const f = fakeFetch([json({ results: [] })]);
    const { client } = makeClient({ fetch: f.impl });
    await Promise.all([client.findTags({ query: 'quiet' }), client.findTags({ query: 'quiet' })]);
    expect(f.calls).toHaveLength(1);
  });

  it('refetches after the cached entry expires', async () => {
    let now = 1_000;
    const f = fakeFetch([json({ results: { tags: [] } })]);
    const { client } = makeClient({ fetch: f.impl, now: () => now });
    await client.findTags({ query: 'quiet' });
    now += 91 * 24 * 60 * 60 * 1000;
    await client.findTags({ query: 'quiet' });
    expect(f.calls).toHaveLength(2);
  });

  it('retries once after a 429', async () => {
    const f = fakeFetch([json({ error: { reason: 'slow down' } }, 429, { 'retry-after': '0' }), json({ results: { tags: [] } })]);
    const { client } = makeClient({ fetch: f.impl });
    await expect(client.findTags({ query: 'quiet' })).resolves.toEqual([]);
    expect(f.calls).toHaveLength(2);
  });

  it("doesn't cache errors, and never puts the key in error messages", async () => {
    const f = fakeFetch([json({ error: { reason: 'Bad Request', message: `echo ${TEST_KEY}` } }, 400)]);
    const { client, cache } = makeClient({ fetch: f.impl });
    const err = await client.findTags({ query: 'x' }).catch((e) => e);
    expect(err).toBeInstanceOf(QlooError);
    expect(err.status).toBe(400);
    expect(err.message).not.toContain(TEST_KEY);
    expect(cache.size).toBe(0);
  });

  it('requires an API key', async () => {
    const { client } = makeClient({ apiKey: undefined });
    await expect(client.findTags({ query: 'x' })).rejects.toThrow('QLOO_API_KEY');
  });
});

describe('budget', () => {
  it('stops at the daily cap without calling Qloo', async () => {
    const f = fakeFetch([json({ results: { tags: [] } })]);
    const budget = new Budget({ store: new MemoryBudgetStore(), dailyCap: 1, monthlyReserve: 0 });
    const { client } = makeClient({ fetch: f.impl, budget });
    await client.findTags({ query: 'a' });
    await expect(client.findTags({ query: 'b' })).rejects.toBeInstanceOf(QlooBudgetError);
    expect(f.calls).toHaveLength(1);
  });

  it('stops when Qloo reports the monthly reserve is reached', async () => {
    const f = fakeFetch([json({ results: { tags: [] } }, 200, { 'x-month-ratelimit-remaining': '3000', 'x-month-ratelimit-limit': '10000' })]);
    const budget = new Budget({ store: new MemoryBudgetStore(), dailyCap: 100, monthlyReserve: 3000 });
    const { client } = makeClient({ fetch: f.impl, budget });
    await client.findTags({ query: 'a' });
    await expect(client.findTags({ query: 'b' })).rejects.toThrow(/reserve/);
    expect(f.calls).toHaveLength(1);
    expect((await budget.status()).monthLimit).toBe(10000);
  });

  it('resets the daily count on a new UTC day', async () => {
    let day = new Date('2026-10-10T12:00:00Z');
    const budget = new Budget({ store: new MemoryBudgetStore(), dailyCap: 1, monthlyReserve: 0, now: () => day });
    await budget.reserve('a');
    await expect(budget.reserve('b')).rejects.toBeInstanceOf(QlooBudgetError);
    day = new Date('2026-10-11T00:01:00Z');
    await expect(budget.reserve('c')).resolves.toBeUndefined();
  });

  it('ignores responses without rate-limit headers', async () => {
    const budget = new Budget({ store: new MemoryBudgetStore(), dailyCap: 5, monthlyReserve: 3000 });
    await budget.record(new Headers());
    await expect(budget.reserve('a')).resolves.toBeUndefined();
  });
});

describe('request building', () => {
  it('uses the /search spelling for video games and maps it back', async () => {
    const f = fakeFetch([json({ results: [{ name: 'Some Game', entity_id: 'G-1', types: ['urn:entity:videogame'] }] })]);
    const { client } = makeClient({ fetch: f.impl });
    const [game] = await client.searchEntities({ query: 'some game', types: ['video_game'] });
    expect(f.calls[0]!.url.searchParams.get('types')).toBe('urn:entity:videogame');
    expect(game!.type).toBe('video_game');
  });

  it('sends lat,lon to /search and WKT to Insights', async () => {
    const f = fakeFetch([json({ results: [] }), json({ results: { entities: [] } })]);
    const { client } = makeClient({ fetch: f.impl });
    await client.searchPlaces({ query: 'pottery', near: { lat: 40.7, lon: -74 } });
    await client.findPlaces({ near: { lat: 40.7, lon: -74 }, tags: ['t1', 't2'], tagOperator: 'intersection', signals: { entities: ['E-1'] } });
    expect(f.calls[0]!.url.searchParams.get('filter.location')).toBe('40.7,-74');
    const p = f.calls[1]!.url.searchParams;
    expect(p.get('filter.location')).toBe('POINT(-74 40.7)');
    expect(p.get('filter.type')).toBe('urn:entity:place');
    expect(p.get('filter.tags')).toBe('t1,t2');
    expect(p.get('operator.filter.tags')).toBe('intersection');
    expect(p.get('signal.interests.entities')).toBe('E-1');
    expect(p.get('feature.explainability')).toBe('true');
  });

  it('normalizes places into the small shape the agent uses', async () => {
    const f = fakeFetch([json({ results: { entities: [FAKE_PLACE] } })]);
    const { client } = makeClient({ fetch: f.impl });
    const [place] = await client.findPlaces({ near: { lat: 40.7, lon: -74 }, tags: ['urn:tag:category:place:pottery_classes'] });
    expect(place).toEqual({
      id: 'P-1',
      name: 'Clay Corner',
      location: { lat: 40.71, lon: -74 },
      address: '1 Test St',
      neighborhood: 'Testville',
      distanceMeters: 1200.5,
      affinity: 0.91,
      priceLevel: 2,
      hours: { saturday: ['09:00-17:00'], sunday: [] },
      description: 'A small pottery studio.',
      website: undefined,
      tags: ['Pottery classes', 'Quiet'],
      tagIds: ['urn:tag:category:place:pottery_classes', 'urn:tag:noise_level:qloo:quiet'],
      reasons: [
        { kind: 'entity', id: 'E-1', score: 0.3 },
        { kind: 'entity', id: 'E-2', score: 0.1 },
      ],
    });
    expect(JSON.stringify(place)).not.toContain('should not appear');
  });

  it('splits compare results into shared and one-sided tags', async () => {
    const tag = (id: string, query: object) => ({ tag_id: id, name: id, subtype: 'urn:tag:genre:media', query });
    const f = fakeFetch([json({ results: { tags: [tag('drama', { score: 0.7 })], a: [tag('scifi', { count: '3' })], b: [tag('comedy', { count: '2' })] } })]);
    const { client } = makeClient({ fetch: f.impl });
    const out = await client.compare({ a: ['E-1'], b: ['E-2'] });
    expect(out.shared[0]).toMatchObject({ id: 'drama', score: 0.7 });
    expect(out.onlyA[0]).toMatchObject({ id: 'scifi', count: 3 });
    expect(out.onlyB[0]).toMatchObject({ id: 'comedy', count: 2 });
  });
});

describe('spacing', () => {
  it('waits between live calls to stay under the per-second limit', async () => {
    const waits: number[] = [];
    let now = 0;
    const f = fakeFetch([json({ results: { tags: [] } })]);
    const client = new QlooClient({
      mode: 'live',
      apiKey: TEST_KEY,
      baseUrl: 'https://qloo.test',
      cache: new MemoryCache(),
      budget: new Budget({ store: new MemoryBudgetStore(), dailyCap: 100, monthlyReserve: 0 }),
      fetch: f.impl,
      minIntervalMs: 220,
      now: () => now,
      sleep: async (ms) => {
        waits.push(ms);
        now += ms;
      },
    });
    await client.findTags({ query: 'a' });
    await client.findTags({ query: 'b' });
    await client.findTags({ query: 'c' });
    expect(waits).toEqual([220, 220]);
  });
});

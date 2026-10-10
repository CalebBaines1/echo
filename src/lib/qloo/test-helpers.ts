// Test helpers. Fixtures here are invented and only mimic the shape of Qloo
// responses; no real Qloo data is checked in.

import { Budget, MemoryBudgetStore } from './budget';
import { MemoryCache } from './cache';
import { QlooClient, type QlooClientOptions } from './client';

export const TEST_KEY = 'test-key-123';

export interface FakeCall {
  url: URL;
  headers: Record<string, string>;
}

export function fakeFetch(responses: Array<() => Response>) {
  const calls: FakeCall[] = [];
  let i = 0;
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: new URL(String(input)), headers: { ...(init?.headers as Record<string, string>) } });
    const next = responses[Math.min(i++, responses.length - 1)];
    if (!next) throw new Error('fakeFetch has no responses');
    return next();
  }) as typeof fetch;
  return { impl, calls };
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return () => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

export function makeClient(overrides: Partial<QlooClientOptions> = {}) {
  const cache = new MemoryCache();
  const budget = new Budget({ store: new MemoryBudgetStore(), dailyCap: 100, monthlyReserve: 0 });
  const client = new QlooClient({
    mode: 'live',
    apiKey: TEST_KEY,
    baseUrl: 'https://qloo.test',
    cache,
    budget,
    sleep: async () => {},
    minIntervalMs: 0,
    ...overrides,
  });
  return { client, cache, budget };
}

export const FAKE_PLACE = {
  name: 'Clay Corner',
  entity_id: 'P-1',
  type: 'urn:entity:place',
  location: { lat: 40.71, lon: -74.0, geohash: 'x' },
  properties: {
    address: '1 Test St',
    neighborhood: 'Testville',
    price_level: 2,
    short_description: 'A small pottery studio.',
    hours: {
      saturday: [{ opens: 'T09:00:00', closes: 'T17:00:00', closed: false }],
      sunday: [{ opens: 'T00:00:00', closes: 'T00:00:00', closed: true }],
    },
    akas: [{ language: 'fr', value: 'should not appear' }],
  },
  tags: [
    { id: 'urn:tag:category:place:pottery_classes', name: 'Pottery classes', type: 'urn:tag:category:place' },
    { id: 'urn:tag:noise_level:qloo:quiet', name: 'Quiet', type: 'urn:tag:noise_level:qloo' },
  ],
  query: {
    affinity: 0.91,
    distance: 1200.5,
    explainability: {
      'signal.interests.entities': [
        { entity_id: 'E-2', score: 0.1 },
        { entity_id: 'E-1', score: 0.3 },
      ],
    },
  },
};

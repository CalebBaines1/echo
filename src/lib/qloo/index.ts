import { join } from 'node:path';
import { Budget, FileBudgetStore } from './budget';
import { FileCache } from './cache';
import { QlooClient, type QlooClientOptions } from './client';

export * from './budget';
export * from './cache';
export * from './client';
export * from './errors';
export * from './normalize';
export * from './tags';
export type * from './types';

/**
 * Builds a client from environment variables.
 *
 * Live calls are off unless QLOO_LIVE=1. Offline, only cached responses are
 * served, so nothing can spend the hackathon quota by accident.
 *
 *   QLOO_LIVE=1               allow live calls
 *   QLOO_API_KEY              required for live calls
 *   QLOO_BASE_URL             defaults to https://hackathon.api.qloo.com
 *   QLOO_DAILY_CAP            live calls per UTC day (default 300)
 *   QLOO_MONTHLY_RESERVE      stop when this many calls are left (default 3000)
 *   QLOO_CACHE_DIR            defaults to .cache/qloo
 *
 * The file cache and budget are for local development. Production needs a
 * database-backed cache and budget store, since serverless files don't persist.
 */
export function createQlooClientFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  overrides: Partial<QlooClientOptions> = {},
): QlooClient {
  const dir = env.QLOO_CACHE_DIR || join(process.cwd(), '.cache', 'qloo');
  return new QlooClient({
    mode: env.QLOO_LIVE === '1' ? 'live' : 'offline',
    apiKey: env.QLOO_API_KEY,
    baseUrl: env.QLOO_BASE_URL,
    cache: new FileCache(join(dir, 'responses')),
    budget: new Budget({
      store: new FileBudgetStore(join(dir, 'budget.json')),
      dailyCap: positiveInt(env.QLOO_DAILY_CAP, 300),
      monthlyReserve: positiveInt(env.QLOO_MONTHLY_RESERVE, 3000),
    }),
    ...overrides,
  });
}

function positiveInt(v: string | undefined, fallback: number): number {
  if (v === undefined || v.trim() === '') return fallback;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

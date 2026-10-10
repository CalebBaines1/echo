import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import type { QlooClient } from './client';
import { DbBudget, DbCache } from './db-store';
import { createQlooClientFromEnv } from './index';

let client: QlooClient | undefined;

function intEnv(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v.trim() === '') return fallback;
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
}

/**
 * Shared server-side Qloo client. Offline unless QLOO_LIVE=1.
 * With Supabase configured, the cache and call budget live in Postgres so every
 * serverless instance shares them. QLOO_CACHE=file forces the local file cache.
 */
export function getQloo(): QlooClient {
  if (client) return client;
  const db = process.env.QLOO_CACHE === 'file' ? undefined : getSupabaseAdmin();
  client = db
    ? createQlooClientFromEnv(process.env, {
        cache: new DbCache(db),
        budget: new DbBudget(db, intEnv('QLOO_DAILY_CAP', 300), intEnv('QLOO_MONTHLY_RESERVE', 3000)),
      })
    : createQlooClientFromEnv();
  return client;
}

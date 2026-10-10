// Loads responses saved by the probe (results/<timestamp>/*.json) into the
// local dev cache, so development can run offline against real Qloo data
// without spending any calls.
//
// Usage: npm run qloo:seed          (local file cache)
//        npm run qloo:seed:db       (Supabase cache, used by deployed builds)

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { CACHE_TTL_MS, FileCache, cacheKey, type Params, type QlooCache, type RequestKind } from '../src/lib/qloo';
import { DbCache } from '../src/lib/qloo/db-store';

const RESULTS = 'results';
const toDb = process.argv.includes('--db');
const dir = process.env.QLOO_CACHE_DIR || join(process.cwd(), '.cache', 'qloo');

let cache: QlooCache;
let target: string;
if (toDb) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local first.');
    process.exit(1);
  }
  cache = new DbCache(createClient(url, key, { auth: { persistSession: false } }));
  target = 'the Supabase qloo_cache table';
} else {
  cache = new FileCache(join(dir, 'responses'));
  target = join(dir, 'responses');
}

function kindOf(path: string): RequestKind | undefined {
  if (path === '/search') return 'search';
  if (path === '/v2/tags') return 'tags';
  if (path === '/v2/insights') return 'insights';
  if (path === '/v2/analysis/compare') return 'compare';
  if (path === '/v2/trending') return 'trending';
  return undefined;
}

let runs: string[] = [];
try {
  runs = (await readdir(RESULTS, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
} catch {
  console.error('No results/ folder found. Nothing to seed.');
  process.exit(0);
}

let seeded = 0;
let skipped = 0;
// Oldest first, so the newest saved response for a request wins.
for (const run of runs) {
  for (const file of (await readdir(join(RESULTS, run))).filter((f) => f.endsWith('.json'))) {
    const saved = JSON.parse(await readFile(join(RESULTS, run, file), 'utf8'));
    const [path, qs = ''] = String(saved.request ?? '').split('?');
    const kind = path ? kindOf(path) : undefined;
    if (saved.status !== 200 || !kind || typeof saved.body !== 'object') {
      skipped++;
      continue;
    }
    const params: Params = Object.fromEntries(new URLSearchParams(qs));
    const now = Date.now();
    await cache.set(cacheKey(path!, params), {
      value: saved.body,
      request: saved.request,
      storedAt: now,
      expiresAt: now + CACHE_TTL_MS[kind],
    });
    seeded++;
  }
}

console.log(`Seeded ${seeded} cached responses into ${target} (skipped ${skipped} failed or unknown).`);

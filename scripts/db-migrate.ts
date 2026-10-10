// Applies supabase/migrations/*.sql in order, once each.
// Usage: npm run db:migrate   (reads SUPABASE_DB_URL from .env.local)

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';

const url = process.env.SUPABASE_DB_URL?.trim();
if (!url) {
  console.error('SUPABASE_DB_URL is not set. Add the connection string from Supabase (Connect → Session pooler) to .env.local.');
  process.exit(1);
}

/**
 * Passwords copied from Supabase often contain characters like # or ? that
 * aren't valid in a URL. Escape the password part if the URL doesn't parse.
 */
function normalize(raw: string): string {
  try {
    new URL(raw);
    return raw;
  } catch {
    const m = raw.match(/^(postgres(?:ql)?:\/\/)([^:]+):(.*)@([^@]+)$/);
    if (!m) throw new Error('SUPABASE_DB_URL is not a valid connection string.');
    return `${m[1]}${m[2]}:${encodeURIComponent(m[3]!)}@${m[4]}`;
  }
}

const client = new pg.Client({ connectionString: normalize(url), ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query(`create table if not exists public._migrations (name text primary key, applied_at timestamptz not null default now())`);
  const applied = new Set((await client.query<{ name: string }>('select name from public._migrations')).rows.map((r) => r.name));
  const dir = join('supabase', 'migrations');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();

  let ran = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(join(dir, file), 'utf8');
    process.stdout.write(`Applying ${file}… `);
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into public._migrations (name) values ($1)', [file]);
      await client.query('commit');
      console.log('done');
      ran++;
    } catch (err) {
      await client.query('rollback');
      console.log('failed');
      throw err;
    }
  }
  console.log(ran ? `Applied ${ran} migration(s).` : 'Database is up to date.');
} finally {
  await client.end();
}

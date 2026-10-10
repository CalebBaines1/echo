import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NextResponse } from 'next/server';
import { tasteKey } from '@/lib/onboarding/resolve';
import type { HeardTaste, MentionType } from '@/lib/onboarding/types';
import { toEntitySummary } from '@/lib/qloo/normalize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Development only. Rebuilds the sample people from the Qloo probe's saved
// responses (results/, gitignored) in the same order the probe used, so every
// downstream request hits the local cache and spends no Qloo calls.

const RILEY: Array<[file: string, type: MentionType]> = [
  ['phoebe_bridgers', 'artist'],
  ['bon_iver', 'artist'],
  ['severance', 'tv_show'],
  ['that_show_severance', 'tv_show'],
  ['past_lives', 'movie'],
  ['hollow_knight', 'video_game'],
  ['ursula_le_guin', 'author'],
];
const JORDAN: Array<[file: string, type: MentionType]> = [
  ['everything_everywhere_all_at_once', 'movie'],
  ['nathan_fielder', 'person'],
  ['animal_crossing', 'video_game'],
  ['charli_xcx', 'artist'],
];

async function latestRunWith(file: string): Promise<string | undefined> {
  const runs = (await readdir('results', { withFileTypes: true }).catch(() => []))
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort()
    .reverse();
  for (const run of runs) {
    const path = join('results', run, `search_${file}.json`);
    const ok = await readFile(path, 'utf8').then(
      (t) => JSON.parse(t).status === 200,
      () => false,
    );
    if (ok) return path;
  }
  return undefined;
}

async function person(list: Array<[string, MentionType]>): Promise<HeardTaste[]> {
  const out: HeardTaste[] = [];
  for (const [file, type] of list) {
    const path = await latestRunWith(file);
    if (!path) continue;
    const top = JSON.parse(await readFile(path, 'utf8')).body?.results?.[0];
    if (!top) continue;
    const entity = toEntitySummary(top);
    out.push({ key: tasteKey(entity.name, type), name: entity.name, type, status: 'matched', entity });
  }
  return out;
}

export async function GET() {
  if (process.env.NODE_ENV === 'production') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const [riley, jordan] = await Promise.all([person(RILEY), person(JORDAN)]);
  if (riley.length === 0) {
    return NextResponse.json({ error: 'No saved probe results found. Run the Qloo probe first.' }, { status: 404 });
  }
  return NextResponse.json({
    riley,
    jordan,
    note: "Reproduces the API test run exactly, including one wrong match (That '70s Show), so requests hit the local cache.",
  });
}

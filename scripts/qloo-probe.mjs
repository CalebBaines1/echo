// Qloo API probe: checks whether the data Echo depends on is good enough before
// any app code is written. Runs each check, saves raw responses under
// results/<timestamp>/, and prints a summary.
//
// Usage: npm run qloo:probe   (reads QLOO_API_KEY from .env.local)
//
// The API key is only ever placed in the request header. It is never logged,
// written to disk, or included in error output.

import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const KEY = process.env.QLOO_API_KEY?.trim();
if (!KEY) {
  console.error('QLOO_API_KEY is not set. Copy .env.local.example to .env.local and add your key.');
  process.exit(1);
}

const BASE = (process.env.QLOO_BASE_URL?.trim() || 'https://hackathon.api.qloo.com')
  .replace(/\/+$/, '')
  .replace(/\/v2$/, '');
const LAT = Number(process.env.TEST_LAT) || 40.7226;
const LON = Number(process.env.TEST_LON) || -73.9982;
const POINT = `POINT(${LON} ${LAT})`;

const RUN_DIR = join('results', new Date().toISOString().replace(/[:.]/g, '-'));
await mkdir(RUN_DIR, { recursive: true });

const calls = [];
const summary = [];

function note(line = '') {
  summary.push(line);
  console.log(line);
}

function redact(text) {
  return String(text).split(KEY).join('[redacted]');
}

async function qloo(label, path, params = {}) {
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    qs.set(k, Array.isArray(v) ? v.join(',') : String(v));
  }
  const url = `${BASE}${path}?${qs}`;

  for (let attempt = 1; attempt <= 2; attempt++) {
    const started = performance.now();
    let res, text;
    try {
      res = await fetch(url, { headers: { 'X-Api-Key': KEY, accept: 'application/json' } });
      text = await res.text();
    } catch (err) {
      const ms = Math.round(performance.now() - started);
      calls.push({ label, path, status: 'network error', ms });
      console.log(`  ✗ ${label}: network error (${redact(err.message)})`);
      return { ok: false, status: 0, json: null, ms };
    }
    const ms = Math.round(performance.now() - started);

    const limits = [...res.headers].filter(([h]) => /rate|limit|retry/i.test(h));
    if (res.status === 429 && attempt === 1) {
      const wait = Math.min(Number(res.headers.get('retry-after')) || 5, 30);
      console.log(`  … ${label}: rate limited, retrying in ${wait}s ${JSON.stringify(Object.fromEntries(limits))}`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }

    let json = null;
    try { json = JSON.parse(text); } catch { /* non-JSON body */ }
    await writeFile(
      join(RUN_DIR, `${label.replace(/[^a-z0-9]+/gi, '_')}.json`),
      redact(JSON.stringify({ request: `${path}?${qs}`, status: res.status, ms, rateLimitHeaders: Object.fromEntries(limits), body: json ?? text }, null, 2)),
    );

    const count = entitiesOf(json).length;
    calls.push({ label, path, status: res.status, ms, count, limits: Object.fromEntries(limits) });
    const mark = res.ok ? '✓' : '✗';
    const detail = res.ok ? `${count} results` : redact((json?.message || json?.reason || text || '').slice(0, 160));
    console.log(`  ${mark} ${label}: ${res.status} in ${ms} ms, ${detail}`);
    return { ok: res.ok, status: res.status, json, ms };
  }
}

// Response shapes differ between endpoints; accept the common variants.
function entitiesOf(json) {
  const r = json?.results;
  if (Array.isArray(r)) return r;
  if (Array.isArray(r?.entities)) return r.entities;
  if (Array.isArray(r?.tags)) return r.tags;
  if (Array.isArray(r?.trending)) return r.trending;
  return [];
}
const idOf = (e) => e?.entity_id ?? e?.id ?? e?.tag_id;
const typeOf = (e) => (Array.isArray(e?.types) ? e.types[0] : e?.types) ?? e?.type ?? e?.subtype ?? '';
const short = (t) => String(t).replace('urn:entity:', '').replace('urn:tag:', 'tag:');
const tagNames = (e) => (e?.tags ?? []).map((t) => t?.name ?? t).filter(Boolean);

function describePlace(e) {
  const p = e?.properties ?? {};
  const bits = [];
  if (p.price_level != null) bits.push(`price ${p.price_level}`);
  if (p.hours) bits.push('has hours');
  if (e?.query?.distance != null) bits.push(`${(e.query.distance / 1609).toFixed(1)} mi`);
  if (e?.query?.affinity != null) bits.push(`affinity ${Number(e.query.affinity).toFixed(2)}`);
  const tags = tagNames(e).slice(0, 4);
  if (tags.length) bits.push(`tags: ${tags.join(', ')}`);
  return `${e?.name ?? '(no name)'}${bits.length ? ` (${bits.join('; ')})` : ''}`;
}

function hasExplainability(e) {
  return Boolean(e?.query?.explainability ?? e?.explainability);
}

// ---------------------------------------------------------------------------
// Sample people. Queries are written the way someone would say them out loud.
// ---------------------------------------------------------------------------
const RILEY = [
  { say: 'phoebe bridgers', types: ['urn:entity:artist'] },
  { say: 'bon iver', types: ['urn:entity:artist'] },
  { say: 'severance', types: ['urn:entity:tv_show'] },
  { say: 'that show severance', types: ['urn:entity:tv_show'] },
  { say: 'past lives', types: ['urn:entity:movie'] },
  { say: 'hollow knight', types: ['urn:entity:videogame'] },
  { say: 'ursula le guin', types: ['urn:entity:person', 'urn:entity:book'] },
];
const JORDAN = [
  { say: 'everything everywhere all at once', types: ['urn:entity:movie'] },
  { say: 'nathan fielder', types: ['urn:entity:person', 'urn:entity:tv_show'] },
  { say: 'animal crossing', types: ['urn:entity:videogame'] },
  { say: 'charli xcx', types: ['urn:entity:artist'] },
];
const AMBIGUOUS = [{ say: 'dune', types: ['urn:entity:movie', 'urn:entity:book'] }];

const HOBBY_PLACES = ['pottery studio', 'ceramics', 'board game cafe', 'climbing gym', 'record store', 'bookstore', 'art supply store', 'cinema'];
const VIBE_TAGS = ['solo', 'quiet', 'cozy', 'hands-on', 'good for groups', 'pottery', 'board games', 'live music'];

note(`# Qloo probe`);
note(`Base: ${BASE}`);
note(`Test location: ${LAT}, ${LON}`);
note(`Raw responses: ${RUN_DIR}/`);
note();

// 1. Entity search -----------------------------------------------------------
note('## 1. Entity search (spoken names)');
const resolved = {};
async function resolve(list) {
  const ids = [];
  for (const item of list) {
    const r = await qloo(`search ${item.say}`, '/search', { query: item.say, types: item.types, take: 3 });
    if (r?.status === 401 || r?.status === 403) {
      note();
      note(`Qloo rejected the key (${r.status}). Check QLOO_API_KEY and QLOO_BASE_URL in .env.local, then rerun.`);
      await finish();
      process.exit(1);
    }
    const top = entitiesOf(r?.json);
    const line = top.map((e) => `${e.name} [${short(typeOf(e))}]`).join(' | ') || 'no results';
    note(`- "${item.say}" → ${line}`);
    if (top[0] && idOf(top[0])) { ids.push(idOf(top[0])); resolved[item.say] = top[0]; }
  }
  return ids;
}
const rileyIds = await resolve(RILEY);
const jordanIds = await resolve(JORDAN);
await resolve(AMBIGUOUS);
const firstSearch = calls.find((c) => c.path === '/search' && c.status === 200);
if (!firstSearch) {
  note();
  note('Search failed for every query. Check the key and QLOO_BASE_URL, then rerun. Stopping here.');
  await finish();
  process.exit(1);
}
note(`Resolved ${rileyIds.length} of ${RILEY.length} for Riley, ${jordanIds.length} of ${JORDAN.length} for Jordan.`);
note();

// 2. Taste-based media recommendations ---------------------------------------
note('## 2. Cross-domain picks for Riley (Insights + explainability)');
for (const type of ['urn:entity:tv_show', 'urn:entity:artist', 'urn:entity:book', 'urn:entity:podcast']) {
  const r = await qloo(`insights ${short(type)} for riley`, '/v2/insights', {
    'filter.type': type,
    'signal.interests.entities': rileyIds,
    'feature.explainability': true,
    take: 5,
  });
  const ents = entitiesOf(r?.json);
  note(`- ${short(type)}: ${ents.map((e) => e.name).join(', ') || 'none'}${ents.some(hasExplainability) ? ' (explainability present)' : ''}`);
}
note();

// 3. Places for hobbies --------------------------------------------------------
note('## 3. Hobby places near the test location');
note('Keyword search (no taste signal):');
for (const q of HOBBY_PLACES) {
  const r = await qloo(`place search ${q}`, '/search', {
    query: q,
    types: ['urn:entity:place'],
    'filter.location': `${LAT},${LON}`,
    'filter.radius': 5,
    take: 5,
  });
  const ents = entitiesOf(r?.json);
  note(`- ${q}: ${ents.length ? ents.slice(0, 3).map(describePlace).join(' | ') : 'no results'}`);
}
note();
note("Taste-ranked places near the location (Riley's signal):");
{
  const r = await qloo('insights places for riley', '/v2/insights', {
    'filter.type': 'urn:entity:place',
    'filter.location': POINT,
    'filter.location.radius': 8000,
    'signal.interests.entities': rileyIds,
    'feature.explainability': true,
    take: 15,
  });
  const ents = entitiesOf(r?.json);
  for (const e of ents.slice(0, 10)) note(`- ${describePlace(e)}`);
  if (!ents.length) note('- none');
  const withHours = ents.filter((e) => e?.properties?.hours).length;
  const withPrice = ents.filter((e) => e?.properties?.price_level != null).length;
  note(`Of ${ents.length}: ${withHours} have hours, ${withPrice} have a price level, ${ents.filter(hasExplainability).length} have explainability.`);
  if (ents[0]) note(`First place fields: ${Object.keys(ents[0]).join(', ')}; properties: ${Object.keys(ents[0].properties ?? {}).join(', ')}`);
}
note();

note("Hobby places by category tag, ranked by Riley's taste:");
async function findTag(query) {
  const r = await qloo(`tag lookup ${query}`, '/v2/tags', { 'filter.query': query, take: 10 });
  const tags = entitiesOf(r?.json);
  return tags.find((t) => String(idOf(t)).startsWith('urn:tag:category:place:')) ?? tags[0];
}
const HOBBY_TAGS = ['pottery classes', 'board game', 'climbing gym', 'record store', 'book store', 'art supply', 'movie theater', 'live music venue'];
let hobbyHits = 0;
for (const q of HOBBY_TAGS) {
  const tag = await findTag(q);
  if (!tag) { note(`- ${q}: no tag found`); continue; }
  const r = await qloo(`hobby places ${q}`, '/v2/insights', {
    'filter.type': 'urn:entity:place',
    'filter.tags': idOf(tag),
    'filter.location': POINT,
    'filter.location.radius': 8000,
    'signal.interests.entities': rileyIds,
    'feature.explainability': true,
    take: 5,
  });
  const ents = entitiesOf(r?.json);
  if (ents.length) hobbyHits++;
  note(`- ${q} [${idOf(tag)}]: ${ents.length ? ents.slice(0, 3).map(describePlace).join(' | ') : 'no places'}`);
}
note(`${hobbyHits} of ${HOBBY_TAGS.length} hobby categories returned places within 5 mi.`);
{
  const cafe = await findTag('cafe');
  const r = await qloo('quiet cafes', '/v2/insights', {
    'filter.type': 'urn:entity:place',
    'filter.tags': [idOf(cafe), 'urn:tag:noise_level:qloo:quiet'],
    'operator.filter.tags': 'intersection',
    'filter.location': POINT,
    'filter.location.radius': 8000,
    'signal.interests.entities': rileyIds,
    take: 5,
  });
  note(`- quiet cafés (two tags, intersection): ${entitiesOf(r?.json).slice(0, 3).map(describePlace).join(' | ') || 'no places'}`);
}
note();

// 4. Tags for vibe filters -----------------------------------------------------
note('## 4. Tags (for "good to go alone", "quiet", hobby types)');
let tagsWork = false;
for (const q of VIBE_TAGS) {
  const r = await qloo(`tags ${q}`, '/v2/tags', { 'filter.query': q, take: 5 });
  if (r?.ok) tagsWork = true;
  const ents = entitiesOf(r?.json);
  note(`- "${q}": ${ents.map((t) => `${t.name ?? ''} ${idOf(t) ? `(${idOf(t)})` : ''}`.trim()).join(' | ') || (r?.ok ? 'no tags' : `failed (${r?.status})`)}`);
}
if (!tagsWork) note('The tags endpoint did not respond as expected. Check the docs for the current tag search path.');
note();

// 5. Group signal --------------------------------------------------------------
note('## 5. Group picks (Riley + Jordan combined)');
for (const type of ['urn:entity:movie', 'urn:entity:place']) {
  const r = await qloo(`insights group ${short(type)}`, '/v2/insights', {
    'filter.type': type,
    'signal.interests.entities': [...rileyIds, ...jordanIds],
    ...(type === 'urn:entity:place' ? { 'filter.location': POINT, 'filter.location.radius': 8000 } : {}),
    take: 8,
  });
  note(`- ${short(type)}: ${entitiesOf(r?.json).map((e) => e.name).join(', ') || 'none'}`);
}
note();

// 6. Analysis Compare ------------------------------------------------------------
note('## 6. Compare Riley and Jordan');
{
  const r = await qloo('compare riley jordan', '/v2/analysis/compare', {
    'a.signal.interests.entities': rileyIds,
    'b.signal.interests.entities': jordanIds,
    take: 10,
  });
  const ents = entitiesOf(r?.json);
  note(`- ${ents.length} results. ${ents.slice(0, 8).map((e) => e.name ?? e.tag_id ?? JSON.stringify(e).slice(0, 60)).join(' | ') || 'Inspect the raw file for the response shape.'}`);
}
note();

// 7. Trending ---------------------------------------------------------------------
// Trending data lags: in Oct 2026 the latest points were from spring 2026, so
// use a wide window.
note('## 7. Trending (last 9 months)');
{
  const end = new Date();
  const start = new Date(end.getTime() - 270 * 864e5);
  const iso = (d) => d.toISOString().slice(0, 10);
  // Trending is a time series for one entity at a time.
  for (const [say, type] of [['past lives', 'urn:entity:movie'], ['severance', 'urn:entity:tv_show'], ['phoebe bridgers', 'urn:entity:artist']]) {
    const e = resolved[say];
    if (!e) { note(`- ${say}: not resolved, skipped`); continue; }
    const r = await qloo(`trending ${say}`, '/v2/trending', {
      'filter.type': type,
      'filter.start_date': iso(start),
      'filter.end_date': iso(end),
      'signal.interests.entities': idOf(e),
    });
    const series = entitiesOf(r?.json);
    const last = series.at(-1);
    note(`- ${e.name}: ${r?.ok ? `${series.length} weekly points${last ? `, latest ${JSON.stringify(last).slice(0, 140)}` : ''}` : `failed (${r?.status})`}`);
  }
}
note();

await finish();

async function finish() {
  const ok = calls.filter((c) => c.status === 200);
  const ms = ok.map((c) => c.ms).sort((a, b) => a - b);
  const pct = (p) => (ms.length ? ms[Math.min(ms.length - 1, Math.floor((p / 100) * ms.length))] : 0);
  note('## Calls');
  note(`${calls.length} calls, ${ok.length} succeeded. Latency median ${pct(50)} ms, 90th percentile ${pct(90)} ms.`);
  const failed = calls.filter((c) => c.status !== 200);
  for (const c of failed) note(`- failed: ${c.label} → ${c.status}`);
  const limitHeaders = calls.find((c) => c.limits && Object.keys(c.limits).length)?.limits;
  if (limitHeaders) note(`Rate-limit headers: ${JSON.stringify(limitHeaders)}`);
  await writeFile(join(RUN_DIR, 'summary.md'), summary.join('\n') + '\n');
  console.log(`\nSummary saved to ${join(RUN_DIR, 'summary.md')}`);
}

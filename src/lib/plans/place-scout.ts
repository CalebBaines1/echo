import 'server-only';
import { parseOpeningHours } from '@/lib/places/opening-hours';
import type { Area } from '@/lib/profile/types';
import { createSpacer } from '@/lib/qloo/rate-limit';
import { DbCache } from '@/lib/qloo/db-store';
import type { PlaceSummary } from '@/lib/qloo/types';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// A stand-in for Qloo place search while live Qloo calls are off: real places
// from OpenStreetMap (via the Overpass API), with hours when mapped. There's
// no taste score; Claude's planner judges the fit from names and kinds.
// Overpass asks for modest use and an identifying User-Agent; results are cached.

export type PlaceScout = (q: { categoryId?: string; places: string; area: Area; take?: number }) => Promise<PlaceSummary[]>;

// The main Overpass server is often busy; a mirror gets the second try.
const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const USER_AGENT = 'Echo/0.1 (Qloo hackathon app; https://github.com/CalebBaines1)';
const RADIUS_METERS = 16_000;
const CAFE_RADIUS_METERS = 4_000; // Cafés are everywhere; nearby ones are plenty.
const CACHE_DAYS = 7;
const waitForTurn = createSpacer(1100);

/** Which category an OpenStreetMap feature belongs to, and the query that finds it. */
const CATEGORIES: Array<{ id: string; filters: string[]; match: (t: Record<string, string>) => boolean; radius?: number }> = [
  { id: 'pottery', filters: ['["craft"="pottery"]', '["shop"="pottery"]'], match: (t) => t.craft === 'pottery' || t.shop === 'pottery' },
  { id: 'board_games', filters: ['["shop"="games"]'], match: (t) => t.shop === 'games' },
  { id: 'climbing', filters: ['["sport"="climbing"]["leisure"]'], match: (t) => t.sport === 'climbing' },
  { id: 'records', filters: ['["shop"="music"]'], match: (t) => t.shop === 'music' },
  { id: 'books', filters: ['["shop"="books"]'], match: (t) => t.shop === 'books' },
  { id: 'art', filters: ['["shop"="art"]', '["shop"="craft"]'], match: (t) => t.shop === 'art' || t.shop === 'craft' },
  { id: 'film', filters: ['["amenity"="cinema"]'], match: (t) => t.amenity === 'cinema' },
  { id: 'live_music', filters: ['["amenity"="music_venue"]', '["live_music"="yes"]'], match: (t) => t.amenity === 'music_venue' || t.live_music === 'yes' },
  { id: 'cafe', filters: ['["amenity"="cafe"]'], match: (t) => t.amenity === 'cafe', radius: CAFE_RADIUS_METERS },
];

interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

function metersBetween(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

function toPlace(e: OsmElement, area: Area): PlaceSummary | null {
  const t = e.tags ?? {};
  const at = e.center ?? (e.lat !== undefined && e.lon !== undefined ? { lat: e.lat, lon: e.lon } : null);
  if (!t.name || !at) return null;
  const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
  return {
    id: `osm:${e.type}/${e.id}`,
    name: t.name,
    location: at,
    address: [street, t['addr:city']].filter(Boolean).join(', ') || undefined,
    distanceMeters: Math.round(metersBetween(area, at)),
    hours: parseOpeningHours(t.opening_hours),
    website: t.website ?? t['contact:website'],
    description: t.description,
    tags: [t.craft, t.shop, t.amenity, t.sport, t.cuisine].filter((x): x is string => !!x).map((x) => x.replace(/_/g, ' ')),
    tagIds: [],
    reasons: [],
    unverified: true,
  };
}

type AreaPlaces = Record<string, PlaceSummary[]>;

const memory = new Map<string, AreaPlaces>();
const inFlight = new Map<string, Promise<AreaPlaces>>();

async function overpass(query: string): Promise<{ elements?: OsmElement[] }> {
  let last: unknown;
  for (const endpoint of ENDPOINTS) {
    try {
      await waitForTurn();
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'user-agent': USER_AGENT, 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(25_000),
      });
      if (res.ok) return (await res.json()) as { elements?: OsmElement[] };
      last = new Error(`Overpass returned ${res.status}`);
    } catch (err) {
      last = err;
    }
  }
  throw last;
}

/** Every category near an area in one Overpass query: nearest first, ten per category. */
async function fetchArea(area: Area): Promise<AreaPlaces> {
  const parts = CATEGORIES.flatMap((c) => c.filters.map((f) => `nwr${f}(around:${c.radius ?? RADIUS_METERS},${area.lat},${area.lon});`));
  const body = await overpass(`[out:json][timeout:25];(${parts.join('')});out center tags;`);
  const out: AreaPlaces = Object.fromEntries(CATEGORIES.map((c) => [c.id, []]));
  for (const e of body.elements ?? []) {
    const place = toPlace(e, area);
    if (!place) continue;
    for (const c of CATEGORIES) if (c.match(e.tags ?? {})) out[c.id]!.push(place);
  }
  for (const id of Object.keys(out)) {
    const seen = new Set<string>();
    out[id] = out[id]!
      .sort((a, b) => a.distanceMeters! - b.distanceMeters!)
      .filter((p) => {
        const k = p.name.toLowerCase();
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 10);
  }
  return out;
}

/** Cached in memory and in the shared database cache, so each area costs one Overpass query a week. */
async function placesNear(area: Area): Promise<AreaPlaces> {
  const key = `osm:v1:${area.lat.toFixed(2)},${area.lon.toFixed(2)}`;
  const hit = memory.get(key);
  if (hit) return hit;
  const pending = inFlight.get(key);
  if (pending) return pending;

  const work = (async () => {
    const db = getSupabaseAdmin();
    const cache = db ? new DbCache(db) : null;
    const stored = await cache?.get(key);
    if (stored && stored.expiresAt > Date.now()) return stored.value as AreaPlaces;
    const fresh = await fetchArea(area);
    const now = Date.now();
    await cache?.set(key, { value: fresh, request: `overpass ${key}`, storedAt: now, expiresAt: now + CACHE_DAYS * 86_400_000 });
    return fresh;
  })();
  inFlight.set(key, work);
  try {
    const places = await work;
    memory.set(key, places);
    if (memory.size > 100) memory.delete(memory.keys().next().value!);
    return places;
  } finally {
    inFlight.delete(key);
  }
}

export const osmPlaceScout: PlaceScout = async ({ categoryId, area, take = 6 }) => {
  if (!categoryId || !CATEGORIES.some((c) => c.id === categoryId)) return [];
  return ((await placesNear(area))[categoryId] ?? []).slice(0, take);
};

import 'server-only';
import { createSpacer } from '@/lib/qloo/rate-limit';
import type { Area } from '@/lib/profile/types';

// Place-name lookup through OpenStreetMap's Nominatim. Its usage policy asks
// for at most one request a second, an identifying User-Agent, and no
// search-as-you-type, so searches run on submit and results are cached.

const BASE = 'https://nominatim.openstreetmap.org';
const USER_AGENT = 'Echo/0.1 (Qloo hackathon app; https://github.com/CalebBaines1)';
const waitForTurn = createSpacer(1100);
const cache = new Map<string, Area[]>();

/** Coordinates rounded to about a kilometre, so exact addresses are never stored. */
export function roundCoord(n: number): number {
  return Math.round(n * 100) / 100;
}

interface NominatimPlace {
  lat: string;
  lon: string;
  name?: string;
  display_name?: string;
  address?: Record<string, string>;
}

function labelFor(p: NominatimPlace): string {
  const a = p.address ?? {};
  const local = a.neighbourhood || a.suburb || a.city_district || a.quarter || a.borough || p.name;
  const city = a.city || a.town || a.village || a.municipality || a.county;
  const parts = [local, city && city !== local ? city : undefined].filter(Boolean);
  return parts.length ? parts.join(', ') : (p.display_name ?? '').split(',').slice(0, 2).join(',').trim();
}

function toArea(p: NominatimPlace): Area | null {
  const lat = Number(p.lat);
  const lon = Number(p.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  return { label: labelFor(p) || 'Selected area', lat: roundCoord(lat), lon: roundCoord(lon) };
}

async function get(path: string): Promise<unknown> {
  await waitForTurn();
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'en' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Place lookup failed (${res.status}).`);
  return res.json();
}

export async function searchAreas(query: string): Promise<Area[]> {
  const q = query.trim().toLowerCase();
  const hit = cache.get(`s:${q}`);
  if (hit) return hit;
  const body = (await get(`/search?format=jsonv2&addressdetails=1&limit=5&q=${encodeURIComponent(q)}`)) as NominatimPlace[];
  const seen = new Set<string>();
  const areas = body.map(toArea).filter((a): a is Area => {
    if (!a || seen.has(a.label)) return false;
    seen.add(a.label);
    return true;
  });
  cache.set(`s:${q}`, areas);
  return areas;
}

export async function reverseArea(lat: number, lon: number): Promise<Area> {
  const rl = roundCoord(lat);
  const rn = roundCoord(lon);
  const key = `r:${rl},${rn}`;
  const hit = cache.get(key);
  if (hit?.[0]) return hit[0];
  const body = (await get(`/reverse?format=jsonv2&addressdetails=1&zoom=14&lat=${rl}&lon=${rn}`)) as NominatimPlace;
  const area = { ...(toArea(body) ?? { label: 'Your area', lat: rl, lon: rn }), lat: rl, lon: rn };
  cache.set(key, [area]);
  return area;
}

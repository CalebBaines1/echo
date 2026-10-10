import type { Budget } from './budget';
import { cacheKey, requestString, type Params, type QlooCache } from './cache';
import { QlooError, QlooOfflineError } from './errors';
import {
  toCompareTag,
  toEntitySummary,
  toMediaSummary,
  toPlaceSummary,
  toTagSummary,
  toTrendPoint,
} from './normalize';
import { createSpacer, realSleep, type Sleep } from './rate-limit';
import type {
  CompareResult,
  EntitySummary,
  EntityType,
  LatLon,
  MediaSummary,
  PlaceSummary,
  Signals,
  TagSummary,
  TrendPoint,
} from './types';

export type QlooMode = 'live' | 'offline';
export type RequestKind = 'search' | 'tags' | 'insights' | 'compare' | 'trending';

const DAY = 24 * 60 * 60 * 1000;

/** How long a cached response counts as fresh. Qloo allows caching without a time limit. */
export const CACHE_TTL_MS: Record<RequestKind, number> = {
  search: 30 * DAY,
  tags: 90 * DAY,
  insights: 7 * DAY,
  compare: 7 * DAY,
  trending: 1 * DAY,
};

export interface QlooClientOptions {
  /** 'offline' serves only cached responses and never calls Qloo. */
  mode: QlooMode;
  cache: QlooCache;
  budget: Budget;
  apiKey?: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  /** Minimum gap between live request starts. 220 ms stays under 5 per second. */
  minIntervalMs?: number;
  timeoutMs?: number;
  sleep?: Sleep;
  now?: () => number;
  /** Called after every request, live or cached. Useful for run accounting. */
  onRequest?: (info: { kind: RequestKind; request: string; source: 'cache' | 'live' }) => void;
}

export interface QlooStats {
  cacheHits: number;
  liveCalls: number;
}

/** /search spells video games "videogame"; Insights uses "video_game". */
export function searchTypeUrn(type: EntityType | string): string {
  return type === 'video_game' ? 'urn:entity:videogame' : `urn:entity:${type}`;
}

export function insightsTypeUrn(type: EntityType | string): string {
  return `urn:entity:${type}`;
}

/** Insights takes WKT with longitude first. */
export function wktPoint({ lat, lon }: LatLon): string {
  return `POINT(${lon} ${lat})`;
}

/** /search takes "lat,lon". */
export function latLonPair({ lat, lon }: LatLon): string {
  return `${lat},${lon}`;
}

export class QlooClient {
  readonly mode: QlooMode;
  readonly stats: QlooStats = { cacheHits: 0, liveCalls: 0 };
  private readonly cache: QlooCache;
  private readonly budget: Budget;
  private readonly apiKey?: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly sleep: Sleep;
  private readonly now: () => number;
  private readonly waitForTurn: () => Promise<void>;
  private readonly onRequest?: QlooClientOptions['onRequest'];
  private readonly inflight = new Map<string, Promise<unknown>>();

  constructor(opts: QlooClientOptions) {
    this.mode = opts.mode;
    this.cache = opts.cache;
    this.budget = opts.budget;
    this.apiKey = opts.apiKey?.trim() || undefined;
    this.baseUrl = (opts.baseUrl?.trim() || 'https://hackathon.api.qloo.com').replace(/\/+$/, '').replace(/\/v2$/, '');
    this.fetchImpl = opts.fetch ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
    this.sleep = opts.sleep ?? realSleep;
    this.now = opts.now ?? Date.now;
    this.waitForTurn = createSpacer(opts.minIntervalMs ?? 220, this.sleep, this.now);
    this.onRequest = opts.onRequest;
  }

  // -- Lookups ---------------------------------------------------------------

  /** Resolve a spoken or typed name to entities. */
  async searchEntities(opts: { query: string; types?: Array<EntityType | string>; take?: number }): Promise<EntitySummary[]> {
    const body = await this.request('search', '/search', {
      query: opts.query.trim(),
      types: opts.types?.map(searchTypeUrn),
      take: opts.take ?? 3,
    });
    return arrayAt(body, 'results').map(toEntitySummary);
  }

  /** Keyword search for places near a point, without a taste signal. */
  async searchPlaces(opts: { query: string; near: LatLon; radiusMiles?: number; take?: number }): Promise<PlaceSummary[]> {
    const body = await this.request('search', '/search', {
      query: opts.query.trim(),
      types: 'urn:entity:place',
      'filter.location': latLonPair(opts.near),
      'filter.radius': opts.radiusMiles ?? 5,
      take: opts.take ?? 5,
    });
    return arrayAt(body, 'results').map(toPlaceSummary);
  }

  async findTags(opts: { query: string; take?: number }): Promise<TagSummary[]> {
    const body = await this.request('tags', '/v2/tags', { 'filter.query': opts.query.trim(), take: opts.take ?? 10 });
    return arrayAt(body, 'results', 'tags').map(toTagSummary);
  }

  // -- Insights --------------------------------------------------------------

  /**
   * Places near a point ranked by taste. Pass a category tag in `tags`:
   * without one, results lean toward landmarks.
   */
  async findPlaces(opts: {
    near: LatLon;
    signals?: Signals;
    tags?: string[];
    tagOperator?: 'union' | 'intersection';
    radiusMeters?: number;
    priceMax?: number;
    take?: number;
    explain?: boolean;
  }): Promise<PlaceSummary[]> {
    const body = await this.request('insights', '/v2/insights', {
      'filter.type': 'urn:entity:place',
      'filter.location': wktPoint(opts.near),
      'filter.location.radius': opts.radiusMeters ?? 8000,
      'filter.tags': opts.tags,
      'operator.filter.tags': opts.tags && opts.tags.length > 1 ? (opts.tagOperator ?? 'union') : undefined,
      'filter.price_level.max': opts.priceMax,
      'signal.interests.entities': opts.signals?.entities,
      'signal.interests.tags': opts.signals?.tags,
      'feature.explainability': opts.explain ?? true,
      take: opts.take ?? 10,
    });
    return arrayAt(body, 'results', 'entities').map(toPlaceSummary);
  }

  /** Taste-based picks of one media type (TV, artists, books, podcasts, films, games). */
  async recommend(opts: {
    type: EntityType;
    signals: Signals;
    tags?: string[];
    take?: number;
    explain?: boolean;
  }): Promise<MediaSummary[]> {
    const body = await this.request('insights', '/v2/insights', {
      'filter.type': insightsTypeUrn(opts.type),
      'filter.tags': opts.tags,
      'signal.interests.entities': opts.signals.entities,
      'signal.interests.tags': opts.signals.tags,
      'feature.explainability': opts.explain ?? true,
      take: opts.take ?? 8,
    });
    return arrayAt(body, 'results', 'entities').map(toMediaSummary);
  }

  /** What two sets of tastes share and where they differ, as tags. */
  async compare(opts: { a: string[]; b: string[]; take?: number }): Promise<CompareResult> {
    const body = await this.request('compare', '/v2/analysis/compare', {
      'a.signal.interests.entities': opts.a,
      'b.signal.interests.entities': opts.b,
      take: opts.take ?? 10,
    });
    return {
      shared: arrayAt(body, 'results', 'tags').map(toCompareTag),
      onlyA: arrayAt(body, 'results', 'a').map(toCompareTag),
      onlyB: arrayAt(body, 'results', 'b').map(toCompareTag),
    };
  }

  /**
   * Weekly popularity for one entity. As of Oct 2026 the hackathon data ended
   * around spring 2026, so recent windows come back empty.
   */
  async trending(opts: { entityId: string; type: EntityType; start: string; end: string }): Promise<TrendPoint[]> {
    const body = await this.request('trending', '/v2/trending', {
      'filter.type': insightsTypeUrn(opts.type),
      'filter.start_date': opts.start,
      'filter.end_date': opts.end,
      'signal.interests.entities': opts.entityId,
    });
    return arrayAt(body, 'results', 'trending').map(toTrendPoint);
  }

  // -- Transport ---------------------------------------------------------------

  async request(kind: RequestKind, path: string, params: Params): Promise<unknown> {
    const request = requestString(path, params);
    const key = cacheKey(path, params);

    const hit = await this.cache.get(key);
    // Offline mode serves stale entries rather than failing.
    if (hit && (this.mode === 'offline' || hit.expiresAt > this.now())) {
      this.stats.cacheHits++;
      this.onRequest?.({ kind, request, source: 'cache' });
      return hit.value;
    }
    if (this.mode === 'offline') throw new QlooOfflineError(request);
    if (!this.apiKey) throw new QlooError('QLOO_API_KEY is not set.', 0, request);

    const pending = this.inflight.get(key);
    if (pending) return pending;
    const call = this.live(kind, request, key).finally(() => this.inflight.delete(key));
    this.inflight.set(key, call);
    return call;
  }

  private async live(kind: RequestKind, request: string, key: string): Promise<unknown> {
    for (let attempt = 1; ; attempt++) {
      const last = attempt >= 2;
      await this.budget.reserve(request);
      await this.waitForTurn();
      this.stats.liveCalls++;

      let res: Response;
      try {
        res = await this.fetchImpl(`${this.baseUrl}${request}`, {
          method: 'GET',
          headers: { 'X-Api-Key': this.apiKey!, accept: 'application/json' },
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (err) {
        if (!last) {
          await this.sleep(500);
          continue;
        }
        throw new QlooError(`Network error: ${this.redact((err as Error)?.message ?? String(err))}`, 0, request);
      }
      await this.budget.record(res.headers);

      if (res.status === 429 && !last) {
        const retryAfter = Number(res.headers.get('retry-after'));
        await this.sleep(Math.min(Number.isFinite(retryAfter) ? retryAfter * 1000 : 1000, 10_000));
        continue;
      }
      if (res.status >= 500 && !last) {
        await this.sleep(500);
        continue;
      }

      const raw = await res.text();
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        body = undefined;
      }
      if (!res.ok) {
        throw new QlooError(`Qloo returned ${res.status}: ${this.redact(errorMessage(body, raw))}`, res.status, request);
      }

      const now = this.now();
      await this.cache.set(key, { value: body, request, storedAt: now, expiresAt: now + CACHE_TTL_MS[kind] });
      this.onRequest?.({ kind, request, source: 'live' });
      return body;
    }
  }

  private redact(s: string): string {
    return this.apiKey ? s.split(this.apiKey).join('[redacted]') : s;
  }
}

function arrayAt(body: unknown, ...path: string[]): Record<string, any>[] {
  let cur: any = body;
  for (const p of path) cur = cur?.[p];
  return Array.isArray(cur) ? cur : [];
}

function errorMessage(body: any, raw: string): string {
  const e = body?.error ?? body?.errors?.[0] ?? body;
  const msg = [e?.reason, e?.message].filter((s) => typeof s === 'string' && s).join(': ');
  return (msg || raw || 'no details').slice(0, 300);
}

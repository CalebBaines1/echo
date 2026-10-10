import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export type ParamValue = string | number | boolean | Array<string | number> | undefined | null;
export type Params = Record<string, ParamValue>;

/** Sorted, non-empty query entries. Arrays become comma-joined lists, as Qloo expects. */
export function encodeParams(params: Params): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null || v === '') continue;
    if (Array.isArray(v)) {
      if (v.length === 0) continue;
      out.push([k, v.join(',')]);
    } else {
      out.push([k, String(v)]);
    }
  }
  return out.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

/** Path plus query string. Used for the request URL, cache keys and error messages. */
export function requestString(path: string, params: Params): string {
  const qs = new URLSearchParams(encodeParams(params)).toString();
  return qs ? `${path}?${qs}` : path;
}

export function cacheKey(path: string, params: Params): string {
  return createHash('sha256').update(requestString(path, params)).digest('hex');
}

export interface CacheEntry {
  value: unknown;
  request: string;
  storedAt: number;
  expiresAt: number;
}

export interface QlooCache {
  get(key: string): Promise<CacheEntry | undefined>;
  set(key: string, entry: CacheEntry): Promise<void>;
}

export class MemoryCache implements QlooCache {
  private entries = new Map<string, CacheEntry>();

  async get(key: string) {
    return this.entries.get(key);
  }

  async set(key: string, entry: CacheEntry) {
    this.entries.set(key, entry);
  }

  get size() {
    return this.entries.size;
  }
}

/**
 * One JSON file per response. For local development only: serverless hosts
 * don't keep files between requests, so production needs a database-backed cache.
 */
export class FileCache implements QlooCache {
  constructor(private readonly dir: string) {}

  async get(key: string) {
    try {
      return JSON.parse(await readFile(this.path(key), 'utf8')) as CacheEntry;
    } catch {
      return undefined;
    }
  }

  async set(key: string, entry: CacheEntry) {
    const file = this.path(key);
    await mkdir(dirname(file), { recursive: true });
    const tmp = `${file}.${randomUUID()}.tmp`;
    await writeFile(tmp, JSON.stringify(entry));
    await rename(tmp, file);
  }

  private path(key: string) {
    return join(this.dir, key.slice(0, 2), `${key}.json`);
  }
}

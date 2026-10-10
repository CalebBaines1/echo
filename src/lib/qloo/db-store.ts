import type { SupabaseClient } from '@supabase/supabase-js';
import type { BudgetGuard } from './budget';
import type { CacheEntry, QlooCache } from './cache';
import { QlooBudgetError } from './errors';

/** Qloo response cache in Postgres, shared by every serverless instance. */
export class DbCache implements QlooCache {
  constructor(private readonly db: SupabaseClient) {}

  async get(key: string): Promise<CacheEntry | undefined> {
    const { data, error } = await this.db.from('qloo_cache').select('value, request, stored_at, expires_at').eq('key', key).maybeSingle();
    if (error || !data) return undefined;
    return { value: data.value, request: data.request, storedAt: Date.parse(data.stored_at), expiresAt: Date.parse(data.expires_at) };
  }

  async set(key: string, entry: CacheEntry): Promise<void> {
    const { error } = await this.db.from('qloo_cache').upsert({
      key,
      request: entry.request,
      value: entry.value,
      stored_at: new Date(entry.storedAt).toISOString(),
      expires_at: new Date(entry.expiresAt).toISOString(),
    });
    if (error) console.error('Qloo cache write failed', error.message);
  }
}

/** The Qloo call budget in Postgres, reserved atomically. */
export class DbBudget implements BudgetGuard {
  constructor(
    private readonly db: SupabaseClient,
    private readonly dailyCap: number,
    private readonly monthlyReserve: number,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async reserve(request: string): Promise<void> {
    const { data, error } = await this.db.rpc('qloo_reserve', {
      p_day: this.now().toISOString().slice(0, 10),
      p_daily_cap: this.dailyCap,
      p_monthly_reserve: this.monthlyReserve,
    });
    if (error) throw new QlooBudgetError(`Couldn't check the Qloo budget: ${error.message}`, request);
    if (data === 'daily_cap') throw new QlooBudgetError(`Daily Qloo cap of ${this.dailyCap} reached.`, request);
    if (data === 'reserve') throw new QlooBudgetError(`Qloo calls are down to the monthly reserve of ${this.monthlyReserve}.`, request);
  }

  async record(headers: Headers): Promise<void> {
    const num = (name: string) => {
      const v = headers.get(name);
      const n = v === null || v.trim() === '' ? NaN : Number(v);
      return Number.isFinite(n) ? n : null;
    };
    const remaining = num('x-month-ratelimit-remaining');
    const limit = num('x-month-ratelimit-limit');
    if (remaining === null && limit === null) return;
    const { error } = await this.db.rpc('qloo_record', { p_remaining: remaining, p_limit: limit });
    if (error) console.error('Qloo budget record failed', error.message);
  }
}

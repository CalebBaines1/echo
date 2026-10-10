import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { QlooBudgetError } from './errors';

function headerNumber(headers: Headers, name: string): number | undefined {
  const v = headers.get(name);
  if (v === null || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export interface BudgetState {
  /** UTC date (YYYY-MM-DD) that callsToday counts for. */
  day: string;
  callsToday: number;
  /** From Qloo's x-month-ratelimit-* headers, when seen. */
  monthLimit?: number;
  monthRemaining?: number;
  updatedAt: number;
}

export interface BudgetStore {
  load(): Promise<BudgetState | undefined>;
  save(state: BudgetState): Promise<void>;
}

export class MemoryBudgetStore implements BudgetStore {
  constructor(private state?: BudgetState) {}
  async load() {
    return this.state;
  }
  async save(state: BudgetState) {
    this.state = { ...state };
  }
}

export class FileBudgetStore implements BudgetStore {
  constructor(private readonly file: string) {}

  async load() {
    try {
      return JSON.parse(await readFile(this.file, 'utf8')) as BudgetState;
    } catch {
      return undefined;
    }
  }

  async save(state: BudgetState) {
    await mkdir(dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    await writeFile(tmp, JSON.stringify(state, null, 2));
    await rename(tmp, this.file);
  }
}

/** What the Qloo client needs from a budget: reserve before a live call, record after. */
export interface BudgetGuard {
  reserve(request: string): Promise<void>;
  record(headers: Headers): Promise<void>;
}

export interface BudgetOptions {
  store: BudgetStore;
  /** Live calls allowed per UTC day. */
  dailyCap: number;
  /** Stop when Qloo reports this many or fewer calls left this month. Protects the judging window. */
  monthlyReserve: number;
  now?: () => Date;
}

/** Counts live Qloo calls and refuses new ones past the daily cap or into the monthly reserve. */
export class Budget implements BudgetGuard {
  private readonly store: BudgetStore;
  private readonly dailyCap: number;
  private readonly monthlyReserve: number;
  private readonly now: () => Date;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(opts: BudgetOptions) {
    this.store = opts.store;
    this.dailyCap = opts.dailyCap;
    this.monthlyReserve = opts.monthlyReserve;
    this.now = opts.now ?? (() => new Date());
  }

  /** Call before every live request. Throws QlooBudgetError instead of spending the call. */
  reserve(request: string): Promise<void> {
    return this.serial(async () => {
      const state = await this.current();
      if (state.callsToday >= this.dailyCap) {
        throw new QlooBudgetError(
          `Daily Qloo cap reached (${state.callsToday}/${this.dailyCap}). Raise QLOO_DAILY_CAP to continue.`,
          request,
        );
      }
      if (state.monthRemaining !== undefined && state.monthRemaining <= this.monthlyReserve) {
        throw new QlooBudgetError(
          `Only ${state.monthRemaining} Qloo calls left this month, at or below the reserve of ${this.monthlyReserve}. ` +
            'Lower QLOO_MONTHLY_RESERVE only if you mean to spend the judging budget.',
          request,
        );
      }
      state.callsToday += 1;
      if (state.monthRemaining !== undefined) state.monthRemaining -= 1;
      state.updatedAt = this.now().getTime();
      await this.store.save(state);
    });
  }

  /** Call after every live response to sync with Qloo's own counters. */
  record(headers: Headers): Promise<void> {
    const remaining = headerNumber(headers, 'x-month-ratelimit-remaining');
    const limit = headerNumber(headers, 'x-month-ratelimit-limit');
    if (remaining === undefined && limit === undefined) return Promise.resolve();
    return this.serial(async () => {
      const state = await this.current();
      if (remaining !== undefined) state.monthRemaining = remaining;
      if (limit !== undefined) state.monthLimit = limit;
      state.updatedAt = this.now().getTime();
      await this.store.save(state);
    });
  }

  status(): Promise<BudgetState & { dailyCap: number; monthlyReserve: number }> {
    return this.serial(async () => ({ ...(await this.current()), dailyCap: this.dailyCap, monthlyReserve: this.monthlyReserve }));
  }

  private async current(): Promise<BudgetState> {
    const today = this.now().toISOString().slice(0, 10);
    const saved = await this.store.load();
    if (!saved) return { day: today, callsToday: 0, updatedAt: this.now().getTime() };
    if (saved.day !== today) return { ...saved, day: today, callsToday: 0 };
    return { ...saved };
  }

  private serial<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => undefined);
    return run;
  }
}

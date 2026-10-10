import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { costOf, type TokenUsage } from './prices';

/** The global daily cap in dollars. AI_DAILY_BUDGET_USD overrides the $0.30 default. */
export function dailyBudget(): number {
  const v = Number(process.env.AI_DAILY_BUDGET_USD);
  return Number.isFinite(v) && v > 0 ? v : 0.3;
}

const today = () => new Date().toISOString().slice(0, 10);

// Without Supabase (local development), totals live in this server process.
const local = new Map<string, number>();

export async function spentToday(): Promise<number> {
  const db = getSupabaseAdmin();
  if (!db) return local.get(today()) ?? 0;
  const { data } = await db.from('ai_spend_daily').select('cost_usd').eq('day', today()).maybeSingle();
  return Number(data?.cost_usd ?? 0);
}

/** Whether work estimated to cost `estimate` fits in what's left of today's budget. */
export async function budgetAllows(estimate: number): Promise<boolean> {
  const db = getSupabaseAdmin();
  if (!db) return (local.get(today()) ?? 0) + estimate <= dailyBudget();
  const { data, error } = await db.rpc('ai_spend_allows', { p_day: today(), p_cap: dailyBudget(), p_estimate: estimate });
  if (error) {
    // Fail closed: if the budget can't be checked, don't spend.
    console.error('Spend check failed', error.message);
    return false;
  }
  return data === true;
}

/** Adds one model call's actual cost to today's total. */
export async function recordSpend(model: string, usage: TokenUsage | undefined): Promise<void> {
  if (!usage) return;
  const cost = costOf(model, usage);
  const db = getSupabaseAdmin();
  if (!db) {
    local.set(today(), (local.get(today()) ?? 0) + cost);
    return;
  }
  const { error } = await db.rpc('ai_spend_add', { p_day: today(), p_cost: cost });
  if (error) console.error('Recording spend failed', error.message);
}

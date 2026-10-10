// Checks the live Supabase setup end to end: anonymous sign-in, row level
// security, invites, and the server-only counters. Creates two temporary
// anonymous users and deletes them (and their rows) afterwards.
//
// Usage: npm run db:check

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !publicKey || !secretKey) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY in .env.local.');
  process.exit(1);
}

const admin = createClient(url, secretKey, { auth: { persistSession: false } });
const created: string[] = [];
let failures = 0;

function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` (${detail})` : ''}`);
  if (!ok) failures++;
}

async function anonUser(): Promise<{ sb: SupabaseClient; id: string }> {
  const sb = createClient(url!, publicKey!, { auth: { persistSession: false } });
  const { data, error } = await sb.auth.signInAnonymously();
  if (error || !data.user) throw new Error(`Anonymous sign-in failed: ${error?.message ?? 'no user'}. Is it enabled in Authentication → Sign In / Providers?`);
  created.push(data.user.id);
  return { sb, id: data.user.id };
}

try {
  const a = await anonUser();
  const b = await anonUser();
  check('Anonymous sign-in', true);

  const profile = { tastes: [{ key: 'severance|tv_show', name: 'Severance', type: 'tv_show', status: 'matched', entity: { id: 'E-1', name: 'Severance', type: 'tv_show' } }], activities: [{ name: 'pottery', status: 'wants_to', hobbyId: 'pottery' }], preferences: { notes: ['private note'] } };
  const up = await a.sb.from('profiles').upsert({ user_id: a.id, name: 'Test A', data: profile });
  check('User can save their own profile', !up.error, up.error?.message);

  const forged = await a.sb.from('profiles').upsert({ user_id: b.id, name: 'Forged', data: {} });
  check("User can't write someone else's profile", !!forged.error);

  const peek = await b.sb.from('profiles').select('user_id').eq('user_id', a.id);
  check("User can't read someone else's profile", !peek.error && (peek.data ?? []).length === 0);

  const planId = crypto.randomUUID();
  const plan = await a.sb.from('plans').insert({ id: planId, user_id: a.id, data: { id: planId, title: 'Test' } });
  check('User can save a plan', !plan.error, plan.error?.message);
  const otherPlans = await b.sb.from('plans').select('id').eq('id', planId);
  check("User can't see someone else's plans", (otherPlans.data ?? []).length === 0);

  const cacheRead = await a.sb.from('qloo_cache').select('key').limit(1);
  check('Users have no access to the Qloo cache', !!cacheRead.error || (cacheRead.data ?? []).length === 0, cacheRead.error ? 'denied' : 'empty');
  const usageRpc = await a.sb.rpc('increment_usage', { p_user: a.id, p_kind: 'mission', p_limit: 1000 });
  check("Users can't call server-only functions", !!usageRpc.error);

  const group = await a.sb.rpc('create_group', { p_display_name: 'Test A' });
  const row = Array.isArray(group.data) ? group.data[0] : group.data;
  check('Create an invite', !group.error && !!row?.invite_token, group.error?.message);

  const before = await b.sb.rpc('group_people', { p_group: row.group_id });
  check("Non-members can't see a group's people", !before.error && (before.data ?? []).length === 0);

  const bad = await b.sb.rpc('join_group', { p_token: 'not-a-real-token', p_display_name: 'Test B' });
  check('Invalid invite is rejected', !!bad.error);

  const join = await b.sb.rpc('join_group', { p_token: row.invite_token, p_display_name: 'Test B' });
  check('Join with an invite', !join.error, join.error?.message);

  const people = await b.sb.rpc('group_people', { p_group: row.group_id });
  const aSeen = (people.data ?? []).find((p: any) => p.user_id === a.id);
  check('Members see each other', (people.data ?? []).length === 2);
  check('Members see tastes and hobbies', aSeen?.tastes?.[0]?.name === 'Severance' && aSeen?.hobby_ids?.[0] === 'pottery');
  check("Members don't see preferences or notes", !JSON.stringify(people.data).includes('private note'));

  const groupsForB = await b.sb.from('groups').select('id');
  check('Members can list the group', (groupsForB.data ?? []).length === 1);

  const usage = await admin.rpc('increment_usage', { p_user: a.id, p_kind: 'check', p_limit: 1 });
  const usage2 = await admin.rpc('increment_usage', { p_user: a.id, p_kind: 'check', p_limit: 1 });
  check('Daily limits count and stop', usage.data === true && usage2.data === false, usage.error?.message ?? usage2.error?.message);

  const budgetBefore = await admin.from('qloo_budget').select('*').eq('id', 1).maybeSingle();
  const reserve = await admin.rpc('qloo_reserve', { p_day: '1999-01-01', p_daily_cap: 0, p_monthly_reserve: 0 });
  check('Qloo daily cap is enforced', reserve.data === 'daily_cap', reserve.error?.message);
  // Put the budget row back the way it was.
  if (budgetBefore.data) await admin.from('qloo_budget').update(budgetBefore.data).eq('id', 1);
  else await admin.from('qloo_budget').delete().eq('id', 1);
} catch (err) {
  failures++;
  console.log(`✗ ${(err as Error).message}`);
} finally {
  for (const id of created) {
    await admin.from('usage_daily').delete().eq('user_id', id);
    await admin.auth.admin.deleteUser(id);
  }
  console.log(`\nCleaned up ${created.length} test user(s).`);
}

console.log(failures ? `${failures} check(s) failed.` : 'All checks passed.');
process.exit(failures ? 1 : 0);

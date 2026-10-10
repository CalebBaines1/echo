'use client';

// Keeps the browser copy of the profile and plans in step with Supabase.
// Reads come from the browser copy so screens render instantly; saves write
// through to the database in the background.

import type { Friend } from '@/lib/friends';
import type { Plan } from '@/lib/plans/types';
import type { EchoProfile } from '@/lib/profile/types';
import { ensureSession, getSupabaseBrowser } from '@/lib/supabase/browser';

async function userId(): Promise<string | null> {
  const session = await ensureSession().catch(() => null);
  return session?.user.id ?? null;
}

export async function pushProfile(profile: EchoProfile) {
  const sb = getSupabaseBrowser();
  const uid = sb && (await userId());
  if (!sb || !uid) return;
  const { error } = await sb.from('profiles').upsert({ user_id: uid, name: profile.name ?? null, data: profile, updated_at: new Date().toISOString() });
  if (error) console.error('Saving profile failed', error.message);
}

export async function pushPlan(plan: Plan) {
  const sb = getSupabaseBrowser();
  const uid = sb && (await userId());
  if (!sb || !uid) return;
  const { error } = await sb
    .from('plans')
    .upsert({ id: plan.id, user_id: uid, data: plan, created_at: new Date(plan.createdAt).toISOString(), updated_at: new Date().toISOString() });
  if (error) console.error('Saving plan failed', error.message);
}

/**
 * Merges server data into the browser copy. The server wins for anything it
 * has; anything only in this browser (made before sign-in) is uploaded.
 */
export async function pullFromServer(local: {
  profile: EchoProfile | null;
  plans: Plan[];
  writeProfile: (p: EchoProfile) => void;
  writePlans: (p: Plan[]) => void;
}): Promise<boolean> {
  const sb = getSupabaseBrowser();
  const uid = sb && (await userId());
  if (!sb || !uid) return false;

  const [{ data: profileRow }, { data: planRows }] = await Promise.all([
    sb.from('profiles').select('data').eq('user_id', uid).maybeSingle(),
    sb.from('plans').select('data').eq('user_id', uid).order('created_at', { ascending: false }).limit(50),
  ]);

  if (profileRow?.data && Object.keys(profileRow.data).length) local.writeProfile(profileRow.data as EchoProfile);
  else if (local.profile) await pushProfile(local.profile);

  const server = (planRows ?? []).map((r) => r.data as Plan);
  const serverIds = new Set(server.map((p) => p.id));
  const localOnly = local.plans.filter((p) => !serverIds.has(p.id));
  await Promise.all(localOnly.map(pushPlan));
  local.writePlans([...server, ...localOnly].sort((a, b) => b.createdAt - a.createdAt));
  return true;
}

/** Friends are the other members of every group you're in. */
export async function fetchFriends(): Promise<Friend[] | null> {
  const sb = getSupabaseBrowser();
  const uid = sb && (await userId());
  if (!sb || !uid) return null;
  const { data: groups, error } = await sb.from('groups').select('id');
  if (error) {
    console.error('Loading groups failed', error.message);
    return null;
  }
  const seen = new Map<string, Friend>();
  for (const g of groups ?? []) {
    const { data: people } = await sb.rpc('group_people', { p_group: g.id });
    for (const p of (people ?? []) as Array<{ user_id: string; display_name: string; tastes: Friend['tastes']; hobby_ids: string[] }>) {
      if (p.user_id === uid || seen.has(p.user_id)) continue;
      seen.set(p.user_id, { id: p.user_id, name: p.display_name, tastes: p.tastes ?? [], hobbyIds: p.hobby_ids ?? [], groupId: g.id });
    }
  }
  return [...seen.values()];
}

export async function createInvite(displayName: string): Promise<string> {
  const sb = getSupabaseBrowser();
  if (!sb || !(await userId())) throw new Error("Invites need accounts, which aren't set up here.");
  const { data, error } = await sb.rpc('create_group', { p_display_name: displayName });
  if (error) throw new Error("Couldn't create an invite. Try again.");
  const row = Array.isArray(data) ? data[0] : data;
  return `${window.location.origin}/join/${row.invite_token}`;
}

export async function joinInvite(token: string, displayName: string): Promise<void> {
  const sb = getSupabaseBrowser();
  if (!sb || !(await userId())) throw new Error("Invites need accounts, which aren't set up here.");
  const { error } = await sb.rpc('join_group', { p_token: token, p_display_name: displayName });
  if (error) throw new Error(error.message.includes('invite not found') ? 'This invite link is no longer valid.' : "Couldn't join. Try again.");
}

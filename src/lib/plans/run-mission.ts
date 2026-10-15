'use client';

import type { EchoProfile } from '@/lib/profile/types';
import { apiFetch } from '@/lib/supabase/browser';
import { profilePayload, readEvents, type StreamEvent } from './client';
import type { PlannerResult } from './planner';
import type { Step } from './types';
import type { When } from './when';

/** Runs the planner without a screen of its own, reporting status lines as it goes. */
export async function runMission(input: {
  request: string;
  mode: 'hobby' | 'day';
  when: When;
  profile: EchoProfile;
  avoidPlaceIds: string[];
  /** Skip already-planned places outright instead of offering them flagged. */
  avoidStrict?: boolean;
  moods?: string[];
  onStatus?: (text: string) => void;
}): Promise<{ result: PlannerResult; steps: Step[] }> {
  const res = await apiFetch('/api/plans/mission', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      request: input.request,
      mode: input.mode,
      date: input.when.date,
      part: input.when.part,
      moods: input.moods ?? [],
      avoidPlaceIds: input.avoidPlaceIds,
      avoidStrict: input.avoidStrict ?? false,
      profile: profilePayload(input.profile),
    }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Echo couldn't plan something just now.");
  const steps: Step[] = [];
  let result: PlannerResult | undefined;
  await readEvents<StreamEvent>(res, (e) => {
    if (e.type === 'step') steps.push(e.step);
    else if (e.type === 'status') input.onStatus?.(e.text);
    else if (e.type === 'plan') result = e.plan;
    else if (e.type === 'error') throw new Error(e.message);
  });
  if (!result) throw new Error("Echo couldn't plan something just now.");
  return { result, steps };
}

/** "Today", "Tomorrow", "In 3 days", or a short date further out. */
export function countdown(date: string, now = new Date()): string {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(y!, m! - 1, d!);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days > 1 && days < 14) return `In ${days} days`;
  return target.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

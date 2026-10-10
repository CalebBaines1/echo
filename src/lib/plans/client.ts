'use client';

import type { EchoProfile } from '@/lib/profile/types';
import { newId } from '@/lib/store';
import type { PlannerEvent, PlannerResult } from './planner';
import { formatTime } from './time';
import type { Plan, PlanAction, PlanMode } from './types';
import type { DayPart, When } from './when';

export type StreamEvent = PlannerEvent | { type: 'plan'; plan: PlannerResult } | { type: 'error'; message: string };

/** Reads a newline-delimited JSON response, calling onEvent for each line. */
export async function readEvents<E = StreamEvent>(res: Response, onEvent: (e: E) => void) {
  if (!res.body) throw new Error('No response body.');
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (line) onEvent(JSON.parse(line) as E);
    }
    if (done) break;
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer) as E);
}

export function profilePayload(p: EchoProfile) {
  return { tastes: p.tastes, activities: p.activities, preferences: p.preferences, area: p.area, traits: p.traits };
}

/**
 * Places from plans in the last 60 days, so Echo doesn't keep proposing the
 * same spot. Places the person said they loved stay eligible.
 */
export function placesToAvoid(plans: Plan[], now = Date.now()): string[] {
  const cutoff = now - 60 * 86_400_000;
  const ids = new Set<string>();
  for (const p of plans) {
    if (p.createdAt < cutoff || p.checkIn?.outcome === 'loved') continue;
    if (p.status === 'proposed' && !p.checkIn) continue;
    for (const s of p.stops) ids.add(s.placeId);
  }
  return [...ids];
}

/** An existing plan for the same request, which a new run replaces instead of duplicating. */
export function duplicateOf(plans: Plan[], request: string, mode: PlanMode, proposal = false): Plan | undefined {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  return plans.find((p) => p.mode === mode && !!p.proposal === proposal && p.status === 'proposed' && !p.checkIn && norm(p.request) === norm(request));
}

export interface RunOptions {
  request: string;
  mode: Exclude<PlanMode, 'group'>;
  when: When;
  moods?: string[];
  replaceId?: string;
  proposal?: boolean;
}

/** URL of the run screen for a request. */
export function runUrl(o: RunOptions): string {
  const q = new URLSearchParams({ mode: o.mode, q: o.request, date: o.when.date, part: o.when.part });
  if (o.moods?.length) q.set('moods', o.moods.join(','));
  if (o.replaceId) q.set('replace', o.replaceId);
  if (o.proposal) q.set('proposal', '1');
  return `/plan/run?${q}`;
}

/** Turns a planner result into a saved plan. */
export function toPlan(
  result: PlannerResult,
  input: { mode: Exclude<PlanMode, 'group'>; request: string; date: string; part: DayPart; areaLabel: string; moods?: string[]; steps: Plan['steps']; id?: string; proposal?: boolean },
): Plan {
  return {
    id: input.id ?? newId(),
    mode: input.mode,
    createdAt: Date.now(),
    title: result.title,
    request: input.request,
    summary: result.summary,
    date: input.date,
    part: input.part,
    areaLabel: input.areaLabel,
    moods: input.moods,
    dropped: result.dropped,
    proposal: input.proposal,
    stops: result.stops,
    backup: result.backup,
    steps: input.steps,
    actions: secondaryActions(result.stops, result.summary),
    status: 'proposed',
    hobbyId: result.hobbyId,
  };
}

/** The quiet rows under the main button: website and invite. Calendar comes from the plan itself. */
export function secondaryActions(stops: Plan['stops'], summary: string): PlanAction[] {
  const actions: PlanAction[] = [];
  for (const s of stops) {
    if (s.website) actions.push({ id: newId(), kind: 'link', label: `${s.name} website`, status: 'pending', url: s.website });
  }
  const first = stops[0];
  if (first) {
    actions.push({
      id: newId(),
      kind: 'message',
      label: 'Ask a friend to come',
      status: 'pending',
      text: `Want to come with me to ${first.name}${first.time ? ` at ${formatTime(first.time)}` : ''}? ${summary}`,
    });
  }
  return actions;
}

function stamp(date: string, time: string, addMinutes = 0): string {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const t = new Date(Date.UTC(y!, mo! - 1, d!, h!, mi! + addMinutes));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}T${p(t.getUTCHours())}${p(t.getUTCMinutes())}00`;
}

/** Opens Google Calendar's "new event" page for the first stop. Times are local to the device. */
export function googleCalendarUrl(plan: Plan, checkInUrl: string): string | undefined {
  const s = plan.stops[0];
  if (!s?.time || !plan.date) return undefined;
  const end = plan.stops.at(-1)!;
  const q = new URLSearchParams({
    action: 'TEMPLATE',
    text: plan.stops.length > 1 ? plan.title : `${plan.title}: ${s.name}`,
    dates: `${stamp(plan.date, s.time)}/${stamp(plan.date, end.time ?? s.time, plan.stops.length > 1 ? 90 : 120)}`,
    details: `${plan.summary}\n\nAfterwards, tell Echo how it went: ${checkInUrl}`,
    location: s.address ?? s.name,
  });
  return `https://calendar.google.com/calendar/render?${q}`;
}

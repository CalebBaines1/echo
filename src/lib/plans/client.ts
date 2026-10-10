'use client';

import type { EchoProfile } from '@/lib/profile/types';
import { newId } from '@/lib/store';
import type { PlannerResult } from './planner';
import { formatTime } from './time';
import type { Plan, PlanAction, PlanMode, Step } from './types';

export type StreamEvent = { type: 'step'; step: Step } | { type: 'plan'; plan: PlannerResult } | { type: 'error'; message: string };

/** Reads a newline-delimited JSON response, calling onEvent for each line. */
export async function readEvents(res: Response, onEvent: (e: StreamEvent) => void) {
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
      if (line) onEvent(JSON.parse(line) as StreamEvent);
    }
    if (done) break;
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer) as StreamEvent);
}

export function profilePayload(p: EchoProfile) {
  return { tastes: p.tastes, activities: p.activities, preferences: p.preferences, area: p.area, traits: p.traits };
}

/** Turns a planner result into a saved plan with the actions Echo can take once approved. */
export function toPlan(result: PlannerResult, input: { mode: Exclude<PlanMode, 'group'>; request: string; date: string; steps: Step[] }): Plan {
  const actions: PlanAction[] = [];
  const first = result.stops[0];
  if (input.mode === 'day' && result.stops.length > 1) {
    actions.push({ id: newId(), kind: 'calendar', label: `Add all ${result.stops.length} stops to your calendar`, status: 'pending' });
  } else if (first?.time) {
    actions.push({ id: newId(), kind: 'calendar', label: `Add ${formatTime(first.time)} at ${first.name} to your calendar`, status: 'pending' });
  }
  for (const s of result.stops) {
    if (s.website) actions.push({ id: newId(), kind: 'link', label: `Open ${s.name}'s website`, status: 'pending', url: s.website });
  }
  if (first) {
    actions.push({
      id: newId(),
      kind: 'message',
      label: 'Ask a friend to join',
      status: 'pending',
      text: `Want to come with me to ${first.name}${first.time ? ` at ${formatTime(first.time)}` : ''}? ${result.summary}`,
    });
  }
  return {
    id: newId(),
    mode: input.mode,
    createdAt: Date.now(),
    title: result.title,
    request: input.request,
    summary: result.summary,
    date: input.date,
    stops: result.stops,
    backup: result.backup,
    steps: input.steps,
    actions,
    status: 'proposed',
    hobbyId: result.hobbyId,
  };
}

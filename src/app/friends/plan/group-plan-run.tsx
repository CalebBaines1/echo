'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { Exchange } from '@/components/exchange';
import { StepList } from '@/components/steps';
import { BackHeader, Button } from '@/components/ui';
import { initials, loadFriends } from '@/lib/friends';
import { readEvents } from '@/lib/plans/client';
import type { GroupPlanResult } from '@/lib/plans/group';
import { friendAsPerson, YOU_ID, youAsPerson } from '@/lib/plans/people';
import { formatTime, nextSaturday } from '@/lib/plans/time';
import type { GroupMember, Plan, Step } from '@/lib/plans/types';
import { loadProfile, newId, savePlan } from '@/lib/store';

export function GroupPlanRun() {
  const router = useRouter();
  const params = useSearchParams();
  const ids = (params.get('ids') ?? '').split(',').filter(Boolean);
  const [steps, setSteps] = useState<Step[]>([]);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [result, setResult] = useState<GroupPlanResult | null>(null);
  const [visible, setVisible] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const started = useRef(-1);

  useEffect(() => {
    if (started.current === attempt) return;
    started.current = attempt;
    const profile = loadProfile();
    const friends = loadFriends().filter((f) => ids.includes(f.id));
    if (!profile || friends.length === 0) {
      setError('Pick friends to plan with first.');
      return;
    }
    const people = [youAsPerson(profile), ...friends.map(friendAsPerson)];
    setMembers(people.map((p) => ({ id: p.id, name: p.name, initials: initials(p.name), you: p.id === YOU_ID })));
    setSteps([]);
    setResult(null);
    setVisible(0);
    setError(null);
    const collected: Step[] = [];

    (async () => {
      try {
        const res = await fetch('/api/group/plan', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ people, area: profile.area, date: nextSaturday(), request: 'Plan a Saturday together.' }),
        });
        if (!res.ok) throw new Error("Echo couldn't start this plan.");
        let finished = false;
        await readEvents(res, (e) => {
          const ev = e as unknown as { type: string; step?: Step; result?: GroupPlanResult; message?: string };
          if (ev.type === 'step' && ev.step) {
            collected.push(ev.step);
            setSteps([...collected]);
          } else if (ev.type === 'group' && ev.result) {
            finished = true;
            setResult(ev.result);
          } else if (ev.type === 'error') {
            throw new Error(ev.message);
          }
        });
        if (!finished) throw new Error("Echo couldn't finish this plan. Try again.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Echo couldn't finish this plan. Try again.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  // Reveal the agents' turns one at a time.
  useEffect(() => {
    if (!result || visible >= result.exchange.length) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = setTimeout(() => setVisible((v) => (reduce ? result.exchange.length : v + 1)), visible === 0 ? 200 : 900);
    return () => clearTimeout(t);
  }, [result, visible]);

  function approve() {
    if (!result) return;
    const date = nextSaturday();
    const plan: Plan = {
      id: newId(),
      mode: 'group',
      createdAt: Date.now(),
      title: result.title,
      request: 'Plan a Saturday together.',
      summary: result.summary,
      date,
      stops: result.stops,
      steps,
      actions: [
        { id: newId(), kind: 'calendar', label: `Add all ${result.stops.length} stops to your calendar`, status: 'pending' },
        {
          id: newId(),
          kind: 'message',
          label: 'Send the plan to the group',
          status: 'pending',
          text: `${result.title}: ${result.stops.map((s) => `${s.time ? formatTime(s.time) : ''} ${s.name}`.trim()).join(', ')}. ${result.summary}`,
        },
      ],
      status: 'approved',
      group: { members, exchange: result.exchange, approvals: Object.fromEntries(members.map((m) => [m.id, !!m.you])) },
    };
    savePlan(plan);
    router.push(`/plan/${plan.id}`);
  }

  const done = result && visible >= result.exchange.length;

  return (
    <main className="flex flex-1 flex-col gap-3">
      <BackHeader href={`/friends/compare?ids=${ids.join(',')}`} right={!result && !error ? <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-bold text-accent-text">Live</span> : undefined}>
        Planning Saturday
      </BackHeader>
      <StepList steps={steps} running={!result && !error ? 'Getting everyone’s Echo together…' : undefined} />
      {result && <Exchange members={members} turns={result.exchange} visible={visible} />}
      {done && (
        <div className="rounded-2xl border border-line bg-surface px-3.5 py-3">
          <p className="text-[0.9rem] font-bold">
            Proposed: {result.stops.map((s) => `${s.time ? formatTime(s.time) : ''} ${s.name}`.trim()).join(' · ')}
          </p>
          <p className="text-sm text-muted">{result.summary}</p>
        </div>
      )}
      {error && (
        <div className="flex flex-col gap-2">
          <p role="status" className="text-sm text-warn">
            {error}
          </p>
          <Button onClick={() => setAttempt((a) => a + 1)}>Try again</Button>
        </div>
      )}
      <div className="flex-1" />
      {done && (
        <Button kind="primary" onClick={approve}>
          Approve
        </Button>
      )}
    </main>
  );
}

'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { StepList } from '@/components/steps';
import { BackHeader, Button, LinkButton, Voice } from '@/components/ui';
import { profilePayload, readEvents, toPlan } from '@/lib/plans/client';
import { nextSaturday } from '@/lib/plans/time';
import type { Step } from '@/lib/plans/types';
import { loadProfile, savePlan } from '@/lib/store';

const RUNNING_TEXT = ['Reading your echo…', 'Searching places near you…', 'Comparing options…', 'Checking hours…'];

export function MissionRun() {
  const router = useRouter();
  const params = useSearchParams();
  const mode = params.get('mode') === 'day' ? 'day' : 'hobby';
  const request = params.get('q')?.trim() || (mode === 'day' ? 'Plan me a full Saturday.' : 'Find me a new hobby to try this weekend.');

  const [steps, setSteps] = useState<Step[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const started = useRef<number | null>(null);

  useEffect(() => {
    if (started.current === attempt) return; // React dev mode runs effects twice.
    started.current = attempt;
    const profile = loadProfile();
    if (!profile) {
      router.replace('/onboarding');
      return;
    }
    const date = nextSaturday();
    const collected: Step[] = [];
    setSteps([]);
    setError(null);

    (async () => {
      try {
        const res = await fetch('/api/plans/mission', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ request, mode, date, profile: profilePayload(profile) }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Echo couldn't start this plan.");
        let finished = false;
        await readEvents(res, (e) => {
          if (e.type === 'step') {
            collected.push(e.step);
            setSteps([...collected]);
          } else if (e.type === 'plan') {
            finished = true;
            const plan = toPlan(e.plan, { mode, request, date, steps: collected });
            savePlan(plan);
            setPlanId(plan.id);
          } else if (e.type === 'error') {
            throw new Error(e.message);
          }
        });
        if (!finished) throw new Error("Echo couldn't finish this plan. Try again.");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Echo couldn't finish this plan. Try again.");
      }
    })();
  }, [attempt, mode, request, router]);

  const running = !planId && !error ? RUNNING_TEXT[Math.min(steps.length, RUNNING_TEXT.length - 1)] : undefined;

  return (
    <main className="flex flex-1 flex-col gap-3">
      <BackHeader href="/plan/new">{planId ? 'Done' : 'Working on it'}</BackHeader>
      <p className="max-w-[86%] self-end rounded-2xl rounded-br-sm bg-sunk px-3 py-2 text-[0.9rem]">{request}</p>
      <Voice>
        {mode === 'day'
          ? "On it. I'll build a day around your taste and what's actually open near you."
          : "On it. I'll check what fits your taste and what's actually open near you."}
      </Voice>
      <StepList steps={steps} running={running} />
      {error && (
        <div className="flex flex-col gap-2">
          <p role="status" className="text-sm text-warn">
            {error}
          </p>
          <Button onClick={() => setAttempt((a) => a + 1)}>Try again</Button>
        </div>
      )}
      <div className="flex-1" />
      {planId && (
        <LinkButton href={`/plan/${planId}`} kind="primary">
          See the plan
        </LinkButton>
      )}
    </main>
  );
}

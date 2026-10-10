'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { PlaceCards } from '@/components/place-cards';
import { StepList } from '@/components/steps';
import { BackHeader, Button, Chip, LinkButton, Voice } from '@/components/ui';
import { duplicateOf, placesToAvoid, profilePayload, readEvents, toPlan, type StreamEvent } from '@/lib/plans/client';
import type { DroppedOption, PlaceCard, Step } from '@/lib/plans/types';
import { defaultWhen, isWhen, whenLabel, type When } from '@/lib/plans/when';
import { getPlan, loadPlans, loadProfile, savePlan } from '@/lib/store';
import { apiFetch } from '@/lib/supabase/browser';

export function MissionRun() {
  const router = useRouter();
  const params = useSearchParams();
  const mode = params.get('mode') === 'day' ? 'day' : 'hobby';
  const request = params.get('q')?.trim() || (mode === 'day' ? 'Plan me a full day out.' : 'Find me a new hobby to try.');
  const fromUrl = { date: params.get('date') ?? '', part: params.get('part') ?? '' };
  const when: When = isWhen(fromUrl) ? fromUrl : defaultWhen(mode);
  const moods = (params.get('moods') ?? '').split(',').filter(Boolean);
  const replaceId = params.get('replace') ?? undefined;
  const proposal = params.get('proposal') === '1';
  // A mission launched from a hobby plan step links back to it.
  const hobbyPlanId = params.get('hobby');
  const hobbyStep = Number(params.get('step'));

  const [steps, setSteps] = useState<Step[]>([]);
  const [cards, setCards] = useState<PlaceCard[]>([]);
  const [dropped, setDropped] = useState<DroppedOption[]>([]);
  const [status, setStatus] = useState('Reading your echo');
  const [error, setError] = useState<string | null>(null);
  const [planId, setPlanId] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [attempt, setAttempt] = useState(0);
  const started = useRef<number | null>(null);
  const areaLabel = useRef('');

  useEffect(() => {
    if (started.current === attempt) return; // React dev mode runs effects twice.
    started.current = attempt;
    const profile = loadProfile();
    if (!profile) {
      router.replace('/onboarding');
      return;
    }
    areaLabel.current = profile.area.label;
    const plans = loadPlans();
    const collected: Step[] = [];
    setSteps([]);
    setCards([]);
    setDropped([]);
    setError(null);

    (async () => {
      try {
        const res = await apiFetch('/api/plans/mission', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            request,
            mode,
            date: when.date,
            part: when.part,
            moods,
            avoidPlaceIds: placesToAvoid(plans),
            profile: profilePayload(profile),
          }),
        });
        if (!res.ok) throw new Error((await res.json().catch(() => ({})))?.error ?? "Echo couldn't start this plan.");
        let finished = false;
        await readEvents<StreamEvent>(res, (e) => {
          if (e.type === 'step') {
            collected.push(e.step);
            setSteps([...collected]);
          } else if (e.type === 'status') {
            setStatus(e.text);
          } else if (e.type === 'places') {
            setCards((c) => [...c, ...e.places.filter((p) => !c.some((x) => x.id === p.id))]);
          } else if (e.type === 'dropped') {
            setDropped((d) => [...d, e.option]);
          } else if (e.type === 'plan') {
            finished = true;
            // Re-running the same request replaces the earlier plan.
            const replaces = (replaceId && getPlan(replaceId)) || duplicateOf(plans, request, mode, proposal);
            const plan = toPlan(e.plan, {
              mode,
              request,
              date: when.date,
              part: when.part,
              areaLabel: profile.area.label,
              moods,
              steps: collected,
              id: replaces?.id,
              proposal,
            });
            savePlan(plan);
            const parent = hobbyPlanId ? getPlan(hobbyPlanId) : undefined;
            if (parent?.hobbyWeeks?.[hobbyStep]) {
              savePlan({ ...parent, hobbyWeeks: parent.hobbyWeeks.map((w, i) => (i === hobbyStep ? { ...w, planId: plan.id } : w)) });
            }
            setPicked(new Set([...e.plan.stops.map((s) => s.placeId)]));
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  return (
    <main className="flex flex-1 flex-col gap-3">
      <BackHeader href="/plan/new">{planId ? 'Done' : 'Working on it'}</BackHeader>
      <p className="max-w-[86%] self-end rounded-2xl rounded-br-sm bg-sunk px-3 py-2 text-[0.9rem]">{request}</p>
      <div className="flex flex-wrap gap-1.5">
        <Chip tone="accent">{whenLabel(when)}</Chip>
        {areaLabel.current && <Chip tone="accent">{areaLabel.current}</Chip>}
        {moods.map((m) => (
          <Chip key={m}>{m.replace(/([A-Z])/g, ' $1').toLowerCase()}</Chip>
        ))}
      </div>
      <Voice>
        {planId
          ? 'Done. Here’s what I picked, and what I set aside.'
          : mode === 'day'
            ? "On it. I'll build a day around your taste and what's actually open."
            : "On it. I'll check what fits your taste and what's actually open."}
      </Voice>

      {!planId && !error && (
        <p className="flex items-center gap-2 text-sm font-semibold text-accent-text" role="status">
          <span className="size-3.5 flex-none animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden="true" />
          {status}…
        </p>
      )}

      {cards.length > 0 && <PlaceCards cards={cards} dropped={dropped} picked={picked} />}

      {error && (
        <div className="flex flex-col gap-2">
          <p role="status" className="text-sm text-warn">
            {error}
          </p>
          <Button onClick={() => setAttempt((a) => a + 1)}>Try again</Button>
        </div>
      )}

      {steps.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-bold text-muted">Everything Echo did</summary>
          <div className="mt-2">
            <StepList steps={steps} />
          </div>
        </details>
      )}
      <div className="flex-1" />
      {planId && (
        <LinkButton href={`/plan/${planId}`} kind="primary" className="sticky bottom-4">
          See the plan
        </LinkButton>
      )}
    </main>
  );
}

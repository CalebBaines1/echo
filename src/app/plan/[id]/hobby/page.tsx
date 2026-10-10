'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckIcon } from '@/components/icons';
import { BackHeader, Button, LinkButton, Spinner, Voice } from '@/components/ui';
import { hobbyById } from '@/lib/qloo/tags';
import { getPlan, loadProfile, savePlan, useStored } from '@/lib/store';

export default function HobbyPlanPage() {
  const { id } = useParams<{ id: string }>();
  const plan = useStored(useCallback(() => getPlan(id) ?? null, [id]));
  const [intro, setIntro] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const started = useRef(false);

  const generate = useCallback(async () => {
    const p = getPlan(id);
    const profile = loadProfile();
    if (!p || !p.stops[0]) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/plans/hobby', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          hobby: hobbyById(p.hobbyId ?? '')?.label ?? p.title,
          stop: p.stops[0],
          backup: p.backup,
          tastes: profile?.tastes.map((t) => t.entity?.name ?? t.name) ?? [],
          notes: profile?.preferences.notes ?? [],
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Echo couldn't write this plan just now. Try again.");
      setIntro(body.intro);
      savePlan({ ...p, hobbyWeeks: body.weeks });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Echo couldn't write this plan just now. Try again.");
    } finally {
      setBusy(false);
    }
  }, [id]);

  useEffect(() => {
    if (plan && !plan.hobbyWeeks && !started.current) {
      started.current = true;
      void generate();
    }
  }, [plan, generate]);

  if (plan === undefined) return null;
  if (!plan) {
    return (
      <main className="flex flex-1 flex-col gap-4">
        <BackHeader href="/home">Hobby plan</BackHeader>
        <p className="text-sm text-muted">This plan isn&apos;t on this device.</p>
      </main>
    );
  }

  const weeks = plan.hobbyWeeks ?? [];
  const current = weeks.findIndex((w) => !w.done);

  function toggle(i: number) {
    savePlan({ ...plan!, hobbyWeeks: weeks.map((w, j) => (j === i ? { ...w, done: !w.done } : w)) });
  }

  return (
    <main className="flex flex-1 flex-col gap-3">
      <BackHeader href={`/plan/${plan.id}`} right={weeks.length ? <span className="text-xs text-faint">Step {current < 0 ? weeks.length : current + 1} of {weeks.length}</span> : undefined}>
        {hobbyById(plan.hobbyId ?? '')?.label ?? plan.title}
      </BackHeader>
      {busy && <Spinner label="Writing your plan…" />}
      {intro && <Voice>{intro}</Voice>}
      {error && (
        <div className="flex flex-col gap-2">
          <p role="status" className="text-sm text-warn">
            {error}
          </p>
          <Button onClick={generate}>Try again</Button>
        </div>
      )}

      <ol className="flex flex-col gap-3">
        {weeks.map((w, i) => (
          <li key={i} className="flex items-start gap-3">
            <button
              type="button"
              onClick={() => toggle(i)}
              aria-label={w.done ? `Mark ${w.title} not done` : `Mark ${w.title} done`}
              className={`grid size-7 flex-none cursor-pointer place-items-center rounded-full border text-xs font-bold ${
                w.done ? 'border-transparent bg-echo-soft text-echo' : i === current ? 'border-transparent bg-accent text-accent-ink' : 'border-line text-muted'
              }`}
            >
              {w.done ? <CheckIcon className="size-3.5" /> : i + 1}
            </button>
            <div>
              <p className="text-[0.9rem] font-bold">
                {w.week} · {w.title}
              </p>
              <p className="text-sm text-muted">{w.detail}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="flex-1" />
      {weeks.length > 0 && (
        <>
          <p className="text-center text-xs text-faint">Tap a step to mark it done. Echo checks in after each one.</p>
          <LinkButton href={`/plan/${plan.id}/checkin`}>Tell Echo how it&apos;s going</LinkButton>
        </>
      )}
    </main>
  );
}

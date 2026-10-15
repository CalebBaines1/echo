'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { placesToAvoid, toPlan } from '@/lib/plans/client';
import { proposalRequest } from '@/lib/plans/suggest';
import { daySeed, seeded } from '@/lib/variety';
import { countdown, runMission } from '@/lib/plans/run-mission';
import { formatTime, localDate } from '@/lib/plans/time';
import type { Plan } from '@/lib/plans/types';
import { defaultWhen, whenLabel } from '@/lib/plans/when';
import { loadPlans, loadProfile, savePlan } from '@/lib/store';
import { CheckIcon } from './icons';
import { Button, Label } from './ui';


/** The current suggestion: today's or later, not yet turned down. */
export function currentProposal(plans: Plan[]): Plan | undefined {
  const today = localDate(new Date());
  return plans.find((p) => p.proposal && p.date && p.date >= today);
}

/**
 * "One thing for you": a single concrete plan Echo picked, to say yes to or
 * swap. Made at most once a day, in the background, when there isn't one.
 */
export function OneThing({ plans }: { plans: Plan[] }) {
  const proposal = currentProposal(plans);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('Picking something for you');
  const [error, setError] = useState<string | null>(null);
  const tried = useRef(false);

  async function make(replace?: Plan) {
    const profile = loadProfile();
    if (!profile) return;
    setBusy(true);
    setError(null);
    setStatus('Picking something for you');
    try {
      const when = replace?.date ? { date: replace.date, part: replace.part ?? 'any' } : defaultWhen('hobby');
      // Something new: skip anywhere already in a plan from the last two weeks, and the one being replaced.
      const recent = loadPlans().filter((p) => p.createdAt > Date.now() - 14 * 86_400_000 && p.id !== replace?.id);
      const avoid = [
        ...placesToAvoid(loadPlans()),
        ...recent.flatMap((p) => p.stops.map((s) => s.placeId)),
        ...(replace ? [...replace.stops.map((s) => s.placeId), ...(replace.backup ? [replace.backup.placeId] : [])] : []),
      ];
      // Today's theme for a fresh suggestion; "Another" draws a new one.
      const request = proposalRequest(profile, seeded(replace ? `${Date.now()}` : daySeed(profile.area.label)));
      const { result, steps } = await runMission({ request, mode: 'hobby', when, profile, avoidPlaceIds: avoid, avoidStrict: true, onStatus: setStatus });
      savePlan(toPlan(result, { mode: 'hobby', request, date: when.date, part: when.part, areaLabel: profile.area.label, steps, id: replace?.id, proposal: true }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  // Make one automatically if there's nothing current and none was made today.
  useEffect(() => {
    if (proposal || tried.current) return;
    const today = localDate(new Date());
    const madeToday = plans.some((p) => p.proposal && localDate(new Date(p.createdAt)) === today);
    if (madeToday) return;
    tried.current = true;
    void make();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proposal, plans]);

  if (busy) {
    return (
      <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface px-3.5 py-3">
        <Label>One thing for you</Label>
        <p className="flex items-center gap-2 text-sm text-accent-text" role="status">
          <span className="size-3.5 flex-none animate-spin rounded-full border-2 border-accent border-t-transparent" aria-hidden="true" />
          {status}…
        </p>
      </section>
    );
  }

  if (!proposal) {
    return (
      <section className="flex flex-col gap-2 rounded-2xl border border-dashed border-line px-3.5 py-3">
        <Label>One thing for you</Label>
        <p className="text-sm text-muted">{error ?? 'Echo can pick one thing for this week.'}</p>
        <Button onClick={() => make()} className="self-start px-4 py-2">
          {error ? 'Try again' : 'Pick something'}
        </Button>
      </section>
    );
  }

  const stop = proposal.stops[0];
  const when = proposal.date ? whenLabel({ date: proposal.date, part: proposal.part ?? 'any' }) : '';
  const accepted = proposal.status !== 'proposed';

  return (
    <section className="flex flex-col gap-2 rounded-2xl border-2 border-accent bg-surface px-3.5 py-3">
      <div className="flex items-center justify-between">
        <Label>One thing for you</Label>
        {accepted && proposal.date && <span className="text-xs font-bold text-echo">{countdown(proposal.date)}</span>}
      </div>
      <Link href={`/plan/${proposal.id}`} className="flex flex-col gap-1">
        <p className="font-voice text-[1.25rem] leading-snug">
          {when}
          {stop?.time ? `, ${formatTime(stop.time)}` : ''}: {stop?.name}
        </p>
        <p className="text-sm text-muted first-letter:uppercase">{stop?.why ?? proposal.summary}</p>
      </Link>
      {accepted ? (
        <p className="flex items-center gap-1.5 text-sm font-bold text-echo">
          <CheckIcon className="size-4" /> You&apos;re in
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button kind="primary" onClick={() => savePlan({ ...proposal, status: 'approved' })}>
            I&apos;m in
          </Button>
          <Button onClick={() => make(proposal)}>Another</Button>
        </div>
      )}
      {error && (
        <p role="status" className="text-sm text-warn">
          {error}
        </p>
      )}
    </section>
  );
}

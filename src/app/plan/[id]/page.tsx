'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useState } from 'react';
import { CalendarIcon, CheckIcon, LinkIcon, SendIcon } from '@/components/icons';
import { Exchange } from '@/components/exchange';
import { StepList } from '@/components/steps';
import { StopCard } from '@/components/stop-card';
import { BackHeader, Button, Label, LinkButton, Voice } from '@/components/ui';
import { buildIcs, downloadIcs } from '@/lib/plans/ics';
import { formatDate } from '@/lib/plans/time';
import type { Plan, PlanAction } from '@/lib/plans/types';
import { getPlan, savePlan, useStored } from '@/lib/store';

const ICON = { calendar: CalendarIcon, link: LinkIcon, message: SendIcon } as const;

export default function PlanPage() {
  const { id } = useParams<{ id: string }>();
  const plan = useStored(useCallback(() => getPlan(id) ?? null, [id]));
  const [toast, setToast] = useState<string | null>(null);
  const [showSteps, setShowSteps] = useState(false);

  if (plan === undefined) return null;
  if (!plan) {
    return (
      <main className="flex flex-1 flex-col gap-4">
        <BackHeader href="/home">Plan</BackHeader>
        <p className="text-sm text-muted">This plan isn&apos;t on this device.</p>
      </main>
    );
  }

  function flash(text: string) {
    setToast(text);
    setTimeout(() => setToast(null), 2200);
  }

  function update(next: Plan) {
    savePlan(next);
  }

  async function run(action: PlanAction, p: Plan) {
    if (action.kind === 'calendar') {
      if (!p.date) return;
      const events = p.stops
        .filter((s) => s.time)
        .map((s) => ({
          title: p.stops.length > 1 ? `${s.name} (${p.title})` : `${p.title}: ${s.name}`,
          date: p.date!,
          time: s.time!,
          durationMinutes: p.stops.length > 1 ? 90 : 120,
          location: s.address,
          description: s.why,
          url: s.website,
        }));
      downloadIcs(`${p.title.replace(/[^\w]+/g, '-').toLowerCase()}.ics`, buildIcs(events));
      flash('Calendar file saved. Open it to add the event.');
    } else if (action.kind === 'link' && action.url) {
      window.open(action.url, '_blank', 'noopener,noreferrer');
    } else if (action.kind === 'message' && action.text) {
      try {
        if (navigator.share) await navigator.share({ text: action.text });
        else {
          await navigator.clipboard.writeText(action.text);
          flash('Invite copied. Paste it into a message.');
        }
      } catch {
        return; // Share sheet dismissed.
      }
    }
    update({ ...p, status: 'approved', actions: p.actions.map((a) => (a.id === action.id ? { ...a, status: 'done' } : a)) });
  }

  return (
    <main className="relative flex flex-1 flex-col gap-3">
      <BackHeader href="/home" right={<span className="text-xs text-faint">{plan.date ? formatDate(plan.date) : ''}</span>}>
        {plan.title}
      </BackHeader>
      <Voice>{plan.summary}</Voice>

      {plan.stops.map((s) => (
        <StopCard key={s.placeId} stop={s} />
      ))}
      {plan.backup && <StopCard stop={plan.backup} label={`Backup: `} />}

      {plan.group && (
        <section className="flex flex-col gap-2">
          <Label>Approvals</Label>
          <ul className="flex flex-col gap-1.5">
            {plan.group.members.map((m) => (
              <li key={m.id} className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-[0.85rem]">
                <span>{m.you ? 'You' : m.name}</span>
                <span className={`text-xs font-bold ${plan.group!.approvals[m.id] ? 'text-echo' : 'text-faint'}`}>
                  {plan.group!.approvals[m.id] ? 'Approved' : 'Waiting for their OK'}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Label>Echo can do this for you</Label>
      <ul className="flex flex-col gap-2">
        {plan.actions.map((a) => {
          const Icon = ICON[a.kind];
          const done = a.status === 'done';
          return (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => run(a, plan)}
                className={`flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-[0.85rem] ${
                  done ? 'border-echo' : 'border-dashed border-faint'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Icon className="size-4 flex-none text-muted" />
                  {a.label}
                </span>
                <span className={`flex-none text-xs font-bold ${done ? 'text-echo' : 'text-accent'}`}>
                  {done ? (
                    <span className="inline-flex items-center gap-1">
                      <CheckIcon className="size-3.5" /> Done
                    </span>
                  ) : (
                    'Approve'
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="text-center text-xs text-faint">Echo never books, pays, or sends anything without your OK.</p>

      {plan.mode === 'hobby' && (
        <LinkButton href={`/plan/${plan.id}/hobby`}>{plan.hobbyWeeks ? 'See your hobby plan' : 'Turn this into a six-week plan'}</LinkButton>
      )}
      {plan.status !== 'approved' && (
        <Button kind="primary" onClick={() => update({ ...plan, status: 'approved' })}>
          Approve plan
        </Button>
      )}
      {plan.status === 'approved' && (
        <Link href={`/plan/${plan.id}/checkin`} className="text-center text-sm font-bold text-accent">
          Tell Echo how it went
        </Link>
      )}

      {plan.group && plan.group.exchange.length > 0 && (
        <details className="flex flex-col gap-2">
          <summary className="cursor-pointer text-sm font-bold text-muted">How your Echos agreed</summary>
          <div className="mt-2">
            <Exchange members={plan.group.members} turns={plan.group.exchange} />
          </div>
        </details>
      )}

      {plan.steps.length > 0 && (
        <section className="flex flex-col gap-2">
          <button type="button" onClick={() => setShowSteps((v) => !v)} className="cursor-pointer self-start text-sm font-bold text-muted" aria-expanded={showSteps}>
            {showSteps ? 'Hide' : 'Show'} how Echo got here
          </button>
          {showSteps && <StepList steps={plan.steps} />}
        </section>
      )}

      {toast && (
        <p role="status" className="fixed inset-x-4 bottom-6 mx-auto max-w-sm rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-surface">
          {toast}
        </p>
      )}
    </main>
  );
}

'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useState } from 'react';
import { Exchange } from '@/components/exchange';
import { CalendarIcon, CheckIcon, LinkIcon, SendIcon, XIcon } from '@/components/icons';
import { ShareLink } from '@/components/share-link';
import { StepList } from '@/components/steps';
import { StopCard } from '@/components/stop-card';
import { BackHeader, Button, Card, Label, LinkButton, Voice } from '@/components/ui';
import { googleCalendarUrl, runUrl } from '@/lib/plans/client';
import { buildIcs, downloadIcs } from '@/lib/plans/ics';
import { formatTime, localDate } from '@/lib/plans/time';
import type { Plan, PlanAction } from '@/lib/plans/types';
import { whenLabel } from '@/lib/plans/when';
import { getPlan, savePlan, useStored } from '@/lib/store';

const QUICK_CHANGES = ['Somewhere closer', 'A different time', 'Cheaper', 'Something quieter'];

export default function PlanPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const plan = useStored(useCallback(() => getPlan(id) ?? null, [id]));
  const [toast, setToast] = useState<string | null>(null);
  const [change, setChange] = useState('');
  const [changeError, setChangeError] = useState<string | null>(null);

  if (plan === undefined) return null;
  if (!plan) {
    return (
      <main className="flex flex-1 flex-col gap-4">
        <BackHeader href="/home">Plan</BackHeader>
        <p className="text-sm text-muted">This plan isn&apos;t on this device or in your account.</p>
      </main>
    );
  }

  const when = plan.date ? { date: plan.date, part: plan.part ?? 'any' } : null;
  const first = plan.stops[0];
  const approved = plan.status !== 'proposed';
  const past = !!plan.date && plan.date < localDate(new Date());
  const checkInUrl = typeof window === 'undefined' ? '' : `${window.location.origin}/plan/${plan.id}/checkin`;
  const gcal = googleCalendarUrl(plan, checkInUrl);
  const why = (plan.dropped ?? []).filter((d) => d.reason).slice(0, 2);

  function flash(text: string) {
    setToast(text);
    setTimeout(() => setToast(null), 2400);
  }

  function update(next: Plan) {
    savePlan(next);
  }

  function commit() {
    update({ ...plan!, status: 'approved' });
    flash(`You're in. Echo will check in after${when ? ` ${whenLabel(when).toLowerCase()}` : ''}.`);
  }

  function icsFile() {
    if (!plan!.date) return;
    const events = plan!.stops
      .filter((s) => s.time)
      .map((s) => ({
        title: plan!.stops.length > 1 ? `${s.name} (${plan!.title})` : `${plan!.title}: ${s.name}`,
        date: plan!.date!,
        time: s.time!,
        durationMinutes: plan!.stops.length > 1 ? 90 : 120,
        location: s.address,
        description: `${s.why ?? ''}\n\nAfterwards, tell Echo how it went: ${checkInUrl}`,
        url: checkInUrl,
      }));
    downloadIcs(`${plan!.title.replace(/[^\w]+/g, '-').toLowerCase()}.ics`, buildIcs(events));
    flash('Calendar file saved. Open it to add the event.');
  }

  async function run(action: PlanAction) {
    if (action.kind === 'link' && action.url) {
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
    update({ ...plan!, actions: plan!.actions.map((a) => (a.id === action.id ? { ...a, status: 'done' } : a)) });
  }

  function swapBackup() {
    if (!plan!.backup || !first) return;
    const next = { ...plan!.backup, time: first.time };
    update({ ...plan!, stops: [next, ...plan!.stops.slice(1)], backup: { ...first, time: undefined }, status: 'proposed' });
    flash(`Switched to ${next.name}.`);
  }

  function rerun(text: string) {
    const t = text.trim();
    if (!t) return setChangeError('Say what to change.');
    if (plan!.mode === 'group' || !when) return;
    router.push(runUrl({ request: `${plan!.request} Change: ${t}.`, mode: plan!.mode, when, moods: plan!.moods, replaceId: plan!.id, proposal: plan!.proposal }));
  }

  const ICON = { calendar: CalendarIcon, link: LinkIcon, message: SendIcon } as const;
  const sent = plan.actions.some((a) => a.kind === 'message' && a.status === 'done');

  return (
    <main className="relative flex flex-1 flex-col gap-3">
      <BackHeader href="/home" right={when ? <span className="text-xs text-faint">{whenLabel(when)}</span> : undefined}>
        {plan.title}
      </BackHeader>
      <Voice>{plan.summary}</Voice>

      {past && !plan.checkIn && (
        <Link href={`/plan/${plan.id}/checkin`} className="rounded-2xl border-2 border-accent bg-accent-soft px-3.5 py-3 text-sm font-bold text-accent-text">
          Did you go? Tell Echo how it went
        </Link>
      )}

      {why.length > 0 && (
        <section className="flex flex-col gap-1.5 rounded-2xl bg-sunk px-3.5 py-3">
          <Label>Why this one</Label>
          {why.map((d) => (
            <p key={d.name} className="flex items-start gap-2 text-[0.82rem] leading-snug">
              <XIcon className="mt-0.5 size-3.5 flex-none text-warn" />
              <span>
                <span className="font-semibold">{d.name}</span>: {d.reason}
              </span>
            </p>
          ))}
        </section>
      )}

      {plan.stops.map((s) => (
        <StopCard key={s.placeId} stop={s} members={plan.group?.members} />
      ))}

      {plan.backup && plan.mode !== 'group' && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-dashed border-line px-3.5 py-2.5">
          <p className="min-w-0 text-[0.82rem]">
            <span className="text-muted">If that doesn&apos;t work out: </span>
            <span className="font-semibold">{plan.backup.name}</span>
            {plan.backup.distanceMiles !== undefined && <span className="text-faint"> · {plan.backup.distanceMiles} mi</span>}
          </p>
          <button type="button" onClick={swapBackup} className="flex-none cursor-pointer text-sm font-bold text-accent">
            Swap
          </button>
        </div>
      )}

      {!approved ? (
        <Button kind="primary" onClick={commit}>
          <CheckIcon className="size-4" />
          I&apos;m in
          {when || first?.time ? ` · ${[when ? whenLabel(when) : '', first?.time ? formatTime(first.time) : ''].filter(Boolean).join(', ')}` : ''}
        </Button>
      ) : (
        <p className="flex items-center justify-center gap-1.5 rounded-2xl bg-echo-soft px-4 py-3 text-sm font-bold text-echo">
          <CheckIcon className="size-4" /> You&apos;re in
        </p>
      )}

      <ul className="flex flex-col divide-y divide-line rounded-2xl border border-line bg-surface">
        {gcal && (
          <li>
            <a href={gcal} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3.5 py-2.5 text-[0.85rem]">
              <CalendarIcon className="size-4 text-muted" /> Add to Google Calendar
            </a>
          </li>
        )}
        {plan.date && first?.time && (
          <li>
            <button type="button" onClick={icsFile} className="flex w-full cursor-pointer items-center gap-2 px-3.5 py-2.5 text-left text-[0.85rem]">
              <CalendarIcon className="size-4 text-muted" /> Apple or other calendar (.ics)
            </button>
          </li>
        )}
        {plan.actions
          .filter((a) => a.kind !== 'calendar')
          .map((a) => {
            const Icon = ICON[a.kind];
            return (
              <li key={a.id}>
                <button type="button" onClick={() => run(a)} className="flex w-full cursor-pointer items-center justify-between gap-2 px-3.5 py-2.5 text-left text-[0.85rem]">
                  <span className="flex items-center gap-2">
                    <Icon className="size-4 text-muted" /> {a.label}
                  </span>
                  {a.status === 'done' && <CheckIcon className="size-4 text-echo" />}
                </button>
              </li>
            );
          })}
      </ul>
      <p className="text-center text-xs text-faint">Echo never books, pays, or sends anything without your OK.</p>

      {plan.mode !== 'group' && <ShareLink plan={plan} onShared={(token) => update({ ...plan, share: { token } })} />}

      {plan.group && (
        <section className="flex flex-col gap-2">
          <Label>Who&apos;s in</Label>
          <ShareLink plan={plan} onShared={(token) => update({ ...plan, share: { token } })} />
          {!plan.share && (
            <ul className="flex flex-col gap-1.5">
              {plan.group.members.map((m) => (
                <li key={m.id} className="flex items-center justify-between rounded-xl border border-line px-3 py-2 text-[0.85rem]">
                  <span>{m.you ? 'You' : m.name}</span>
                  <span className={`text-xs font-bold ${m.you || sent ? 'text-echo' : 'text-faint'}`}>{m.you ? 'In' : sent ? 'Sent' : 'Not sent yet'}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {plan.mode !== 'group' && when && (
        <section className="flex flex-col gap-2">
          <Label>Change something</Label>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_CHANGES.map((q) => (
              <button key={q} type="button" onClick={() => rerun(q)} className="cursor-pointer rounded-full border border-line px-3 py-1.5 text-sm hover:border-accent">
                {q}
              </button>
            ))}
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              rerun(change);
            }}
            className="flex gap-2"
          >
            <label htmlFor="change" className="sr-only">
              What to change
            </label>
            <input
              id="change"
              value={change}
              onChange={(e) => {
                setChange(e.target.value);
                if (changeError) setChangeError(null);
              }}
              placeholder="After 6pm, and not a class"
              maxLength={160}
              className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
            <Button type="submit">Redo</Button>
          </form>
          {changeError && (
            <p role="status" className="text-sm text-warn">
              {changeError}
            </p>
          )}
        </section>
      )}

      {plan.mode === 'hobby' && (
        <LinkButton href={`/plan/${plan.id}/hobby`}>{plan.hobbyWeeks ? 'See your six-week plan' : 'Turn this into a six-week plan'}</LinkButton>
      )}

      {plan.group && plan.group.exchange.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-bold text-muted">How your Echos agreed</summary>
          <div className="mt-2">
            <Exchange members={plan.group.members} turns={plan.group.exchange} />
          </div>
        </details>
      )}

      {plan.steps.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-bold text-muted">Everything Echo did</summary>
          <div className="mt-2">
            <StepList steps={plan.steps} />
          </div>
        </details>
      )}

      {plan.checkIn && (
        <Card>
          <p className="text-sm font-bold">You told Echo</p>
          <p className="text-sm text-muted">{plan.checkIn.answer}</p>
        </Card>
      )}

      {toast && (
        <p role="status" className="fixed inset-x-4 bottom-6 z-10 mx-auto max-w-sm rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-surface">
          {toast}
        </p>
      )}
    </main>
  );
}

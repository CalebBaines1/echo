'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckIcon } from '@/components/icons';
import { BackHeader, Button, Label, Spinner, Voice } from '@/components/ui';
import { runUrl } from '@/lib/plans/client';
import { countdown } from '@/lib/plans/run-mission';
import { localDate } from '@/lib/plans/time';
import type { HobbyWeek } from '@/lib/plans/types';
import { parseDate } from '@/lib/plans/when';
import { hobbyById } from '@/lib/qloo/tags';
import { getPlan, loadProfile, savePlan, saveProfile, useStored } from '@/lib/store';
import { apiFetch } from '@/lib/supabase/browser';

const QUICK = ['Loved it', 'It was fine', 'Too hard', "Didn't go"];

/** Week one is the plan's day; each later step lands a week after. */
function withDates(weeks: HobbyWeek[], start: string | undefined): HobbyWeek[] {
  const base = parseDate(start ?? localDate(new Date()));
  return weeks.map((w, i) => {
    if (w.date) return w;
    const d = new Date(base);
    d.setDate(d.getDate() + 7 * i);
    return { ...w, date: localDate(d) };
  });
}

export default function HobbyPlanPage() {
  const { id } = useParams<{ id: string }>();
  const plan = useStored(useCallback(() => getPlan(id) ?? null, [id]));
  const [intro, setIntro] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [reply, setReply] = useState<string | null>(null);
  const started = useRef(false);

  const generate = useCallback(async () => {
    const p = getPlan(id);
    const profile = loadProfile();
    if (!p || !p.stops[0]) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch('/api/plans/hobby', {
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
      savePlan({ ...p, hobbyWeeks: withDates(body.weeks, p.date), hobbyIntro: body.intro });
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
        <p className="text-sm text-muted">This plan isn&apos;t on this device or in your account.</p>
      </main>
    );
  }

  const hobby = hobbyById(plan.hobbyId ?? '')?.label ?? plan.title;
  const weeks = plan.hobbyWeeks ? withDates(plan.hobbyWeeks, plan.date) : [];
  const current = weeks.findIndex((w) => !w.done);
  const finished = weeks.length > 0 && current < 0;

  async function completeStep(i: number, text: string) {
    const t = text.trim();
    if (!t) return setError('Say how it went first.');
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch('/api/plans/hobby/adapt', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ hobby, weeks, index: i, note: t }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Echo couldn't update the plan just now. Try again.");
      savePlan({ ...plan!, hobbyWeeks: body.weeks });
      setReply(body.reply);
      const profile = loadProfile();
      if (profile && body.learned && !profile.preferences.notes.includes(body.learned)) {
        saveProfile({ ...profile, preferences: { ...profile.preferences, notes: [...profile.preferences.notes, body.learned] } });
      }
      setChecking(null);
      setNote('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function undo(i: number) {
    savePlan({ ...plan!, hobbyWeeks: weeks.map((w, j) => (j === i ? { ...w, done: false } : w)) });
  }

  return (
    <main className="flex flex-1 flex-col gap-3">
      <BackHeader href={`/plan/${plan.id}`} right={weeks.length ? <span className="text-xs text-faint">{finished ? 'Done' : `Step ${current + 1} of ${weeks.length}`}</span> : undefined}>
        {hobby}
      </BackHeader>
      {busy && !weeks.length && <Spinner label="Writing your plan…" />}
      {(reply ?? intro ?? plan.hobbyIntro) && <Voice>{reply ?? intro ?? plan.hobbyIntro}</Voice>}
      {error && (
        <div className="flex flex-col gap-2">
          <p role="status" className="text-sm text-warn">
            {error}
          </p>
          {!weeks.length && <Button onClick={generate}>Try again</Button>}
        </div>
      )}

      {finished && (
        <section className="flex flex-col gap-2 rounded-2xl border-2 border-echo bg-echo-soft px-3.5 py-3 text-echo">
          <p className="font-voice text-[1.3rem] leading-snug">
            {weeks.length} weeks of {hobby.toLowerCase()}. That&apos;s a real thing.
          </p>
          {weeks.some((w) => w.note) && (
            <ul className="flex flex-col gap-1 text-sm text-ink">
              {weeks
                .filter((w) => w.note)
                .map((w) => (
                  <li key={w.title}>
                    <span className="font-semibold">{w.title}:</span> {w.note}
                  </li>
                ))}
            </ul>
          )}
          <Link href="/echo" className="text-sm font-bold">
            See how your echo changed
          </Link>
        </section>
      )}

      <ol className="relative flex flex-col gap-4 border-l-2 border-line pl-5">
        {weeks.map((w, i) => {
          const isCurrent = i === current;
          return (
            <li key={i} className="relative flex flex-col gap-1.5">
              <span
                className={`absolute top-0.5 -left-[31px] grid size-5 place-items-center rounded-full text-[10px] font-bold ${
                  w.done ? 'bg-echo text-surface' : isCurrent ? 'bg-accent text-accent-ink' : 'border border-line bg-surface text-muted'
                }`}
              >
                {w.done ? <CheckIcon className="size-3" /> : i + 1}
              </span>
              <div className="flex items-baseline justify-between gap-2">
                <p className={`text-[0.9rem] font-bold ${w.done ? 'text-muted' : ''}`}>{w.title}</p>
                {w.date && <span className={`flex-none text-xs ${isCurrent ? 'font-bold text-echo' : 'text-faint'}`}>{w.done ? 'Done' : countdown(w.date)}</span>}
              </div>
              <p className="text-sm text-muted">{w.detail}</p>
              {w.note && <p className="text-xs text-echo">You said: {w.note}</p>}

              {isCurrent && checking !== i && (
                <div className="flex flex-wrap gap-2">
                  {w.planId ? (
                    <Link href={`/plan/${w.planId}`} className="rounded-full border border-line px-3 py-1.5 text-sm font-semibold">
                      See this week&apos;s plan
                    </Link>
                  ) : (
                    <Link
                      href={`${runUrl({ request: `${hobby}: ${w.title}. ${w.detail}`, mode: 'hobby', when: { date: w.date && w.date >= localDate(new Date()) ? w.date : localDate(new Date()), part: plan.part ?? 'any' } })}&hobby=${plan.id}&step=${i}`}
                      className="rounded-full bg-accent px-3 py-1.5 text-sm font-semibold text-accent-ink"
                    >
                      Find a place for this
                    </Link>
                  )}
                  <button type="button" onClick={() => setChecking(i)} className="cursor-pointer rounded-full border border-line px-3 py-1.5 text-sm font-semibold">
                    I did it
                  </button>
                </div>
              )}

              {checking === i && (
                <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3">
                  <Label as="p">How did it go?</Label>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK.map((q) => (
                      <button key={q} type="button" disabled={busy} onClick={() => completeStep(i, q)} className="cursor-pointer rounded-full border border-line px-3 py-1.5 text-sm hover:border-accent">
                        {q}
                      </button>
                    ))}
                  </div>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void completeStep(i, note);
                    }}
                    className="flex gap-2"
                  >
                    <label htmlFor={`note-${i}`} className="sr-only">
                      How it went
                    </label>
                    <input
                      id={`note-${i}`}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="The class was too big"
                      maxLength={400}
                      className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
                    />
                    <Button type="submit" disabled={busy} className="px-3 py-2">
                      {busy ? '…' : 'Send'}
                    </Button>
                  </form>
                </div>
              )}

              {w.done && (
                <button type="button" onClick={() => undo(i)} className="cursor-pointer self-start text-xs text-faint">
                  Not done after all
                </button>
              )}
            </li>
          );
        })}
      </ol>
      {weeks.length > 0 && !finished && <p className="text-xs text-faint">After each step, Echo adjusts the rest of the plan to how it went.</p>}
    </main>
  );
}

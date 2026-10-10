'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CheckIcon, XIcon } from '@/components/icons';
import { Button, Card, Label, LinkButton, Spinner, Voice, Why } from '@/components/ui';
import { formatTime } from '@/lib/plans/time';
import { whenLabel, type DayPart } from '@/lib/plans/when';
import { loadProfile } from '@/lib/store';
import { supabaseConfigured } from '@/lib/supabase/config';
import { getSharedPlan, respondToPlan, type SharedPlanView } from '@/lib/sync';

/** A plan a friend shared. Anyone with the link can see it and answer, without onboarding. */
export default function SharedPlanPage() {
  const { token } = useParams<{ token: string }>();
  const [view, setView] = useState<SharedPlanView | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      const v = await getSharedPlan(token);
      setView(v);
      const mine = v?.responses.find((r) => r.mine);
      setName(mine?.name ?? loadProfile()?.name ?? '');
    } catch (err) {
      setError((err as Error).message);
      setView(null);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (!supabaseConfigured()) {
    return (
      <main className="flex flex-1 items-center justify-center text-center text-sm text-muted">Shared plans need the database, which isn&apos;t set up here.</main>
    );
  }
  if (view === undefined) return <Spinner label="Opening the plan…" />;
  if (!view) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted">{error ?? 'This link is no longer valid.'}</p>
        <LinkButton href="/" kind="primary">
          See what Echo is
        </LinkButton>
      </main>
    );
  }

  const s = view.snapshot;
  const mine = view.responses.find((r) => r.mine);
  const when = s.date ? whenLabel({ date: s.date, part: (s.part as DayPart) ?? 'any' }) : null;

  async function answer(response: 'in' | 'not_that_one') {
    const display = name.trim();
    if (!display) return setError('Add your name so your friend knows who answered.');
    setBusy(true);
    setError(null);
    try {
      await respondToPlan(token, display, response, note);
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-3">
      <p className="text-xs font-bold tracking-[0.08em] text-faint uppercase">{view.ownerName ? `${view.ownerName} shared a plan` : 'A shared plan'}</p>
      <h1 className="font-voice text-[1.75rem] leading-tight font-medium">{s.title}</h1>
      <p className="text-sm text-muted">{[when, s.areaLabel].filter(Boolean).join(' · ')}</p>
      <Voice>{s.summary}</Voice>

      {s.stops.map((stop) => (
        <Card key={stop.name}>
          <p className="text-[0.9rem] font-bold">
            {stop.time ? `${formatTime(stop.time)} · ` : ''}
            {stop.name}
          </p>
          {(stop.category || stop.address) && <p className="text-[0.8rem] text-muted">{[stop.category, stop.address].filter(Boolean).join(' · ')}</p>}
          {stop.why && <Why>{stop.why}</Why>}
        </Card>
      ))}

      {s.exchange && s.exchange.length > 0 && (
        <details>
          <summary className="cursor-pointer text-sm font-bold text-muted">How the Echos agreed</summary>
          <div className="mt-2 flex flex-col gap-2">
            {s.exchange.map((t, i) => (
              <p key={i} className="rounded-xl bg-sunk px-3 py-2 text-[0.82rem]">
                <span className="mb-0.5 block text-[10.5px] font-bold tracking-[0.05em] text-muted uppercase">{t.name}</span>
                {t.text}
              </p>
            ))}
          </div>
        </details>
      )}

      {view.responses.length > 0 && (
        <section className="flex flex-col gap-1">
          <Label>Answers so far</Label>
          {view.responses.map((r) => (
            <p key={r.name} className="flex items-center gap-2 text-[0.85rem]">
              {r.response === 'in' ? <CheckIcon className="size-4 text-echo" /> : <XIcon className="size-4 text-warn" />}
              <span className="font-semibold">{r.mine ? `${r.name} (you)` : r.name}</span>
              <span className="text-muted">{r.response === 'in' ? 'is in' : 'would rather not'}</span>
            </p>
          ))}
        </section>
      )}

      {view.isOwner ? (
        <p className="rounded-2xl bg-sunk px-3.5 py-3 text-sm text-muted">This is your plan. Send the link and answers show up here and on the plan.</p>
      ) : (
        <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface px-3.5 py-3">
          <p className="text-[0.9rem] font-bold">{mine ? 'Change your answer' : 'Are you in?'}</p>
          <label htmlFor="name" className="sr-only">
            Your name
          </label>
          <input
            id="name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Your name"
            maxLength={60}
            autoComplete="given-name"
            className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
          <label htmlFor="note" className="sr-only">
            A note (optional)
          </label>
          <input
            id="note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="A note, like 'can we do 2pm?' (optional)"
            maxLength={200}
            className="rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
          {error && (
            <p role="status" className="text-sm text-warn">
              {error}
            </p>
          )}
          <div className="grid grid-cols-2 gap-2">
            <Button kind="primary" onClick={() => answer('in')} disabled={busy}>
              <CheckIcon className="size-4" /> I&apos;m in
            </Button>
            <Button onClick={() => answer('not_that_one')} disabled={busy}>
              Not that one
            </Button>
          </div>
        </section>
      )}

      {!view.isOwner && (
        <div className="mt-2 flex flex-col gap-2 rounded-2xl bg-accent-soft px-3.5 py-3">
          <p className="text-sm font-semibold text-accent-text">Want Echo to plan things for you too?</p>
          <LinkButton href="/onboarding" kind="primary">
            Make your echo
          </LinkButton>
        </div>
      )}
    </main>
  );
}

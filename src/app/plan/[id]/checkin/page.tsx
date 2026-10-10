'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useRef, useState } from 'react';
import { CheckIcon, MicIcon } from '@/components/icons';
import { BackHeader, Button, Label, Voice } from '@/components/ui';
import { runUrl } from '@/lib/plans/client';
import type { Outcome } from '@/lib/plans/types';
import { defaultWhen, parseWhen } from '@/lib/plans/when';
import { listenOnce, speechSupport, type Listening } from '@/lib/speech/browser-speech';
import { getPlan, loadProfile, savePlan, saveProfile, useStored } from '@/lib/store';
import { apiFetch } from '@/lib/supabase/browser';

const OUTCOMES: Array<{ id: Outcome; label: string }> = [
  { id: 'loved', label: 'Loved it' },
  { id: 'fine', label: 'It was fine' },
  { id: 'skipped', label: "I didn't go" },
  { id: 'wrong', label: 'Wrong for me' },
];

export default function CheckInPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const plan = useStored(useCallback(() => getPlan(id) ?? null, [id]));
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const listenRef = useRef<Listening | null>(null);

  if (plan === undefined) return null;
  if (!plan) {
    return (
      <main className="flex flex-1 flex-col gap-4">
        <BackHeader href="/home">Check-in</BackHeader>
        <p className="text-sm text-muted">This plan isn&apos;t on this device or in your account.</p>
      </main>
    );
  }

  async function dictate() {
    if (listening) return listenRef.current?.stop();
    if (!speechSupport().listen) return setError("This browser can't listen. Type your answer instead.");
    setError(null);
    setListening(true);
    const l = listenOnce({ onInterim: setAnswer });
    listenRef.current = l;
    try {
      const text = await l.result;
      if (text) setAnswer(text);
    } catch {
      setError("Couldn't use the microphone. Type your answer instead.");
    } finally {
      setListening(false);
      listenRef.current = null;
    }
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const label = OUTCOMES.find((o) => o.id === outcome)?.label;
    const text = [label, answer.trim()].filter(Boolean).join('. ');
    if (!text) return setError('Tap one of the answers, or say how it went.');
    const profile = loadProfile();
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch('/api/plans/checkin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ planTitle: plan!.title, stops: plan!.stops.map((s) => s.name), answer: text, outcome: outcome ?? undefined, knownNotes: profile?.preferences.notes ?? [] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Echo couldn't respond just now. Try again.");
      savePlan({ ...plan!, status: 'done', checkIn: { outcome: outcome ?? undefined, answer: text, reply: body.reply, learned: body.learned, suggestion: body.suggestion, at: Date.now() } });
      if (profile && body.learned?.length) {
        saveProfile({ ...profile, preferences: { ...profile.preferences, notes: [...new Set([...profile.preferences.notes, ...body.learned])] } });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Echo couldn't respond just now. Try again.");
    } finally {
      setBusy(false);
    }
  }

  const done = plan.checkIn;

  return (
    <main className="flex flex-1 flex-col gap-3">
      <BackHeader href="/home">Check-in</BackHeader>
      <Voice className="text-[1.3rem]">How was {plan.stops[0]?.name ?? 'it'}?</Voice>

      {done ? (
        <>
          {done.suggestion && (
            <section className="flex flex-col gap-2 rounded-2xl border-2 border-accent bg-surface px-3.5 py-3">
              <Label>Next, Echo suggests</Label>
              <p className="font-voice text-[1.15rem] leading-snug">{done.suggestion}</p>
              <Button kind="primary" onClick={() => router.push(runUrl({ request: done.suggestion!, mode: 'hobby', when: parseWhen(done.suggestion!) ?? defaultWhen('hobby') }))}>
                Plan it
              </Button>
            </section>
          )}
          <p className="max-w-[86%] self-end rounded-2xl rounded-br-sm bg-sunk px-3 py-2 text-[0.9rem]">{done.answer}</p>
          <Voice>{done.reply}</Voice>
          {done.learned.length > 0 && (
            <ul className="flex flex-col gap-2 border-t border-line pt-3">
              {done.learned.map((l) => (
                <li key={l} className="flex items-start gap-2 text-[0.82rem]">
                  <CheckIcon className="mt-0.5 size-4 flex-none text-echo" />
                  Noted: {l}
                </li>
              ))}
            </ul>
          )}
          <div className="flex-1" />
          <Button onClick={() => router.push('/home')}>Back home</Button>
        </>
      ) : (
        <form onSubmit={send} className="flex flex-1 flex-col gap-3">
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="How it went">
            {OUTCOMES.map((o) => (
              <button
                key={o.id}
                type="button"
                role="radio"
                aria-checked={outcome === o.id}
                onClick={() => {
                  setOutcome(o.id);
                  if (error) setError(null);
                }}
                className={`cursor-pointer rounded-2xl border px-3 py-3 text-sm font-semibold ${outcome === o.id ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <label htmlFor="answer" className="sr-only">
              Anything else (optional)
            </label>
            <textarea
              id="answer"
              value={answer}
              onChange={(e) => {
                setAnswer(e.target.value);
                if (error) setError(null);
              }}
              rows={3}
              maxLength={700}
              placeholder="Anything else? The class felt too big, I want to go back…"
              className="min-w-0 flex-1 resize-none rounded-2xl border border-line bg-surface px-3.5 py-3 text-[0.95rem] outline-none focus:border-accent"
            />
            <button
              type="button"
              onClick={dictate}
              aria-label={listening ? 'Stop listening' : 'Say it instead'}
              className={`grid size-12 flex-none cursor-pointer place-items-center rounded-full ${listening ? 'bg-accent text-accent-ink ring-4 ring-accent-soft' : 'border border-line bg-surface'}`}
            >
              <MicIcon className="size-5" />
            </button>
          </div>
          {error && (
            <p role="status" className="text-sm text-warn">
              {error}
            </p>
          )}
          <div className="flex-1" />
          <Button kind="primary" type="submit" disabled={busy}>
            {busy ? 'Sending…' : 'Send'}
          </Button>
        </form>
      )}
    </main>
  );
}

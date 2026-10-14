'use client';

import { useRouter } from 'next/navigation';
import { Suspense, useMemo, useRef, useState } from 'react';
import { AreaChip } from '@/components/area-chip';
import { MicIcon } from '@/components/icons';
import { BackHeader, Button, Label, LinkButton, Voice } from '@/components/ui';
import { WhenChip } from '@/components/when-picker';
import { runUrl } from '@/lib/plans/client';
import { exampleRequest, suggestedRequests } from '@/lib/plans/suggest';
import { seeded } from '@/lib/variety';
import { defaultWhen, parseWhen, type When } from '@/lib/plans/when';
import { listenOnce, speechSupport, type Listening } from '@/lib/speech/browser-speech';
import { loadProfile, useStored } from '@/lib/store';
import { markSpokeToEcho } from '@/lib/voice/say';

const MOODS: Array<{ id: string; label: string }> = [
  { id: 'quiet', label: 'Quiet' },
  { id: 'cozy', label: 'Cozy' },
  { id: 'soloFriendly', label: 'Good alone' },
  { id: 'handsOn', label: 'Hands-on' },
];

const DEFAULTS = {
  hobby: 'Find me a new hobby to try.',
  day: 'Plan me a slow, full day out.',
} as const;

function NewPlan() {
  const router = useRouter();
  const profile = useStored(loadProfile);
  const [request, setRequest] = useState('');
  const [override, setOverride] = useState<When | null>(null);
  const [moods, setMoods] = useState<string[]>([]);
  const [modeChoice, setModeChoice] = useState<'hobby' | 'day' | null>(null);
  // A fresh draw of ideas and example text each visit, steady while they type.
  const [seed] = useState(() => String(Math.random()));
  const [draw, setDraw] = useState(0);
  const ideas = useMemo(() => (profile ? suggestedRequests(profile, seeded(`${seed}:${draw}`)) : []), [profile, seed, draw]);
  const example = useMemo(() => exampleRequest(profile, seeded(seed)), [profile, seed]);
  const [listening, setListening] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const listenRef = useRef<Listening | null>(null);

  const parsed = useMemo(() => parseWhen(request), [request]);
  // "A full day" when they say so, or pick it; otherwise one thing to do.
  const mode = modeChoice ?? (/\b(full|whole|all)[ -]day\b|\bday out\b/i.test(request) ? 'day' : 'hobby');
  const when = override ?? parsed ?? defaultWhen(mode);

  if (profile === undefined) return null;
  if (!profile) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted">Tell Echo what you love first.</p>
        <LinkButton href="/onboarding" kind="primary">
          Start
        </LinkButton>
      </main>
    );
  }

  function go(mode: 'hobby' | 'day') {
    const q = request.trim() || DEFAULTS[mode];
    // A full day without a stated day lands on the weekend.
    const w = override ?? parseWhen(q) ?? defaultWhen(mode);
    router.push(runUrl({ request: q, mode, when: w, moods }));
  }

  async function dictate() {
    if (listening) {
      listenRef.current?.stop();
      return;
    }
    if (!speechSupport().listen) return setNotice("This browser can't listen. Type your request instead.");
    setNotice(null);
    setListening(true);
    const l = listenOnce({ onInterim: setRequest });
    listenRef.current = l;
    try {
      const text = await l.result;
      if (text) {
        markSpokeToEcho();
        setRequest(text);
      }
    } catch {
      setNotice("Couldn't use the microphone. Type your request instead.");
    } finally {
      setListening(false);
      listenRef.current = null;
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-4">
      <BackHeader href="/home">New plan</BackHeader>
      <Voice>What are you in the mood for? Say when and where if it matters.</Voice>

      <div className="flex items-end gap-2">
        <label htmlFor="request" className="sr-only">
          What you want
        </label>
        <textarea
          id="request"
          value={request}
          onChange={(e) => setRequest(e.target.value)}
          rows={3}
          maxLength={400}
          placeholder={example}
          className="min-w-0 flex-1 resize-none rounded-2xl border border-line bg-surface px-3.5 py-3 text-[0.95rem] outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={dictate}
          aria-label={listening ? 'Stop listening' : 'Say it instead'}
          className={`grid size-12 flex-none cursor-pointer place-items-center rounded-full ${listening ? 'bg-accent text-accent-ink ring-4 ring-accent-soft' : 'border border-line bg-surface text-ink'}`}
        >
          <MicIcon className="size-5" />
        </button>
      </div>
      {notice && (
        <p role="status" className="text-sm text-warn">
          {notice}
        </p>
      )}

      <div className="flex flex-wrap items-start gap-2">
        <WhenChip when={when} onChange={setOverride} auto={!override && !parsed} />
        <AreaChip area={profile.area} />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>Mood</Label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Mood">
          {MOODS.map((m) => {
            const on = moods.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={on}
                onClick={() => setMoods((ms) => (on ? ms.filter((x) => x !== m.id) : [...ms, m.id]))}
                className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${on ? 'border-transparent bg-echo-soft font-semibold text-echo' : 'border-line bg-surface'}`}
              >
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <Label>Ideas for you</Label>
          <button type="button" onClick={() => setDraw((d) => d + 1)} className="cursor-pointer text-xs font-bold text-accent">
            More ideas
          </button>
        </div>
        <div className="flex flex-col gap-1.5">
          {ideas.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setRequest(s)}
              className="cursor-pointer rounded-xl border border-dashed border-line px-3 py-2 text-left text-sm text-muted hover:border-accent hover:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1" />
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-sunk p-1" role="radiogroup" aria-label="How big a plan">
        {(
          [
            ['hobby', 'One thing'],
            ['day', 'A full day'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="radio"
            aria-checked={mode === id}
            onClick={() => setModeChoice(id)}
            className={`cursor-pointer rounded-xl py-2 text-sm font-semibold ${mode === id ? 'bg-surface shadow-sm' : 'text-muted'}`}
          >
            {label}
          </button>
        ))}
      </div>
      <Button kind="primary" onClick={() => go(mode)}>
        Plan it
      </Button>
      <button type="button" onClick={() => router.push('/friends')} className="cursor-pointer self-center text-sm font-bold text-accent">
        Plan with friends instead
      </button>
    </main>
  );
}

export default function NewPlanPage() {
  return (
    <Suspense>
      <NewPlan />
    </Suspense>
  );
}

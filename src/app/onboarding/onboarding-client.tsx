'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ACTIVITY_CHIPS } from '@/data/picker';
import { AreaPicker } from '@/components/area-picker';
import { ArrowLeftIcon, CheckIcon, MicIcon } from '@/components/icons';
import { Button, Chip, Label, Spinner, Voice } from '@/components/ui';
import type { PickerCard } from '@/lib/onboarding/picker';
import type { HeardTaste } from '@/lib/onboarding/types';
import { hobbyIdFor } from '@/lib/profile/activities';
import { EMPTY_PREFERENCES, SAMPLE_AREA, type Activity, type Area, type Preferences } from '@/lib/profile/types';
import { listenOnce, speechSupport, type Listening } from '@/lib/speech/browser-speech';
import { loadProfile, saveProfile } from '@/lib/store';
import { apiFetch } from '@/lib/supabase/browser';
import { Review } from './review';
import { Spoken } from '@/components/spoken';
import { markSpokeToEcho } from '@/lib/voice/say';

type Step = 'pick' | 'open' | 'activities' | 'prefs' | 'area' | 'review';
const STEPS: Step[] = ['pick', 'open', 'activities', 'prefs', 'area', 'review'];
const TARGET = 8;
const FIRST_PAGE = 12;
const GUESS_EVERY = 3;

const TYPE_LABEL: Record<string, string> = {
  tv_show: 'TV',
  artist: 'Music',
  movie: 'Film',
  book: 'Book',
  author: 'Author',
  video_game: 'Game',
  podcast: 'Podcast',
  person: 'Person',
  unknown: '',
};

async function post<T>(url: string, body: object): Promise<T> {
  const res = await apiFetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? 'Something went wrong. Try again.');
  return data as T;
}

export function OnboardingClient() {
  const router = useRouter();
  const [step, setStep] = useState<Step>('pick');
  const [deck, setDeck] = useState<PickerCard[] | null>(null);
  const [guesses, setGuesses] = useState<PickerCard[]>([]);
  const [shown, setShown] = useState(FIRST_PAGE);
  const [covers, setCovers] = useState<Record<string, string>>({});
  const [loved, setLoved] = useState<Map<string, HeardTaste>>(new Map());
  const [extra, setExtra] = useState<HeardTaste[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [preferences, setPreferences] = useState<Preferences>(EMPTY_PREFERENCES);
  const [area, setArea] = useState<Area>(SAMPLE_AREA);
  const [error, setError] = useState<string | null>(null);
  const guessedAt = useRef(0);

  // Load the starting cards, and anything already in the profile.
  useEffect(() => {
    const existing = loadProfile();
    if (existing) {
      setLoved(new Map(existing.tastes.map((t) => [t.key, t])));
      guessedAt.current = existing.tastes.length;
      setActivities(existing.activities);
      setPreferences(existing.preferences);
      setArea(existing.area);
    }
    post<{ cards: PickerCard[] }>('/api/picker', { action: 'seed' })
      .then(({ cards }) => setDeck(cards))
      .catch((err) => {
        setError((err as Error).message);
        setDeck([]);
      });
  }, []);

  // Fill in covers for cards without a Qloo image.
  useEffect(() => {
    const all = [...(deck ?? []), ...guesses];
    const missing = all.filter((c) => !c.image && !(c.key in covers)).slice(0, 40);
    if (!missing.length) return;
    setCovers((cv) => ({ ...cv, ...Object.fromEntries(missing.map((m) => [m.key, ''])) }));
    post<{ covers: Record<string, string> }>('/api/covers', { items: missing.map((c) => ({ key: c.key, name: c.name, type: c.type })) })
      .then(({ covers: found }) => setCovers((cv) => ({ ...cv, ...found })))
      .catch(() => undefined);
  }, [deck, guesses, covers]);

  const tastes = useMemo(() => {
    const byKey = new Map(loved);
    for (const t of extra) byKey.set(t.key, t);
    return [...byKey.values()];
  }, [loved, extra]);

  // Every few taps, ask Qloo what else they'd like.
  useEffect(() => {
    const ids = [...loved.values()].flatMap((t) => (t.entity?.id ? [t.entity.id] : []));
    if (loved.size - guessedAt.current < GUESS_EVERY || ids.length === 0) return;
    guessedAt.current = loved.size;
    const names = Object.fromEntries([...loved.values()].flatMap((t) => (t.entity ? [[t.entity.id, t.entity.name]] : [])));
    const exclude = [...(deck ?? []), ...guesses].flatMap((c) => (c.taste.entity?.id ? [c.taste.entity.id] : []));
    post<{ cards: PickerCard[] }>('/api/picker', { action: 'guess', ids, names, exclude })
      .then(({ cards }) => {
        if (cards.length) setGuesses((g) => [...cards.filter((c) => !g.some((x) => x.key === c.key)), ...g].slice(0, 9));
      })
      .catch(() => undefined);
  }, [loved, deck, guesses]);

  function toggle(card: PickerCard) {
    setError(null);
    setLoved((m) => {
      const next = new Map(m);
      if (next.has(card.key)) next.delete(card.key);
      else next.set(card.key, card.taste);
      return next;
    });
  }

  function go(next: Step) {
    setError(null);
    setStep(next);
    window.scrollTo({ top: 0 });
  }

  function back() {
    const i = STEPS.indexOf(step);
    if (i > 0) go(STEPS[i - 1]!);
    else router.push('/');
  }

  const stepIndex = STEPS.indexOf(step);

  if (step === 'review') {
    return (
      <Review
        heard={tastes}
        onChange={(next) => {
          setLoved(new Map(next.map((t) => [t.key, t])));
          setExtra([]);
        }}
        activities={activities}
        onActivitiesChange={setActivities}
        preferences={preferences}
        onPreferencesChange={setPreferences}
        onKeepTalking={() => go('pick')}
        keepLabel="Pick more"
        onBuild={(built) => {
          const previous = loadProfile();
          saveProfile({ name: previous?.name, tastes: built, activities, preferences, area });
          router.push('/echo?build=1');
        }}
      />
    );
  }

  return (
    <main className="flex flex-1 flex-col gap-3">
      <header className="flex items-center justify-between">
        <button type="button" onClick={back} className="flex cursor-pointer items-center gap-1.5 text-base font-bold">
          <ArrowLeftIcon className="size-[18px]" /> Back
        </button>
        <div className="flex gap-1" aria-label={`Step ${stepIndex + 1} of ${STEPS.length}`}>
          {STEPS.map((s, i) => (
            <span key={s} className={`h-1.5 w-5 rounded-full ${i <= stepIndex ? 'bg-accent' : 'bg-line'}`} />
          ))}
        </div>
      </header>

      {step === 'pick' && (
        <PickStep
          deck={deck}
          guesses={guesses}
          shown={shown}
          covers={covers}
          loved={loved}
          error={error}
          onToggle={toggle}
          onMore={() => setShown((s) => s + 9)}
          onNext={() => {
            if (loved.size < 3) return setError('Tap at least three things you love.');
            go('open');
          }}
        />
      )}

      {step === 'open' && (
        <OpenStep
          known={tastes.map((t) => t.key)}
          added={extra}
          onAdd={(t, acts) => {
            setExtra((e) => [...e, ...t.filter((x) => !e.some((y) => y.key === x.key))]);
            setActivities((a) => [...a, ...acts.filter((x) => !a.some((y) => y.name.toLowerCase() === x.name.toLowerCase()))]);
          }}
          onNext={() => go('activities')}
        />
      )}

      {step === 'activities' && <ActivitiesStep activities={activities} onChange={setActivities} onNext={() => go('prefs')} />}

      {step === 'prefs' && <PrefsStep preferences={preferences} onChange={setPreferences} onNext={() => go('area')} />}

      {step === 'area' && (
        <>
          <Voice className="text-[1.3rem]">Last thing: where should Echo look for places?</Voice>
          <AreaPicker
            current={area.sample ? undefined : area}
            onPick={(a) => {
              setArea(a);
              go('review');
            }}
          />
          <div className="flex-1" />
          <button type="button" onClick={() => go('review')} className="cursor-pointer text-center text-sm font-bold text-accent">
            {area.sample ? 'Skip for now' : `Keep ${area.label}`}
          </button>
        </>
      )}
    </main>
  );
}

function Cover({ card, src }: { card: PickerCard; src?: string }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="aspect-[3/4] w-full rounded-xl bg-sunk object-cover" />;
  }
  return (
    <div className="grid aspect-[3/4] w-full place-items-center rounded-xl bg-sunk px-2 text-center font-voice text-[0.95rem] leading-tight text-muted">
      {card.name}
    </div>
  );
}

function PickStep(props: {
  deck: PickerCard[] | null;
  guesses: PickerCard[];
  shown: number;
  covers: Record<string, string>;
  loved: Map<string, HeardTaste>;
  error: string | null;
  onToggle: (c: PickerCard) => void;
  onMore: () => void;
  onNext: () => void;
}) {
  const { deck, guesses, shown, covers, loved, error } = props;
  const n = loved.size;
  const visible = (deck ?? []).filter((c) => !guesses.some((g) => g.key === c.key));
  const card = (c: PickerCard) => {
    const on = loved.has(c.key);
    return (
      <li key={c.key}>
        <button
          type="button"
          onClick={() => props.onToggle(c)}
          aria-pressed={on}
          className={`relative flex w-full cursor-pointer flex-col gap-1 rounded-2xl p-1 text-left transition-transform active:scale-[0.97] ${on ? 'bg-accent-soft ring-2 ring-accent' : ''}`}
        >
          <Cover card={c} src={c.image || covers[c.key] || undefined} />
          {on && (
            <span className="absolute top-2.5 right-2.5 grid size-7 place-items-center rounded-full bg-accent text-accent-ink">
              <CheckIcon className="size-4" />
            </span>
          )}
          <span className="line-clamp-2 px-0.5 text-[0.78rem] leading-tight font-bold">{c.name}</span>
          <span className="line-clamp-1 px-0.5 text-[10.5px] text-faint">{c.guess ? (c.reason ?? "Echo's guess") : TYPE_LABEL[c.type]}</span>
        </button>
      </li>
    );
  };

  return (
    <>
      <h1 className="font-voice text-[1.6rem] leading-tight font-medium">Tap what you love</h1>
      <p className="text-sm text-muted">Shows, music, films, books, games, podcasts. Skip anything you don&apos;t know.</p>

      {guesses.length > 0 && (
        <section className="flex flex-col gap-2 rounded-2xl bg-sunk p-2" aria-label="Echo's guesses">
          <Label>Echo thinks you&apos;ll like</Label>
          <ul className="grid grid-cols-3 gap-2">{guesses.map(card)}</ul>
        </section>
      )}

      {deck === null ? <Spinner label="Finding things to show you…" /> : <ul className="grid grid-cols-3 gap-2">{visible.slice(0, shown).map(card)}</ul>}
      {deck && shown < visible.length && (
        <Button onClick={props.onMore} className="self-center px-5 py-2">
          Show more
        </Button>
      )}

      <div className="sticky bottom-0 -mx-4 mt-auto flex flex-col gap-1.5 border-t border-line bg-bg/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        {error && (
          <p role="status" className="text-center text-sm text-warn">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted tabular-nums">
            {Math.min(n, TARGET)} of {TARGET} things
          </span>
          <Button kind="primary" onClick={props.onNext} className="px-6">
            {n >= 6 ? "That's enough" : 'Next'}
          </Button>
        </div>
        <p className="text-center text-[10px] text-faint">Covers from Qloo, Apple, Open Library and Wikipedia.</p>
      </div>
    </>
  );
}

function OpenStep({ known, added, onAdd, onNext }: { known: string[]; added: HeardTaste[]; onAdd: (t: HeardTaste[], a: Activity[]) => void; onNext: () => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const listenRef = useRef<Listening | null>(null);

  async function send(answer: string) {
    const t = answer.trim();
    if (!t) return setError('Type or say something you love.');
    setBusy(true);
    setError(null);
    try {
      const r = await post<{ reply: string; added: HeardTaste[]; activities: Activity[] }>('/api/onboarding/extract', { text: t, known });
      setReply(r.reply);
      onAdd(r.added, r.activities);
      setText('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function dictate() {
    if (listening) return listenRef.current?.stop();
    if (!speechSupport().listen) return setError("This browser can't listen. Type it instead.");
    setError(null);
    setListening(true);
    const l = listenOnce({ onInterim: setText });
    listenRef.current = l;
    try {
      const said = await l.result;
      if (said) {
        markSpokeToEcho();
        await send(said);
      }
    } catch {
      setError("Couldn't use the microphone. Type it instead.");
    } finally {
      setListening(false);
      listenRef.current = null;
    }
  }

  return (
    <>
      <Voice className="text-[1.3rem]">I&apos;d never have guessed these. What&apos;s one thing you love that wasn&apos;t in there?</Voice>
      <p className="text-sm text-muted">A band nobody&apos;s heard of, a podcast, a game you keep going back to.</p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
        className="flex items-end gap-2"
      >
        <label htmlFor="open-answer" className="sr-only">
          Something you love
        </label>
        <input
          id="open-answer"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Mitski, and the Dolly Parton's America podcast"
          maxLength={600}
          className="min-w-0 flex-1 rounded-2xl border border-line bg-surface px-3.5 py-3 text-[0.95rem] outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={dictate}
          aria-label={listening ? 'Stop listening' : 'Say it instead'}
          className={`grid size-12 flex-none cursor-pointer place-items-center rounded-full ${listening ? 'bg-accent text-accent-ink ring-4 ring-accent-soft' : 'border border-line bg-surface'}`}
        >
          <MicIcon className="size-5" />
        </button>
      </form>
      <Button type="button" onClick={() => send(text)} disabled={busy}>
        {busy ? 'Adding…' : 'Add it'}
      </Button>
      {error && (
        <p role="status" className="text-sm text-warn">
          {error}
        </p>
      )}
      {reply && <Spoken text={reply} auto />}
      {added.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {added.map((t) => (
            <Chip key={t.key} tone="echo">
              {t.entity?.name ?? t.name}
            </Chip>
          ))}
        </div>
      )}
      <div className="flex-1" />
      <Button kind="primary" onClick={onNext}>
        {added.length ? 'Next' : 'Skip'}
      </Button>
    </>
  );
}

const ACTIVITY_LABEL = { does: 'I do this', wants_to: 'Want to try', used_to: 'Used to' } as const;

function ActivitiesStep({ activities, onChange, onNext }: { activities: Activity[]; onChange: (a: Activity[]) => void; onNext: () => void }) {
  const [custom, setCustom] = useState('');
  const statusOf = (name: string) => activities.find((a) => a.name.toLowerCase() === name.toLowerCase())?.status;

  function cycle(name: string, hobbyId?: string) {
    const current = statusOf(name);
    const rest = activities.filter((a) => a.name.toLowerCase() !== name.toLowerCase());
    const next: Activity['status'] | undefined = current === undefined ? 'does' : current === 'does' ? 'wants_to' : undefined;
    onChange(next ? [...rest, { name, status: next, hobbyId: hobbyId ?? hobbyIdFor(name) }] : rest);
  }

  const extras = activities.filter((a) => !ACTIVITY_CHIPS.some((c) => c.name.toLowerCase() === a.name.toLowerCase()));

  return (
    <>
      <Voice className="text-[1.3rem]">What do you do with a free afternoon, or wish you did?</Voice>
      <p className="text-sm text-muted">Tap once if you do it, twice if you want to try it.</p>
      <ul className="flex flex-wrap gap-2">
        {[...ACTIVITY_CHIPS, ...extras.map((a) => ({ name: a.name, hobbyId: a.hobbyId }))].map((c) => {
          const s = statusOf(c.name);
          return (
            <li key={c.name}>
              <button
                type="button"
                onClick={() => cycle(c.name, c.hobbyId)}
                className={`flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-2 text-sm ${
                  s === 'does' ? 'border-transparent bg-accent text-accent-ink' : s ? 'border-transparent bg-echo-soft text-echo' : 'border-line bg-surface'
                }`}
              >
                {c.name}
                {s && <span className="text-[11px] opacity-90">{ACTIVITY_LABEL[s]}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const name = custom.trim().toLowerCase();
          if (!name) return;
          if (!statusOf(name)) onChange([...activities, { name, status: 'does', hobbyId: hobbyIdFor(name) }]);
          setCustom('');
        }}
        className="flex gap-2"
      >
        <label htmlFor="custom-activity" className="sr-only">
          Add an activity
        </label>
        <input
          id="custom-activity"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          placeholder="Something else, like bouldering"
          maxLength={60}
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
        />
        <Button type="submit">Add</Button>
      </form>
      <div className="flex-1" />
      <Button kind="primary" onClick={onNext}>
        Next
      </Button>
    </>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value?: T; options: Array<{ id: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label as="p">{label}</Label>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            onClick={() => onChange(o.id)}
            className={`cursor-pointer rounded-xl border px-2 py-2.5 text-sm font-semibold ${value === o.id ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const DISTANCES = [1, 3, 5, 10, 20];

function PrefsStep({ preferences: p, onChange, onNext }: { preferences: Preferences; onChange: (p: Preferences) => void; onNext: () => void }) {
  const budget = p.budget ?? 150;
  return (
    <>
      <Voice className="text-[1.3rem]">How do you like to go out?</Voice>
      <Segmented
        label="Company"
        value={p.company}
        options={[
          { id: 'solo', label: 'Solo' },
          { id: 'group', label: 'With people' },
          { id: 'either', label: 'Either' },
        ]}
        onChange={(company) => onChange({ ...p, company })}
      />
      <Segmented
        label="Setting"
        value={p.setting}
        options={[
          { id: 'indoor', label: 'Indoors' },
          { id: 'outdoor', label: 'Outdoors' },
          { id: 'either', label: 'Either' },
        ]}
        onChange={(setting) => onChange({ ...p, setting })}
      />
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <Label as="p">Budget per outing</Label>
          <span className="text-sm font-bold tabular-nums">{budget >= 150 ? 'No limit' : `$${budget}`}</span>
        </div>
        <label htmlFor="budget" className="sr-only">
          Budget per outing in dollars
        </label>
        <input
          id="budget"
          type="range"
          min={0}
          max={150}
          step={5}
          value={budget}
          onChange={(e) => {
            const v = Number(e.target.value);
            onChange({ ...p, budget: v >= 150 ? undefined : v });
          }}
          className="w-full accent-[var(--accent)]"
        />
        <p className="text-xs text-faint">Places show $ to $$$$: $ is under $15, $$ about $15–40, $$$ about $40–80.</p>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label as="p">How far you&apos;ll go</Label>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="How far you'll go">
          {DISTANCES.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={p.maxMiles === d}
              onClick={() => onChange({ ...p, maxMiles: d })}
              className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-semibold ${p.maxMiles === d ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface'}`}
            >
              {d} mi
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1" />
      <Button kind="primary" onClick={onNext}>
        Next
      </Button>
      <Link href="#" onClick={(e) => (e.preventDefault(), onNext())} className="text-center text-sm font-bold text-accent">
        Skip
      </Link>
    </>
  );
}

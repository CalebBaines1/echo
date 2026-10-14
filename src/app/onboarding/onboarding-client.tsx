'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityDeck } from '@/components/activity-deck';
import { AreaPicker } from '@/components/area-picker';
import { ArrowLeftIcon, CheckIcon, MicIcon, XIcon } from '@/components/icons';
import { Spoken } from '@/components/spoken';
import { Button, Chip, Label, Spinner, Voice } from '@/components/ui';
import type { ActivityCard } from '@/data/picker';
import type { PickerCard } from '@/lib/onboarding/picker';
import type { HeardTaste } from '@/lib/onboarding/types';
import { hobbyIdFor } from '@/lib/profile/activities';
import { buildProfile } from '@/lib/profile/build-client';
import { EMPTY_PREFERENCES, SAMPLE_AREA, type Activity, type Area, type Preferences } from '@/lib/profile/types';
import { listenOnce, speechSupport, type Listening } from '@/lib/speech/browser-speech';
import { loadProfile, saveProfile } from '@/lib/store';
import { apiFetch } from '@/lib/supabase/browser';
import { markSpokeToEcho } from '@/lib/voice/say';

// Three steps, then straight home: what you love, where you are, what you do.
// Preferences have defaults and live on the profile; the profile builds in the background.
type Step = 'pick' | 'area' | 'activities';
const STEPS: Step[] = ['pick', 'area', 'activities'];
const ENOUGH = 4;
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

  const finish = useCallback(() => {
    const previous = loadProfile();
    const profile = { ...previous, name: previous?.name, tastes, activities, preferences, area };
    saveProfile(profile);
    // The summary and picks are written while they look at their first suggestion.
    void buildProfile(profile).catch(() => undefined);
    router.push(previous?.builtAt ? '/echo' : '/home');
  }, [tastes, activities, preferences, area, router]);

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
          tastes={tastes}
          error={error}
          onToggle={toggle}
          onRemove={(key) => {
            setLoved((m) => {
              const next = new Map(m);
              next.delete(key);
              return next;
            });
            setExtra((e) => e.filter((t) => t.key !== key));
          }}
          onAdd={(t, acts) => {
            setExtra((e) => [...e, ...t.filter((x) => !e.some((y) => y.key === x.key))]);
            setActivities((a) => [...a, ...acts.filter((x) => !a.some((y) => y.name.toLowerCase() === x.name.toLowerCase()))]);
          }}
          onMore={() => setShown((s) => s + 9)}
          onNext={() => {
            if (tastes.length < 3) return setError('Tap at least three things you love.');
            go('area');
          }}
        />
      )}

      {step === 'area' && (
        <>
          <Voice className="text-[1.3rem]">Where should Echo look for places?</Voice>
          <AreaPicker
            current={area.sample ? undefined : area}
            onPick={(a) => {
              setArea(a);
              go('activities');
            }}
          />
          <div className="flex-1" />
          <button type="button" onClick={() => go('activities')} className="cursor-pointer text-center text-sm font-bold text-accent">
            {area.sample ? 'Use a sample city for now' : `Keep ${area.label}`}
          </button>
        </>
      )}

      {step === 'activities' && <ActivitiesStep activities={activities} onChange={setActivities} onDone={finish} />}
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
  tastes: HeardTaste[];
  error: string | null;
  onToggle: (c: PickerCard) => void;
  onRemove: (key: string) => void;
  onAdd: (t: HeardTaste[], a: Activity[]) => void;
  onMore: () => void;
  onNext: () => void;
}) {
  const { deck, guesses, shown, covers, loved, tastes, error } = props;
  const n = tastes.length;
  const visible = (deck ?? []).filter((c) => !guesses.some((g) => g.key === c.key));
  const card = (c: PickerCard) => {
    const on = loved.has(c.key);
    const kind = c.guess ? (c.reason ?? "Echo's guess") : TYPE_LABEL[c.type];
    return (
      <li key={c.key}>
        <button
          type="button"
          onClick={() => props.onToggle(c)}
          aria-pressed={on}
          aria-label={[c.name, kind].filter(Boolean).join(', ')}
          className={`relative flex w-full cursor-pointer flex-col gap-1 rounded-2xl p-1 text-left transition-transform active:scale-[0.97] ${on ? 'bg-accent-soft ring-2 ring-accent' : ''}`}
        >
          <Cover card={c} src={c.image || covers[c.key] || undefined} />
          {on && (
            <span className="absolute top-2.5 right-2.5 grid size-7 place-items-center rounded-full bg-accent text-accent-ink" aria-hidden="true">
              <CheckIcon className="size-4" />
            </span>
          )}
          <span className="line-clamp-2 px-0.5 text-[0.78rem] leading-tight font-bold" aria-hidden="true">
            {c.name}
          </span>
          <span className="line-clamp-1 px-0.5 text-[10.5px] text-faint" aria-hidden="true">
            {kind}
          </span>
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

      <AddSomething known={tastes.map((t) => t.key)} onAdd={props.onAdd} />

      <div className="sticky bottom-0 -mx-4 mt-auto flex flex-col gap-2 border-t border-line bg-bg/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur">
        {n > 0 && (
          <ul className="flex max-h-[4.5rem] flex-wrap gap-1.5 overflow-y-auto" aria-label="Your picks">
            {tastes.map((t) => (
              <li key={t.key}>
                <button
                  type="button"
                  onClick={() => props.onRemove(t.key)}
                  aria-label={`Remove ${t.entity?.name ?? t.name}`}
                  className="flex cursor-pointer items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-semibold text-accent-text"
                >
                  {t.entity?.name ?? t.name}
                  <XIcon className="size-3" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {error && (
          <p role="status" className="text-center text-sm text-warn">
            {error}
          </p>
        )}
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm text-muted">{n === 0 ? 'Pick a few' : n < ENOUGH ? `${n} picked · a few more helps` : `${n} picked · plenty`}</span>
          <Button kind="primary" onClick={props.onNext} className="px-6">
            Next
          </Button>
        </div>
      </div>
    </>
  );
}

/** "Something not here?" Typed or said, matched to Qloo, added to the picks. */
function AddSomething({ known, onAdd }: { known: string[]; onAdd: (t: HeardTaste[], a: Activity[]) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const listenRef = useRef<Listening | null>(null);

  async function send(answer: string) {
    const t = answer.trim();
    if (!t) return;
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
    <section className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3">
      <Label as="p">Something not here?</Label>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
        className="flex items-center gap-2"
      >
        <label htmlFor="add-something" className="sr-only">
          Something you love
        </label>
        <input
          id="add-something"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Mitski, the Dolly Parton's America podcast"
          maxLength={600}
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
        />
        <button
          type="button"
          onClick={dictate}
          aria-label={listening ? 'Stop listening' : 'Say it instead'}
          className={`grid size-10 flex-none cursor-pointer place-items-center rounded-full ${listening ? 'bg-accent text-accent-ink ring-4 ring-accent-soft' : 'border border-line bg-surface'}`}
        >
          <MicIcon className="size-4" />
        </button>
        <Button type="submit" disabled={busy || !text.trim()} className="px-3 py-2">
          {busy ? '…' : 'Add'}
        </Button>
      </form>
      {error && (
        <p role="status" className="text-sm text-warn">
          {error}
        </p>
      )}
      {reply && <Spoken text={reply} auto />}
    </section>
  );
}

const ACTIVITY_LABEL = { does: 'I do this', wants_to: 'Want to try', used_to: 'Used to' } as const;

function ActivitiesStep({ activities, onChange, onDone }: { activities: Activity[]; onChange: (a: Activity[]) => void; onDone: () => void }) {
  const [answered, setAnswered] = useState<Record<string, Activity['status'] | 'no'>>(() => Object.fromEntries(activities.map((a) => [a.name, a.status])));
  const [finished, setFinished] = useState(false);
  const [custom, setCustom] = useState('');

  function answer(card: ActivityCard, a: Activity['status'] | 'no') {
    setAnswered((m) => ({ ...m, [card.name]: a }));
    const rest = activities.filter((x) => x.name.toLowerCase() !== card.name.toLowerCase());
    onChange(a === 'no' ? rest : [...rest, { name: card.name, status: a, hobbyId: card.hobbyId ?? hobbyIdFor(card.name) }]);
  }

  return (
    <>
      <Voice className="text-[1.3rem]">What do you do with a free afternoon, or wish you did?</Voice>
      {!finished ? (
        <>
          <ActivityDeck answered={answered} onAnswer={answer} onDone={() => setFinished(true)} />
          <button type="button" onClick={() => setFinished(true)} className="cursor-pointer self-center text-sm font-bold text-accent">
            That&apos;s enough
          </button>
        </>
      ) : (
        <>
          {activities.length > 0 ? (
            <ul className="flex flex-wrap gap-1.5">
              {activities.map((a) => (
                <li key={a.name}>
                  <Chip tone={a.status === 'wants_to' ? 'echo' : 'accent'}>
                    {a.name}
                    <span className="text-[11px] opacity-80">{ACTIVITY_LABEL[a.status]}</span>
                  </Chip>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">Nothing yet. That&apos;s fine; Echo will suggest things to try.</p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const name = custom.trim().toLowerCase();
              if (!name) return;
              if (!activities.some((a) => a.name.toLowerCase() === name)) onChange([...activities, { name, status: 'wants_to', hobbyId: hobbyIdFor(name) }]);
              setCustom('');
            }}
            className="flex gap-2"
          >
            <label htmlFor="custom-activity" className="sr-only">
              Something else you want to try
            </label>
            <input
              id="custom-activity"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              placeholder="Something else you'd try, like salsa"
              maxLength={60}
              className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
            />
            <Button type="submit">Add</Button>
          </form>
        </>
      )}
      <div className="flex-1" />
      {finished && (
        <Button kind="primary" onClick={onDone}>
          Show me what to do
        </Button>
      )}
    </>
  );
}

'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeftIcon, ArrowRightIcon, MicIcon, PauseIcon, SendIcon } from '@/components/icons';
import { OPENING_LINE, type ChatMessage, type HeardTaste, type TurnResponse } from '@/lib/onboarding/types';
import { listenOnce, SpeechError, speak, speechSupport, stopSpeaking, warmUpVoices, type Listening } from '@/lib/speech/browser-speech';
import type { Activity, Preferences } from '@/lib/profile/types';
import { EMPTY_PREFERENCES, SAMPLE_AREA } from '@/lib/profile/types';
import { loadProfile, saveProfile } from '@/lib/store';
import { Review } from './review';
import { apiFetch } from '@/lib/supabase/browser';

type Mode = 'voice' | 'text';
type Phase = 'start' | 'speaking' | 'listening' | 'thinking' | 'paused' | 'review';

const STATUS_LABEL: Record<Phase, string> = {
  start: 'Ready',
  speaking: 'Echo is talking',
  listening: 'Listening',
  thinking: 'Thinking',
  paused: 'Paused',
  review: '',
};

export function OnboardingClient({ initialMode }: { initialMode: Mode }) {
  const router = useRouter();
  const [mode, setModeState] = useState<Mode>(initialMode);
  const [phase, setPhase] = useState<Phase>('start');
  const [messages, setMessagesState] = useState<ChatMessage[]>([]);
  const [heard, setHeardState] = useState<HeardTaste[]>([]);
  const [activities, setActivitiesState] = useState<Activity[]>([]);
  const [preferences, setPreferencesState] = useState<Preferences>(EMPTY_PREFERENCES);
  const [freshKeys, setFreshKeys] = useState<Set<string>>(new Set());
  const [interim, setInterim] = useState('');
  const [micReady, setMicReady] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Async voice loops read these instead of stale render values.
  const modeRef = useRef(mode);
  const messagesRef = useRef(messages);
  const heardRef = useRef(heard);
  const activitiesRef = useRef(activities);
  const preferencesRef = useRef(preferences);
  const activeRef = useRef(false);
  const listeningRef = useRef<Listening | null>(null);
  const emptyTriesRef = useRef(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const setMode = (m: Mode) => {
    modeRef.current = m;
    setModeState(m);
  };
  const setMessages = (next: ChatMessage[]) => {
    messagesRef.current = next;
    setMessagesState(next);
  };
  const setHeard = (next: HeardTaste[]) => {
    heardRef.current = next;
    setHeardState(next);
  };
  const setActivities = (next: Activity[]) => {
    activitiesRef.current = next;
    setActivitiesState(next);
  };
  const setPreferences = (next: Preferences) => {
    preferencesRef.current = next;
    setPreferencesState(next);
  };

  useEffect(() => {
    warmUpVoices();
    const s = speechSupport();
    if (initialMode === 'voice' && !s.listen) {
      setMode('text');
      setNotice("This browser can't listen, so let's type instead.");
    }
    return () => {
      activeRef.current = false;
      listeningRef.current?.cancel();
      stopSpeaking();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Typing needs no tap to start: show the first question right away.
  useEffect(() => {
    if (mode === 'text' && phase === 'start' && messagesRef.current.length === 0) {
      activeRef.current = true;
      setMessages([{ role: 'echo', text: OPENING_LINE }]);
      setPhase('listening');
    }
  }, [mode, phase]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }, [messages.length, interim, phase]);

  async function say(text: string) {
    if (modeRef.current !== 'voice' || !activeRef.current) return;
    setPhase('speaking');
    await speak(text);
  }

  async function listen() {
    if (!activeRef.current) return;
    setPhase('listening');
    if (modeRef.current === 'text') return;

    setInterim('');
    setMicReady(false);
    const l = listenOnce({ onInterim: setInterim, onReady: () => setMicReady(true) });
    listeningRef.current = l;
    let text = '';
    try {
      text = await l.result;
    } catch (err) {
      const code = err instanceof SpeechError ? err.code : 'unknown';
      if (code === 'not-allowed' || code === 'service-not-allowed' || code === 'unsupported') {
        setMode('text');
        setNotice('Microphone access is off, so you can type instead.');
        setPhase('listening');
      } else {
        setNotice("I couldn't hear you. Tap the mic to try again.");
        activeRef.current = false;
        setPhase('paused');
      }
      return;
    } finally {
      listeningRef.current = null;
      setMicReady(false);
    }
    if (!activeRef.current) return;

    if (!text) {
      emptyTriesRef.current += 1;
      if (emptyTriesRef.current < 2) return listen();
      emptyTriesRef.current = 0;
      setNotice("I didn't catch that. Tap the mic when you're ready.");
      activeRef.current = false;
      setPhase('paused');
      return;
    }
    emptyTriesRef.current = 0;
    setInterim('');
    await submit(text);
  }

  async function submit(text: string) {
    setNotice(null);
    setMessages([...messagesRef.current, { role: 'user', text }]);
    await runTurn();
  }

  async function runTurn() {
    setPhase('thinking');
    setError(null);
    let data: TurnResponse;
    try {
      const res = await apiFetch('/api/onboarding/turn', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          messages: messagesRef.current,
          heard: heardRef.current.map(({ name, type, status }) => ({ name, type, status })),
          activities: activitiesRef.current.map(({ name, status }) => ({ name, status })),
          preferences: preferencesRef.current,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "Echo couldn't respond just now. Try again.");
      data = body as TurnResponse;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Echo couldn't respond just now. Try again.");
      activeRef.current = false;
      setPhase('paused');
      return;
    }

    setMessages([...messagesRef.current, { role: 'echo', text: data.reply }]);
    const known = new Set(heardRef.current.map((h) => h.key));
    const added = data.added.filter((h) => !known.has(h.key));
    setHeard([...heardRef.current, ...added]);
    setFreshKeys(new Set(added.map((h) => h.key)));
    setActivities([...activitiesRef.current, ...(data.activities ?? [])]);
    const patch = data.preferences ?? {};
    setPreferences({
      ...preferencesRef.current,
      ...patch,
      notes: [...new Set([...preferencesRef.current.notes, ...(patch.notes ?? [])])],
    });

    await say(data.reply);
    if (!activeRef.current) return;
    if (data.done) {
      finish();
      return;
    }
    await listen();
  }

  async function begin() {
    activeRef.current = true;
    setNotice(null);
    setMessages([{ role: 'echo', text: OPENING_LINE }]);
    await say(OPENING_LINE);
    await listen();
  }

  function pause() {
    activeRef.current = false;
    listeningRef.current?.cancel();
    stopSpeaking();
    setInterim('');
    setPhase('paused');
  }

  async function resume() {
    activeRef.current = true;
    setNotice(null);
    const last = messagesRef.current.at(-1);
    // A failed request leaves the person's message unanswered: retry it.
    if (last?.role === 'user') return runTurn();
    await listen();
  }

  function switchToText() {
    pause();
    setMode('text');
    activeRef.current = true;
    if (messagesRef.current.length === 0) setPhase('start');
    else setPhase('listening');
  }

  function finish() {
    activeRef.current = false;
    listeningRef.current?.cancel();
    stopSpeaking();
    setInterim('');
    setPhase('review');
  }

  async function sendDraft(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) {
      setNotice('Type something you love first.');
      return;
    }
    if (phase === 'thinking') return;
    setDraft('');
    activeRef.current = true;
    await submit(text);
  }

  if (phase === 'review') {
    return (
      <Review
        heard={heard}
        onChange={setHeard}
        activities={activities}
        onActivitiesChange={setActivities}
        preferences={preferences}
        onPreferencesChange={setPreferences}
        onKeepTalking={() => {
          // Voice waits for a tap on Resume so the mic never starts unasked.
          activeRef.current = modeRef.current === 'text';
          setPhase(modeRef.current === 'text' ? 'listening' : 'paused');
        }}
        onBuild={(tastes) => {
          const previous = loadProfile();
          saveProfile({
            name: previous?.name,
            tastes,
            activities: activitiesRef.current,
            preferences: preferencesRef.current,
            area: previous?.area ?? SAMPLE_AREA,
          });
          router.push('/echo?build=1');
        }}
      />
    );
  }

  const busy = phase === 'thinking';

  return (
    <main className="flex min-h-0 flex-1 flex-col gap-3">
      <header className="flex items-center justify-between">
        <Link href="/" className="flex items-center gap-1.5 text-base font-bold" onClick={pause}>
          <ArrowLeftIcon className="size-[18px]" />
          {phase === 'start' ? 'Back' : mode === 'text' && phase === 'listening' ? 'Your turn' : STATUS_LABEL[phase]}
        </Link>
        {heard.length > 0 && <span className="text-xs text-faint">{heard.length} heard</span>}
      </header>

      {phase === 'start' && mode === 'voice' ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
          <h1 className="font-voice text-[1.75rem] leading-tight font-medium text-balance">Ready when you are</h1>
          <p className="max-w-[32ch] text-sm text-muted">
            Echo will ask a few questions out loud. Answer however you like.
          </p>
          <button
            type="button"
            onClick={begin}
            aria-label="Start the conversation"
            className="mt-6 grid size-[88px] cursor-pointer place-items-center rounded-full bg-accent text-accent-ink ring-[10px] ring-accent-soft transition-transform active:scale-95"
          >
            <MicIcon className="size-9" />
          </button>
          <p className="text-sm text-muted">Tap to start</p>
          <p className="mt-6 max-w-[34ch] text-xs text-faint">
            Your browser turns speech into text (Chrome uses Google, Safari uses Apple). Echo keeps only the names you mention.
          </p>
          <button type="button" onClick={switchToText} className="cursor-pointer text-sm font-bold text-accent">
            Type instead
          </button>
        </div>
      ) : (
        <>
          <section aria-label="Conversation" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto pb-2">
            {messages.map((m, i) =>
              m.role === 'echo' ? (
                <p key={i} className="font-voice text-[1.15rem] leading-snug">
                  {m.text}
                </p>
              ) : (
                <p key={i} className="max-w-[86%] self-end rounded-2xl rounded-br-sm bg-sunk px-3 py-2 text-[0.9rem]">
                  {m.text}
                </p>
              ),
            )}
            {interim && (
              <p className="max-w-[86%] self-end rounded-2xl rounded-br-sm border border-dashed border-line px-3 py-2 text-[0.9rem] text-muted">
                {interim}
              </p>
            )}
            {busy && <p className="text-sm text-faint" aria-live="polite">Echo is thinking…</p>}
            <div ref={bottomRef} />
          </section>

          {heard.length > 0 && (
            <section aria-label="Heard so far" className="flex flex-col gap-1.5">
              <h2 className="text-[11px] font-bold tracking-[0.08em] text-faint uppercase">Heard so far</h2>
              <ul className="flex flex-wrap gap-1.5">
                {heard.map((h) => (
                  <li
                    key={h.key}
                    className={`rounded-full border px-2.5 py-1 text-xs ${
                      freshKeys.has(h.key) ? 'border-transparent bg-echo-soft text-echo' : 'border-line bg-surface'
                    }`}
                  >
                    {h.entity?.name ?? h.name}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {(notice || error) && (
            <p role="status" className={`text-sm ${error ? 'text-warn' : 'text-muted'}`}>
              {error ?? notice}
            </p>
          )}

          {mode === 'voice' ? (
            <div className="flex flex-col gap-3">
              <p className="text-center text-sm font-bold" aria-live="polite">
                {phase === 'listening'
                  ? micReady
                    ? interim
                      ? 'Take your time. Tap Send when you’re done.'
                      : 'Go ahead, I’m listening'
                    : 'One sec…'
                  : phase === 'speaking'
                    ? 'Echo is talking'
                    : phase === 'thinking'
                      ? 'Thinking…'
                      : ''}
              </p>
              <Wave active={phase === 'listening' && micReady} />
              <div className="flex gap-2">
                {phase === 'paused' ? (
                  <button type="button" onClick={resume} className={btn('primary')}>
                    <MicIcon className="size-4" /> {error ? 'Try again' : 'Resume'}
                  </button>
                ) : (
                  <>
                    <button type="button" onClick={pause} className={btn()}>
                      <PauseIcon className="size-4" /> Pause
                    </button>
                    <button
                      type="button"
                      onClick={() => listeningRef.current?.stop()}
                      disabled={phase !== 'listening' || !interim}
                      className={btn('primary')}
                    >
                      <SendIcon className="size-4" /> Send
                    </button>
                  </>
                )}
              </div>
              <div className="flex justify-center gap-5 text-sm font-bold text-accent">
                <button type="button" onClick={switchToText} className="cursor-pointer">
                  Type instead
                </button>
                <button type="button" onClick={finish} className="cursor-pointer">
                  I&apos;m finished
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {error && (
                <button type="button" onClick={resume} className={btn()}>
                  Try again
                </button>
              )}
              <form onSubmit={sendDraft} className="flex gap-2">
                <label htmlFor="answer" className="sr-only">
                  Your answer
                </label>
                <input
                  id="answer"
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value);
                    if (notice) setNotice(null);
                  }}
                  placeholder="Severance, and Phoebe Bridgers on repeat"
                  autoComplete="off"
                  maxLength={600}
                  className="min-w-0 flex-1 rounded-2xl border border-line bg-surface px-3.5 py-3 text-[0.95rem] outline-none focus:border-accent"
                />
                <button type="submit" aria-label="Send" disabled={busy} className={`${btn('primary')} flex-none px-4`}>
                  <SendIcon className="size-4" />
                </button>
              </form>
              <button type="button" onClick={finish} className={btn()}>
                Done <ArrowRightIcon className="size-4" />
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}

function btn(kind?: 'primary') {
  const base =
    'inline-flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-2xl border px-3.5 py-3 text-sm font-bold transition-transform active:scale-[0.98] disabled:opacity-60';
  return kind === 'primary' ? `${base} border-accent bg-accent text-accent-ink` : `${base} border-line bg-surface text-ink`;
}

function Wave({ active }: { active: boolean }) {
  const heights = [12, 26, 38, 20, 40, 28, 14, 30, 18];
  return (
    <div className="flex h-10 items-center justify-center gap-1" aria-hidden="true">
      {heights.map((h, i) => (
        <span
          key={i}
          className={`block w-1 rounded-full bg-accent ${active ? 'animate-[wave_1.1s_ease-in-out_infinite]' : 'opacity-30'}`}
          style={{ height: active ? h : 6, animationDelay: `${(i % 3) * 0.15}s` }}
        />
      ))}
    </div>
  );
}

'use client';

// Browser speech: recognition (Web Speech API, Chrome and Safari) and
// synthesis. Free to use. Recognition audio is processed by the browser
// vendor (Google in Chrome, Apple in Safari); onboarding copy says so.

interface RecognitionResultList {
  length: number;
  [i: number]: { isFinal: boolean; 0: { transcript: string } };
}
interface RecognitionEvent {
  resultIndex: number;
  results: RecognitionResultList;
}
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
  onaudiostart: (() => void) | null;
}

function recognitionCtor(): (new () => Recognition) | undefined {
  if (typeof window === 'undefined') return undefined;
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

export function speechSupport(): { listen: boolean; speak: boolean } {
  return {
    listen: Boolean(recognitionCtor()),
    speak: typeof window !== 'undefined' && 'speechSynthesis' in window,
  };
}

export class SpeechError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

export interface Listening {
  /** Resolves with what was said (possibly empty) when the person stops talking. */
  result: Promise<string>;
  /** Stop listening and resolve with whatever was heard so far. */
  stop(): void;
  /** Stop listening and discard. */
  cancel(): void;
}

export interface ListenOptions {
  onInterim: (text: string) => void;
  /** Called once the microphone is actually capturing, so the UI can say "go ahead". */
  onReady?: () => void;
  /** Quiet time after speech before the turn ends. */
  silenceMs?: number;
  /** How long to wait for the person to start talking. */
  noSpeechMs?: number;
  /** Hard limit for one answer. */
  maxMs?: number;
}

// Words people trail off on while thinking. Ending on one of these means
// they're probably not finished, so wait longer.
const TRAILING_WORDS = new Set(['and', 'or', 'but', 'so', 'um', 'uh', 'umm', 'uhh', 'er', 'like', 'the', 'a', 'an', 'with', 'of', 'to', 'maybe', 'also', 'because']);

/** How long to wait after the latest words before ending the turn. */
export function silenceDelay(text: string, silenceMs = 2200): number {
  const words = text.toLowerCase().replace(/[^a-z' ]+/g, ' ').trim().split(/\s+/);
  const last = words[words.length - 1] ?? '';
  return TRAILING_WORDS.has(last) ? silenceMs + 1800 : silenceMs;
}

/**
 * Listens for one answer. The browser's own end-of-speech detection cuts
 * people off at the first short pause, so recognition runs continuously and
 * the turn ends after our own silence window instead.
 * Rejects with SpeechError for permission or hardware problems.
 */
export function listenOnce(opts: ListenOptions): Listening {
  const Ctor = recognitionCtor();
  if (!Ctor) {
    return { result: Promise.reject(new SpeechError('unsupported')), stop() {}, cancel() {} };
  }
  const silenceMs = opts.silenceMs ?? 2200;
  const noSpeechMs = opts.noSpeechMs ?? 12_000;
  const maxMs = opts.maxMs ?? 90_000;

  // Text from recognition sessions that already ended (the browser can end a
  // session on its own; we restart and keep what was said).
  let earlier = '';
  let current = '';
  let stopping = false;
  let cancelled = false;
  let ready = false;
  let restarts = 0;
  let silenceTimer: ReturnType<typeof setTimeout> | undefined;
  let rec: Recognition;

  const text = () => `${earlier} ${current}`.replace(/\s+/g, ' ').trim();

  let finish: (value: string) => void = () => {};
  let fail: (err: Error) => void = () => {};
  const result = new Promise<string>((resolve, reject) => {
    finish = resolve;
    fail = reject;
  });

  const maxTimer = setTimeout(() => stop(), maxMs);
  const cleanup = () => {
    clearTimeout(silenceTimer);
    clearTimeout(maxTimer);
  };

  function armSilence() {
    clearTimeout(silenceTimer);
    const heard = text();
    silenceTimer = setTimeout(() => stop(), heard ? silenceDelay(heard, silenceMs) : noSpeechMs);
  }

  function stop() {
    if (stopping) return;
    stopping = true;
    clearTimeout(silenceTimer);
    try {
      rec.stop();
    } catch {
      // Already stopped.
    }
  }

  function startSession() {
    rec = new Ctor!();
    rec.lang = 'en-US';
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    const markReady = () => {
      if (ready) return;
      ready = true;
      opts.onReady?.();
    };
    rec.onstart = markReady;
    rec.onaudiostart = markReady;

    rec.onresult = (e) => {
      let t = '';
      for (let i = 0; i < e.results.length; i++) t += e.results[i]![0].transcript;
      current = t;
      opts.onInterim(text());
      armSilence();
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return; // onend decides
      cleanup();
      fail(new SpeechError(e.error));
    };
    rec.onend = () => {
      earlier = text();
      current = '';
      // The browser ended the session on its own: keep listening.
      if (!stopping && !cancelled && restarts < 5) {
        restarts++;
        try {
          startSession();
          return;
        } catch {
          // Fall through and finish with what we have.
        }
      }
      cleanup();
      finish(cancelled ? '' : earlier);
    };
    rec.start();
  }

  try {
    startSession();
    armSilence();
  } catch {
    cleanup();
    return { result: Promise.reject(new SpeechError('start-failed')), stop() {}, cancel() {} };
  }

  return {
    result,
    stop,
    cancel: () => {
      cancelled = true;
      stopping = true;
      cleanup();
      try {
        rec.abort();
      } catch {
        finish('');
      }
    },
  };
}

const PREFERRED_VOICES = ['Samantha', 'Google US English', 'Microsoft Aria', 'Microsoft Jenny', 'Ava', 'Allison', 'Karen'];

function pickVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices();
  for (const name of PREFERRED_VOICES) {
    const v = voices.find((v) => v.name.includes(name) && v.lang.startsWith('en'));
    if (v) return v;
  }
  return voices.find((v) => v.lang === 'en-US') ?? voices.find((v) => v.lang.startsWith('en'));
}

/** Loads the voice list early; some browsers fill it in asynchronously. */
export function warmUpVoices() {
  if (!speechSupport().speak) return;
  window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener?.('voiceschanged', () => window.speechSynthesis.getVoices(), { once: true });
}

/** Speaks text and resolves when done. Never rejects; resolves early if speech is unavailable. */
export function speak(text: string): Promise<void> {
  if (!speechSupport().speak || !text.trim()) return Promise.resolve();
  const synth = window.speechSynthesis;
  synth.cancel();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const voice = pickVoice();
    if (voice) u.voice = voice;
    u.rate = 1.03;
    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(guard);
      resolve();
    };
    // Some browsers never fire onend; don't wait forever.
    const guard = setTimeout(finish, 2000 + text.length * 90);
    u.onend = finish;
    u.onerror = finish;
    synth.speak(u);
  });
}

export function stopSpeaking() {
  if (speechSupport().speak) window.speechSynthesis.cancel();
}

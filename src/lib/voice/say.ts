'use client';

import { speak as browserSpeak, stopSpeaking as stopBrowser } from '@/lib/speech/browser-speech';
import { apiFetch } from '@/lib/supabase/browser';

// Echo's spoken voice: neural speech from /api/voice/speak, or the browser's
// own voice when that's unavailable. One line plays at a time.

const clips = new Map<string, string>(); // text -> object URL, for this page session
let neuralOff = false;
let audio: HTMLAudioElement | null = null;
let current: string | null = null;
let run = 0;
const listeners = new Set<(text: string | null) => void>();

function setCurrent(text: string | null) {
  current = text;
  listeners.forEach((l) => l(text));
}

/** Calls back with the line being spoken, or null when quiet. */
export function onSpeaking(cb: (text: string | null) => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export const speakingNow = () => current;

type MS = typeof MediaSource;

/** MediaSource (or Safari's ManagedMediaSource) when it can play MP3 as it streams. */
function streamingSource(): MS | null {
  const w = window as unknown as { ManagedMediaSource?: MS; MediaSource?: MS };
  const Ctor = w.ManagedMediaSource ?? w.MediaSource;
  return Ctor && Ctor.isTypeSupported('audio/mpeg') ? Ctor : null;
}

/** A URL that plays the response while it downloads; the whole clip is cached when done. */
function streamUrl(Ctor: MS, res: Response, text: string): string {
  const ms = new Ctor();
  const url = URL.createObjectURL(ms);
  ms.addEventListener(
    'sourceopen',
    async () => {
      const sb = ms.addSourceBuffer('audio/mpeg');
      const reader = res.body!.getReader();
      const parts: Uint8Array[] = [];
      const append = (chunk: Uint8Array) =>
        new Promise<void>((resolve) => {
          sb.addEventListener('updateend', () => resolve(), { once: true });
          sb.appendBuffer(chunk as BufferSource);
        });
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          parts.push(value);
          await append(value);
        }
        ms.endOfStream();
        clips.set(text, URL.createObjectURL(new Blob(parts as BlobPart[], { type: 'audio/mpeg' })));
      } catch {
        // Stopped part way; the next play fetches it again.
      }
    },
    { once: true },
  );
  return url;
}

async function clipFor(text: string, stream = false): Promise<string | null> {
  const hit = clips.get(text);
  if (hit) return hit;
  if (neuralOff) return null;
  try {
    const res = await apiFetch('/api/voice/speak', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (res.status === 503) neuralOff = true; // Off or out of budget: don't keep asking this session.
    if (!res.ok) return null;
    const Ctor = stream && res.body ? streamingSource() : null;
    if (Ctor) return streamUrl(Ctor, res, text);
    const url = URL.createObjectURL(await res.blob());
    clips.set(text, url);
    return url;
  } catch {
    return null;
  }
}

/**
 * Splits a line into pieces to fetch separately: the first sentence alone so
 * it can start playing quickly, then the rest in a few larger chunks.
 */
export function speechChunks(text: string): string[] {
  const sentences = text.match(/[^.!?]+[.!?]+["')\]]*\s*|[^.!?]+$/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
  const [first, ...rest] = sentences;
  const chunks = [first!];
  let buf = '';
  for (const s of rest) {
    if (buf && buf.length + s.length > 220) {
      chunks.push(buf);
      buf = '';
    }
    buf = buf ? `${buf} ${s}` : s;
  }
  if (buf) chunks.push(buf);
  return chunks;
}

function play(url: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const a = new Audio();
    (a as HTMLAudioElement & { disableRemotePlayback: boolean }).disableRemotePlayback = true; // Required by Safari's ManagedMediaSource.
    a.src = url;
    audio = a;
    a.onended = () => resolve();
    a.onerror = () => resolve();
    a.onpause = () => resolve();
    a.play().catch(() => resolve()); // Autoplay blocked: stay quiet.
  });
}

/** Speaks a line and resolves when it ends or is interrupted. Never rejects. */
export async function say(raw: string): Promise<void> {
  const text = raw.replace(/\s+/g, ' ').trim().slice(0, 600);
  if (!text) return;
  hush();
  const mine = ++run;
  setCurrent(text);
  try {
    // Fetch every piece at once and play them in order. The first streams,
    // so it starts before it has finished downloading.
    const pieces = speechChunks(text);
    const clipsInOrder = pieces.map((p, i) => clipFor(p, i === 0));
    for (let i = 0; i < pieces.length; i++) {
      const url = await clipsInOrder[i]!;
      if (mine !== run) return; // Interrupted.
      if (url) await play(url);
      else {
        // Neural voice unavailable: say the rest with the browser's voice.
        await browserSpeak(pieces.slice(i).join(' '));
        break;
      }
      if (mine !== run) return;
    }
  } finally {
    if (mine === run) {
      audio = null;
      setCurrent(null);
    }
  }
}

export function hush() {
  run++;
  audio?.pause();
  audio = null;
  stopBrowser();
  if (current) setCurrent(null);
}

// "Talk to Echo and it talks back": after the person uses the mic, Echo reads
// its next replies aloud for a while.
const VOICE_MODE_KEY = 'echo:voice-mode';
const VOICE_MODE_MS = 15 * 60_000;

export function markSpokeToEcho() {
  try {
    sessionStorage.setItem(VOICE_MODE_KEY, String(Date.now()));
  } catch {
    // Storage blocked.
  }
}

export function inVoiceMode(): boolean {
  try {
    return Date.now() - Number(sessionStorage.getItem(VOICE_MODE_KEY) ?? 0) < VOICE_MODE_MS;
  } catch {
    return false;
  }
}

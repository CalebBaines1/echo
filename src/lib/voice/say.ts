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

async function clipFor(text: string): Promise<string | null> {
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
    const url = URL.createObjectURL(await res.blob());
    clips.set(text, url);
    return url;
  } catch {
    return null;
  }
}

/** Speaks a line and resolves when it ends or is interrupted. Never rejects. */
export async function say(raw: string): Promise<void> {
  const text = raw.replace(/\s+/g, ' ').trim().slice(0, 600);
  if (!text) return;
  hush();
  const mine = ++run;
  setCurrent(text);
  const url = await clipFor(text);
  if (mine !== run) return; // Interrupted while loading.
  try {
    if (url) {
      const a = new Audio(url);
      audio = a;
      await new Promise<void>((resolve) => {
        a.onended = () => resolve();
        a.onerror = () => resolve();
        a.onpause = () => resolve();
        a.play().catch(() => resolve()); // Autoplay blocked: stay quiet.
      });
    } else {
      await browserSpeak(text);
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

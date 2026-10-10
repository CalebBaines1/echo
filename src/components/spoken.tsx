'use client';

import { useEffect, useRef, useState } from 'react';
import { hush, inVoiceMode, onSpeaking, say, speakingNow } from '@/lib/voice/say';
import { PauseIcon, SpeakerIcon } from './icons';
import { Voice } from './ui';

const norm = (t: string | null | undefined) => t?.replace(/\s+/g, ' ').trim().slice(0, 600) ?? '';
const same = (a: string | null, b: string) => a !== null && norm(a) === norm(b);

/**
 * One of Echo's lines with a button to hear it. With `auto`, it plays by
 * itself when the person has been talking to Echo by voice.
 */
export function Spoken({ text, auto = false, className = '' }: { text: string; auto?: boolean; className?: string }) {
  const [playing, setPlaying] = useState(false);
  const spoke = useRef<string | null>(null);
  const latest = useRef(text);
  latest.current = text;

  useEffect(() => {
    setPlaying(same(speakingNow(), text));
    return onSpeaking((t) => setPlaying(same(t, text)));
  }, [text]);

  useEffect(() => {
    if (!auto || !text || spoke.current === text || !inVoiceMode()) return;
    spoke.current = text;
    void say(text);
  }, [auto, text]);

  // Stop talking when the line leaves the screen.
  useEffect(
    () => () => {
      if (same(speakingNow(), latest.current)) hush();
    },
    [],
  );

  return (
    <div className="flex items-start gap-2">
      <Voice className={`flex-1 ${className}`}>{text}</Voice>
      <button
        type="button"
        onClick={() => (playing ? hush() : void say(text))}
        aria-label={playing ? 'Stop' : 'Hear this'}
        className={`mt-0.5 grid size-8 flex-none cursor-pointer place-items-center rounded-full ${playing ? 'bg-accent text-accent-ink' : 'text-muted hover:bg-sunk'}`}
      >
        {playing ? <PauseIcon className="size-4" /> : <SpeakerIcon className="size-4" />}
      </button>
    </div>
  );
}

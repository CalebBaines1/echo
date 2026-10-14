'use client';

import { useEffect, useRef, useState } from 'react';
import { ACTIVITY_CARDS, type ActivityCard } from '@/data/picker';
import type { Activity } from '@/lib/profile/types';
import { CheckIcon, XIcon } from './icons';

type Answer = Activity['status'] | 'no';

// Photos come from Wikipedia's page summaries at view time; nothing is stored.
const photos = new Map<string, Promise<string | null>>();
function photoFor(card: ActivityCard): Promise<string | null> {
  let p = photos.get(card.wiki);
  if (!p) {
    p = fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(card.wiki)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { thumbnail?: { source?: string } } | null) => d?.thumbnail?.source?.replace(/\/\d+px-/, '/500px-') ?? null)
      .catch(() => null);
    photos.set(card.wiki, p);
  }
  return p;
}

function Photo({ card }: { card: ActivityCard }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    void photoFor(card).then((s) => live && setSrc(s));
    return () => {
      live = false;
    };
  }, [card]);
  if (!src || failed) return <div className="grid h-full w-full place-items-center bg-accent-soft text-6xl" aria-hidden="true">{card.emoji}</div>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setFailed(true)} className="h-full w-full object-cover" draggable={false} />;
}

const SWIPE_PX = 90;

/**
 * One activity at a time: swipe right (or tap the star) for "want to try",
 * left for "not for me", or tap "I do this". Answers go to `onAnswer`.
 */
export function ActivityDeck({ answered, onAnswer, onDone }: { answered: Record<string, Answer>; onAnswer: (card: ActivityCard, a: Answer) => void; onDone: () => void }) {
  const queue = ACTIVITY_CARDS.filter((c) => !(c.name in answered));
  const card = queue[0];
  const next = queue[1];
  const [dx, setDx] = useState(0);
  const [leaving, setLeaving] = useState<Answer | null>(null);
  const start = useRef<number | null>(null);

  // Warm the next photo so the deck never waits.
  useEffect(() => {
    if (next) void photoFor(next);
  }, [next]);

  useEffect(() => {
    if (!card) onDone();
  }, [card, onDone]);

  if (!card) return null;

  function answer(a: Answer) {
    if (leaving) return;
    setLeaving(a);
    setDx(a === 'wants_to' ? 480 : a === 'no' ? -480 : 0);
    setTimeout(() => {
      onAnswer(card!, a);
      setLeaving(null);
      setDx(0);
    }, 220);
  }

  const hint = dx > 30 ? 'Want to try' : dx < -30 ? 'Not for me' : null;
  const done = ACTIVITY_CARDS.length - queue.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative h-[340px] select-none">
        {next && (
          <div className="absolute inset-0 scale-[0.96] overflow-hidden rounded-3xl border border-line bg-surface opacity-70" aria-hidden="true">
            <div className="h-[230px]">
              <Photo card={next} />
            </div>
          </div>
        )}
        <div
          role="group"
          aria-label={`${card.name}: ${card.blurb}`}
          className={`absolute inset-0 touch-pan-y overflow-hidden rounded-3xl border border-line bg-surface shadow-sm ${start.current === null ? 'transition-transform duration-200' : ''} ${leaving === 'does' ? 'scale-95 opacity-0 transition-all' : ''}`}
          style={{ transform: `translateX(${dx}px) rotate(${dx / 25}deg)` }}
          onPointerDown={(e) => {
            start.current = e.clientX;
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          }}
          onPointerMove={(e) => start.current !== null && setDx(e.clientX - start.current)}
          onPointerUp={() => {
            const d = dx;
            start.current = null;
            if (d > SWIPE_PX) answer('wants_to');
            else if (d < -SWIPE_PX) answer('no');
            else setDx(0);
          }}
          onPointerCancel={() => {
            start.current = null;
            setDx(0);
          }}
        >
          <div className="pointer-events-none h-[230px]">
            <Photo card={card} />
          </div>
          {hint && (
            <span className={`absolute top-4 rounded-full px-3 py-1 text-sm font-bold ${dx > 0 ? 'left-4 bg-echo text-surface' : 'right-4 bg-warn text-surface'}`}>{hint}</span>
          )}
          <div className="flex flex-col gap-0.5 px-4 py-3">
            <p className="text-lg font-bold first-letter:uppercase">{card.name}</p>
            <p className="text-sm text-muted">{card.blurb}</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <button type="button" onClick={() => answer('no')} className="flex cursor-pointer flex-col items-center gap-1 rounded-2xl border border-line bg-surface py-2.5 text-xs font-semibold">
          <XIcon className="size-5 text-warn" />
          Not for me
        </button>
        <button type="button" onClick={() => answer('does')} className="flex cursor-pointer flex-col items-center gap-1 rounded-2xl border border-line bg-surface py-2.5 text-xs font-semibold">
          <CheckIcon className="size-5 text-accent" />I do this
        </button>
        <button type="button" onClick={() => answer('wants_to')} className="flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-echo bg-echo-soft py-2.5 text-xs font-bold text-echo">
          <span className="text-lg leading-5" aria-hidden="true">
            ★
          </span>
          Want to try
        </button>
      </div>
      <p className="text-center text-xs text-faint">
        {done + 1} of {ACTIVITY_CARDS.length} · swipe right to try it, left to skip
      </p>
    </div>
  );
}

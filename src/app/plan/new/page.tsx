'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { MicIcon } from '@/components/icons';
import { BackHeader, Button, Label, Voice } from '@/components/ui';
import { listenOnce, speechSupport, type Listening } from '@/lib/speech/browser-speech';

const DEFAULTS = {
  hobby: 'Find me a new hobby to try this weekend.',
  day: 'Plan me a slow, full Saturday.',
} as const;

export default function NewPlanPage() {
  const router = useRouter();
  const [request, setRequest] = useState('');
  const [listening, setListening] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const listenRef = useRef<Listening | null>(null);

  function go(mode: 'hobby' | 'day') {
    const q = request.trim() || DEFAULTS[mode];
    router.push(`/plan/run?mode=${mode}&q=${encodeURIComponent(q)}`);
  }

  async function dictate() {
    if (listening) {
      listenRef.current?.stop();
      return;
    }
    if (!speechSupport().listen) {
      setNotice("This browser can't listen. Type your request instead.");
      return;
    }
    setNotice(null);
    setListening(true);
    const l = listenOnce({ onInterim: setRequest });
    listenRef.current = l;
    try {
      const text = await l.result;
      if (text) setRequest(text);
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
      <Voice>What are you in the mood for? Say it however you like, or pick one below.</Voice>

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
          placeholder="Something to do on weekends that isn't screens. Under $40, not too far."
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

      <section className="flex flex-col gap-2">
        <Label>Just me</Label>
        <div className="grid grid-cols-2 gap-2">
          <Button kind="primary" onClick={() => go('hobby')}>
            Try a new hobby
          </Button>
          <Button onClick={() => go('day')}>Plan a full day</Button>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <Label>With friends</Label>
        <Button onClick={() => router.push('/friends')}>Plan with friends</Button>
      </section>
    </main>
  );
}

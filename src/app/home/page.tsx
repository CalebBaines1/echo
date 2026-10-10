'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Suspense, useRef, useState } from 'react';
import { AreaChip } from '@/components/area-chip';
import { MicIcon } from '@/components/icons';
import { OneThing, currentProposal } from '@/components/one-thing';
import { Card, Label, LinkButton, TabBar } from '@/components/ui';
import { runUrl } from '@/lib/plans/client';
import { countdown } from '@/lib/plans/run-mission';
import { formatTime, localDate } from '@/lib/plans/time';
import type { Plan } from '@/lib/plans/types';
import { defaultWhen, parseWhen, whenLabel } from '@/lib/plans/when';
import { listenOnce, speechSupport, type Listening } from '@/lib/speech/browser-speech';
import { loadPlans, loadProfile, useStored } from '@/lib/store';

/** Plans past their date that nobody has said anything about yet. */
function waitingCheckIn(p: Plan, today: string) {
  return !p.checkIn && !!p.date && p.date < today && (p.status !== 'proposed' || !p.proposal);
}

function nextHobbyStep(plans: Plan[], today: string) {
  for (const p of plans) {
    const i = p.hobbyWeeks?.findIndex((w) => !w.done) ?? -1;
    const w = i >= 0 ? p.hobbyWeeks![i]! : undefined;
    if (w && (!w.date || w.date >= today)) return { plan: p, week: w, index: i };
  }
  return undefined;
}

function Home() {
  const router = useRouter();
  const profile = useStored(loadProfile);
  const plans = useStored(loadPlans);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const listenRef = useRef<Listening | null>(null);

  if (profile === undefined || plans === undefined) return null;
  if (!profile) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <h1 className="font-voice text-2xl font-medium">Let&apos;s start with what you love</h1>
        <LinkButton href="/onboarding" kind="primary">
          Start
        </LinkButton>
      </main>
    );
  }

  const today = localDate(new Date());
  const proposal = currentProposal(plans);
  const checkIns = plans.filter((p) => waitingCheckIn(p, today)).slice(0, 3);
  const upcoming = plans.filter((p) => p.id !== proposal?.id && p.status === 'approved' && p.date && p.date >= today).sort((a, b) => a.date!.localeCompare(b.date!));
  const hobby = nextHobbyStep(plans, today);
  const shownIds = new Set([proposal?.id, ...checkIns.map((p) => p.id), ...upcoming.map((p) => p.id)]);
  const earlier = plans.filter((p) => !shownIds.has(p.id) && !(p.proposal && p.status === 'proposed')).slice(0, 5);

  async function speak() {
    if (listening) return listenRef.current?.stop();
    if (!speechSupport().listen) return router.push('/plan/new');
    setNotice(null);
    setListening(true);
    const l = listenOnce({ onInterim: setHeard });
    listenRef.current = l;
    try {
      const text = (await l.result).trim();
      if (text) router.push(runUrl({ request: text, mode: 'hobby', when: parseWhen(text) ?? defaultWhen('hobby') }));
      else setNotice("I didn't catch that. Tap the mic and try again.");
    } catch {
      setNotice("Couldn't use the microphone. Tap the bar to type instead.");
    } finally {
      setListening(false);
      setHeard('');
      listenRef.current = null;
    }
  }

  return (
    <main className="flex flex-1 flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <h1 className="font-voice text-[1.75rem] leading-tight font-medium">{profile.name ? `Hi ${profile.name}` : 'Hi there'}</h1>
        <AreaChip area={profile.area} />
      </div>

      <div className="flex items-center gap-2 rounded-full border border-line bg-sunk py-1.5 pr-3.5 pl-1.5">
        <button
          type="button"
          onClick={speak}
          aria-label={listening ? 'Stop listening' : 'Say what you want to do'}
          className={`grid size-9 flex-none cursor-pointer place-items-center rounded-full bg-accent text-accent-ink ${listening ? 'ring-4 ring-accent-soft' : ''}`}
        >
          <MicIcon className="size-4" />
        </button>
        <Link href="/plan/new" className="min-w-0 flex-1 truncate text-[0.9rem] text-muted">
          {listening ? heard || 'Listening…' : '“Pottery Tuesday evening”'}
        </Link>
      </div>
      {notice && (
        <p role="status" className="text-sm text-warn">
          {notice}
        </p>
      )}

      <OneThing plans={plans} />

      {(checkIns.length > 0 || upcoming.length > 0 || hobby) && (
        <section className="flex flex-col gap-2">
          <Label>Up next</Label>
          {checkIns.map((p) => (
            <Link key={p.id} href={`/plan/${p.id}/checkin`}>
              <Card className="border-accent">
                <p className="text-[0.9rem] font-bold">Did you go to {p.stops[0]?.name ?? p.title}?</p>
                <p className="text-sm text-muted">Tell Echo how it went</p>
              </Card>
            </Link>
          ))}
          {upcoming.map((p) => (
            <Link key={p.id} href={`/plan/${p.id}`}>
              <Card>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[0.9rem] font-bold">{p.stops[0]?.name ?? p.title}</p>
                  <span className="flex-none text-xs font-bold text-echo">{countdown(p.date!)}</span>
                </div>
                <p className="text-sm text-muted">
                  {whenLabel({ date: p.date!, part: p.part ?? 'any' })}
                  {p.stops[0]?.time ? `, ${formatTime(p.stops[0].time)}` : ''}
                </p>
              </Card>
            </Link>
          ))}
          {hobby && (
            <Link href={`/plan/${hobby.plan.id}/hobby`}>
              <Card>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[0.9rem] font-bold">{hobby.week.title}</p>
                  {hobby.week.date && <span className="flex-none text-xs font-bold text-echo">{countdown(hobby.week.date)}</span>}
                </div>
                <p className="text-sm text-muted">
                  {hobby.plan.title} · step {hobby.index + 1} of {hobby.plan.hobbyWeeks!.length}
                </p>
              </Card>
            </Link>
          )}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <Label>Start a plan</Label>
        <div className="grid grid-cols-2 gap-2">
          <Link href="/plan/new">
            <Card className="h-full">
              <p className="text-[0.9rem] font-bold">Just me</p>
              <p className="text-sm text-muted">Hobbies, solo days</p>
            </Card>
          </Link>
          <Link href="/friends">
            <Card className="h-full">
              <p className="text-[0.9rem] font-bold">With friends</p>
              <p className="text-sm text-muted">Your Echos plan together</p>
            </Card>
          </Link>
        </div>
      </section>

      {earlier.length > 0 && (
        <details>
          <summary className="cursor-pointer text-[11px] font-bold tracking-[0.08em] text-faint uppercase">Earlier plans</summary>
          <ul className="mt-2 flex flex-col gap-1.5">
            {earlier.map((p) => (
              <li key={p.id}>
                <Link href={`/plan/${p.id}`} className="flex items-center justify-between gap-2 rounded-xl border border-line px-3 py-2 text-[0.85rem]">
                  <span className="truncate">{p.title}</span>
                  <span className="flex-none text-xs text-faint">{p.checkIn ? 'Done' : p.status === 'approved' ? 'In' : 'Idea'}</span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}
      <TabBar current="/home" />
    </main>
  );
}

export default function HomePage() {
  return (
    <Suspense>
      <Home />
    </Suspense>
  );
}

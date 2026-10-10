'use client';

import Link from 'next/link';
import { MicIcon } from '@/components/icons';
import { Card, Label, LinkButton, TabBar } from '@/components/ui';
import { formatDate, localDate } from '@/lib/plans/time';
import type { Plan } from '@/lib/plans/types';
import { loadPlans, loadProfile, useStored } from '@/lib/store';

function needsCheckIn(p: Plan, today: string) {
  return p.status === 'approved' && !p.checkIn && !!p.date && p.date < today;
}

export default function HomePage() {
  const profile = useStored(loadProfile);
  const plans = useStored(loadPlans);
  if (profile === undefined || plans === undefined) return null;

  if (!profile) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <h1 className="font-voice text-2xl font-medium">Let&apos;s start with what you love</h1>
        <LinkButton href="/onboarding" kind="primary">
          Tell Echo what you love
        </LinkButton>
      </main>
    );
  }

  const today = localDate(new Date());
  const checkIns = plans.filter((p) => needsCheckIn(p, today));
  const recent = plans.filter((p) => !needsCheckIn(p, today)).slice(0, 4);

  return (
    <main className="flex flex-1 flex-col gap-3">
      <h1 className="font-voice text-[1.75rem] leading-tight font-medium">{profile.name ? `Hi ${profile.name}` : 'Hi there'}</h1>

      <Link
        href="/plan/new"
        className="flex items-center gap-3 rounded-full border border-line bg-sunk px-3.5 py-2.5 text-[0.9rem] text-muted"
      >
        <span className="grid size-8 flex-none place-items-center rounded-full bg-accent text-accent-ink">
          <MicIcon className="size-4" />
        </span>
        &ldquo;Plan me a Saturday&rdquo;
      </Link>

      {checkIns.length > 0 && (
        <section className="flex flex-col gap-2">
          <Label>Waiting on you</Label>
          {checkIns.map((p) => (
            <Link key={p.id} href={`/plan/${p.id}/checkin`}>
              <Card>
                <p className="text-[0.9rem] font-bold">How was {p.stops[0]?.name ?? p.title}?</p>
                <p className="text-sm text-muted">Echo wants to hear how it went</p>
              </Card>
            </Link>
          ))}
        </section>
      )}

      <section className="flex flex-col gap-2">
        <Label>Start a plan</Label>
        <div className="grid grid-cols-2 gap-2">
          <Link href="/plan/new?who=me">
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

      {recent.length > 0 && (
        <section className="flex flex-col gap-2">
          <Label>Your plans</Label>
          {recent.map((p) => {
            const weeksDone = p.hobbyWeeks?.filter((w) => w.done).length ?? 0;
            return (
              <Link key={p.id} href={p.hobbyWeeks ? `/plan/${p.id}/hobby` : `/plan/${p.id}`}>
                <Card>
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[0.9rem] font-bold">{p.title}</p>
                    <span className="flex-none text-xs text-faint">
                      {p.hobbyWeeks
                        ? `Step ${Math.min(weeksDone + 1, p.hobbyWeeks.length)} of ${p.hobbyWeeks.length}`
                        : p.status === 'approved'
                          ? 'Approved'
                          : 'Proposed'}
                    </span>
                  </div>
                  <p className="text-sm text-muted">
                    {p.date ? formatDate(p.date) : ''}
                    {p.stops[0] ? ` · ${p.stops.map((s) => s.name).join(', ')}` : ''}
                  </p>
                </Card>
              </Link>
            );
          })}
        </section>
      )}

      <p className="text-xs text-faint">Planning near {profile.area.label}.</p>
      <TabBar current="/home" />
    </main>
  );
}

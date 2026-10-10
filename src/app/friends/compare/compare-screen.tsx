'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { BackHeader, Button, Card, Chip, Label, LinkButton, Spinner } from '@/components/ui';
import { initials, loadFriends } from '@/lib/friends';
import type { GroupComparison, Person } from '@/lib/plans/group';
import { friendAsPerson, YOU_ID, youAsPerson } from '@/lib/plans/people';
import { loadProfile } from '@/lib/store';
import { apiFetch } from '@/lib/supabase/browser';

const AVATAR = ['bg-accent-soft text-accent-text', 'bg-friend-soft text-friend', 'bg-echo-soft text-echo'];

export function CompareScreen() {
  const params = useSearchParams();
  const ids = (params.get('ids') ?? '').split(',').filter(Boolean);
  const [people, setPeople] = useState<Person[]>([]);
  const [result, setResult] = useState<GroupComparison | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const started = useRef(-1);

  useEffect(() => {
    if (started.current === attempt) return;
    started.current = attempt;
    const profile = loadProfile();
    const friends = loadFriends().filter((f) => ids.includes(f.id));
    if (!profile || friends.length === 0) {
      setError('Pick friends to compare first.');
      return;
    }
    const group = [youAsPerson(profile), ...friends.map(friendAsPerson)];
    setPeople(group);
    setError(null);
    (async () => {
      try {
        const res = await apiFetch('/api/group/compare', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ people: group }),
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.error ?? "Echo couldn't compare tastes just now.");
        setResult(body as GroupComparison);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Echo couldn't compare tastes just now.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt]);

  const names = people.map((p) => (p.id === YOU_ID ? 'you' : p.name));
  const title = names.length ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`.replace(/^you/, 'You') : 'Compare';

  return (
    <main className="flex flex-1 flex-col gap-3">
      <BackHeader href="/friends">{title}</BackHeader>
      {people.length > 0 && (
        <div className="flex justify-center">
          {people.map((p, i) => (
            <span
              key={p.id}
              className={`-ml-2.5 grid size-11 place-items-center rounded-full border-[3px] border-bg text-xs font-bold first:ml-0 ${AVATAR[i % AVATAR.length]}`}
            >
              {p.id === YOU_ID ? 'You' : initials(p.name)}
            </span>
          ))}
        </div>
      )}

      {!result && !error && <Spinner label="Comparing tastes…" />}
      {error && (
        <div className="flex flex-col gap-2">
          <p role="status" className="text-sm text-warn">
            {error}
          </p>
          <Button onClick={() => setAttempt((a) => a + 1)}>Try again</Button>
        </div>
      )}

      {result && (
        <>
          {result.shared.length > 0 && (
            <section className="flex flex-col gap-2">
              <Label>Shared ground</Label>
              <div className="flex flex-wrap gap-1.5">
                {result.shared.map((t) => (
                  <Chip key={t}>{t}</Chip>
                ))}
              </div>
            </section>
          )}
          <section className="flex flex-col gap-2">
            <Label>Where you differ</Label>
            {result.differences.map((d) => {
              const person = people.find((p) => p.id === d.personId);
              return (
                <Card key={d.personId}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[0.9rem] font-bold">{person?.id === YOU_ID ? 'You' : person?.name}</span>
                    <span className="text-right text-sm text-muted">{d.tags.join(', ') || 'Nothing stands out'}</span>
                  </div>
                </Card>
              );
            })}
          </section>
          {result.picks.length > 0 && (
            <section className="flex flex-col gap-2">
              <Label>You&apos;d all like</Label>
              {result.picks.map((p) => (
                <Card key={p.id}>
                  <p className="text-[0.9rem] font-bold">
                    {p.name}
                    {p.year && <span className="ml-1.5 text-xs font-normal text-faint">{p.year}</span>}
                  </p>
                </Card>
              ))}
            </section>
          )}
          <div className="flex-1" />
          <LinkButton href={`/friends/plan?ids=${ids.join(',')}`} kind="primary">
            Let our Echos plan Saturday
          </LinkButton>
        </>
      )}
    </main>
  );
}

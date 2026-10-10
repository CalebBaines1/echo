'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { CheckIcon } from '@/components/icons';
import { DevTools } from '@/components/dev-tools';
import { GuestFriendForm } from '@/components/guest-friend';
import { InviteCard } from '@/components/invite-card';
import { Button, Label, LinkButton, TabBar, Voice } from '@/components/ui';
import { WhenChip } from '@/components/when-picker';
import { initials, loadFriends, mergeServerFriends, removeFriend, type Friend } from '@/lib/friends';
import { defaultWhen, parseWhen, type When } from '@/lib/plans/when';
import { fetchFriends } from '@/lib/sync';
import { loadProfile, useStored } from '@/lib/store';

export default function FriendsPage() {
  const router = useRouter();
  const profile = useStored(loadProfile);
  const friends = useStored(loadFriends);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [request, setRequest] = useState('');
  const [override, setOverride] = useState<When | null>(null);
  const seen = useRef<Set<string>>(new Set());

  // New friends start selected; ones you've turned off stay off.
  useEffect(() => {
    if (!friends) return;
    const fresh = friends.filter((f) => !seen.current.has(f.id));
    fresh.forEach((f) => seen.current.add(f.id));
    if (fresh.length) setSelected((s) => new Set([...s, ...fresh.map((f) => f.id)]));
  }, [friends]);

  // Pick up friends who joined since the page loaded.
  useEffect(() => {
    void fetchFriends().then((server) => server && mergeServerFriends(server));
  }, []);

  if (profile === undefined || friends === undefined) return null;
  if (!profile) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted">Build your echo first, then bring friends in.</p>
        <LinkButton href="/onboarding" kind="primary">
          Tell Echo what you love
        </LinkButton>
      </main>
    );
  }

  function toggle(f: Friend) {
    setError(null);
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(f.id)) next.delete(f.id);
      else next.add(f.id);
      return next;
    });
  }

  const when = override ?? parseWhen(request) ?? defaultWhen('group');
  const ids = [...selected].filter((id) => friends.some((f) => f.id === id));

  function go(path: 'compare' | 'plan') {
    if (ids.length === 0) return setError('Pick at least one friend.');
    const q = new URLSearchParams({ ids: ids.join(','), date: when.date, part: when.part });
    if (request.trim()) q.set('q', request.trim());
    router.push(`/friends/${path}?${q}`);
  }

  return (
    <main className="flex flex-1 flex-col gap-3">
      <h1 className="text-lg font-bold">With friends</h1>
      <Voice>Who&apos;s coming, and what do you feel like? Your Echos work out something that suits everyone.</Voice>

      {friends.length > 0 ? (
        <section className="flex flex-col gap-2">
          <Label>Who&apos;s coming</Label>
          {friends.map((f) => {
            const on = selected.has(f.id);
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => toggle(f)}
                aria-pressed={on}
                className={`flex cursor-pointer items-center gap-3 rounded-2xl border bg-surface p-3 text-left ${on ? 'border-2 border-accent p-[11px]' : 'border-line'}`}
              >
                <span className="grid size-9 flex-none place-items-center rounded-full bg-friend-soft text-xs font-bold text-friend">{initials(f.name)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[0.9rem] font-bold">{f.name}</span>
                  <span className="block truncate text-sm text-muted">
                    {f.guest ? `No echo · loves ${f.loves?.join(', ')}` : `${f.tastes.length} tastes${f.sample ? ' · sample friend' : ''}`}
                  </span>
                </span>
                <CheckIcon className={`size-5 ${on ? 'text-accent' : 'text-transparent'}`} />
              </button>
            );
          })}
        </section>
      ) : (
        <div className="rounded-2xl border border-dashed border-line px-4 py-5 text-center text-sm text-muted">
          No friends yet. Add someone below, or send an invite so they can build their own echo.
        </div>
      )}

      {adding ? (
        <GuestFriendForm
          onAdded={() => {
            setAdding(false);
            setError(null);
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => setAdding(true)} className="cursor-pointer rounded-full border border-line bg-surface px-3 py-1.5 text-sm font-semibold">
            + Someone without Echo
          </button>
          {friends
            .filter((f) => f.guest)
            .map((f) => (
              <button key={f.id} type="button" onClick={() => removeFriend(f.id)} className="cursor-pointer rounded-full px-2 py-1.5 text-xs text-faint">
                Remove {f.name}
              </button>
            ))}
        </div>
      )}

      {friends.length > 0 && (
        <section className="flex flex-col gap-2">
          <Label as="p">What should we do?</Label>
          <label htmlFor="group-request" className="sr-only">
            What should we do?
          </label>
          <textarea
            id="group-request"
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            rows={2}
            maxLength={300}
            placeholder="Something low-key Friday night, maybe records then food"
            className="resize-none rounded-2xl border border-line bg-surface px-3.5 py-3 text-[0.95rem] outline-none focus:border-accent"
          />
          <WhenChip when={when} onChange={setOverride} auto={!override} />
        </section>
      )}

      {error && (
        <p role="status" className="text-sm text-warn">
          {error}
        </p>
      )}
      {friends.length > 0 && (
        <div className="grid grid-cols-[1fr_2fr] gap-2">
          <Button onClick={() => go('compare')}>Compare tastes</Button>
          <Button kind="primary" onClick={() => go('plan')}>
            Plan it together
          </Button>
        </div>
      )}

      <InviteCard />
      <DevTools />
      <TabBar current="/friends" />
    </main>
  );
}

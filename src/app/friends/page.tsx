'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CheckIcon } from '@/components/icons';
import { DevTools } from '@/components/dev-tools';
import { InviteCard } from '@/components/invite-card';
import { Button, Label, LinkButton, TabBar, Voice } from '@/components/ui';
import { initials, loadFriends, mergeServerFriends, type Friend } from '@/lib/friends';
import { fetchFriends } from '@/lib/sync';
import { loadProfile, useStored } from '@/lib/store';

export default function FriendsPage() {
  const router = useRouter();
  const profile = useStored(loadProfile);
  const friends = useStored(loadFriends);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (friends) setSelected(new Set(friends.map((f) => f.id)));
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

  function compare() {
    if (selected.size === 0) return setError('Pick at least one friend.');
    router.push(`/friends/compare?ids=${[...selected].join(',')}`);
  }

  return (
    <main className="flex flex-1 flex-col gap-3">
      <h1 className="text-lg font-bold">With friends</h1>
      <Voice>Who&apos;s coming? Your Echos compare tastes, then plan something that works for everyone.</Voice>

      {friends.length > 0 ? (
        <section className="flex flex-col gap-2">
          <Label>Friends with an echo</Label>
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
                <span className="flex-1">
                  <span className="block text-[0.9rem] font-bold">{f.name}</span>
                  <span className="block text-sm text-muted">
                    {f.tastes.length} tastes{f.sample ? ' · sample friend' : ''}
                  </span>
                </span>
                <CheckIcon className={`size-5 ${on ? 'text-accent' : 'text-transparent'}`} />
              </button>
            );
          })}
        </section>
      ) : (
        <div className="rounded-2xl border border-dashed border-line px-4 py-5 text-center text-sm text-muted">
          No friends yet. Send an invite link, and they&apos;ll show up here once they&apos;ve joined.
        </div>
      )}

      <InviteCard />

      {error && (
        <p role="status" className="text-sm text-warn">
          {error}
        </p>
      )}
      {friends.length > 0 && (
        <Button kind="primary" onClick={compare}>
          Compare our tastes
        </Button>
      )}
      <DevTools />
      <TabBar current="/friends" />
    </main>
  );
}

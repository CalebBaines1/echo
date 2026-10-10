'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, LinkButton, Voice } from '@/components/ui';
import { mergeServerFriends } from '@/lib/friends';
import { setPendingInvite } from '@/lib/invites';
import { loadProfile, saveProfile, useStored } from '@/lib/store';
import { supabaseConfigured } from '@/lib/supabase/config';
import { fetchFriends, joinInvite } from '@/lib/sync';

export default function JoinPage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const profile = useStored(loadProfile);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.name) setName(profile.name);
  }, [profile?.name]);

  useEffect(() => {
    if (profile === null) setPendingInvite(token);
  }, [profile, token]);

  if (profile === undefined) return null;

  if (!supabaseConfigured()) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-muted">Invites need the database, which isn&apos;t set up in this environment.</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <main className="flex flex-1 flex-col justify-center gap-4">
        <h1 className="font-voice text-[1.75rem] leading-tight font-medium">You&apos;re invited to plan together</h1>
        <Voice>First, tap a few things you love so Echo knows your taste. Then you&apos;ll join your friend.</Voice>
        <LinkButton href="/onboarding" kind="primary">
          Start
        </LinkButton>
      </main>
    );
  }

  async function join(e: React.FormEvent) {
    e.preventDefault();
    const display = name.trim();
    if (!display) return setError('Add your name so your friend knows it’s you.');
    setBusy(true);
    setError(null);
    try {
      await joinInvite(token, display);
      if (profile && profile.name !== display) saveProfile({ ...profile, name: display });
      setPendingInvite(null);
      const friends = await fetchFriends();
      if (friends) mergeServerFriends(friends);
      router.push('/friends');
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't join. Try again.");
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 flex-col justify-center gap-4">
      <h1 className="font-voice text-[1.75rem] leading-tight font-medium">Join your friend on Echo</h1>
      <p className="text-sm text-muted">
        You&apos;ll see each other&apos;s tastes so your Echos can plan together. Your preferences, location, and plans stay private.
      </p>
      <form onSubmit={join} className="flex flex-col gap-2">
        <label htmlFor="name" className="text-sm font-bold">
          Your name
        </label>
        <input
          id="name"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError(null);
          }}
          maxLength={60}
          autoComplete="given-name"
          className="rounded-2xl border border-line bg-surface px-3.5 py-3 text-[0.95rem] outline-none focus:border-accent"
        />
        {error && (
          <p role="status" className="text-sm text-warn">
            {error}
          </p>
        )}
        <Button kind="primary" type="submit" disabled={busy}>
          {busy ? 'Joining…' : 'Join'}
        </Button>
      </form>
    </main>
  );
}

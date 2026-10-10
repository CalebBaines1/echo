'use client';

import { useState } from 'react';
import { loadProfile, saveProfile } from '@/lib/store';
import { supabaseConfigured } from '@/lib/supabase/config';
import { createInvite } from '@/lib/sync';
import { Button } from './ui';

/** Creates a group invite link to share with friends. */
export function InviteCard() {
  const [name, setName] = useState(() => (typeof window === 'undefined' ? '' : (loadProfile()?.name ?? '')));
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!supabaseConfigured()) {
    return (
      <div className="rounded-2xl border border-line bg-surface px-3.5 py-3">
        <p className="text-[0.9rem] font-bold">Invite with a link</p>
        <p className="text-sm text-muted">Invites need the database, which isn&apos;t set up in this environment.</p>
      </div>
    );
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const display = name.trim();
    if (!display) return setMessage('Add your name so friends know who invited them.');
    setBusy(true);
    setMessage(null);
    try {
      const profile = loadProfile();
      if (profile && profile.name !== display) saveProfile({ ...profile, name: display });
      setLink(await createInvite(display));
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Couldn't create an invite. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!link) return;
    const text = `Let's plan something together on Echo: ${link}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(link);
        setMessage('Link copied.');
      }
    } catch {
      // Share sheet dismissed.
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface px-3.5 py-3">
      <p className="text-[0.9rem] font-bold">Invite with a link</p>
      <p className="text-sm text-muted">
        Friends do a two-minute chat without signing up. You&apos;ll see each other&apos;s tastes for planning; preferences, location, and plans stay private.
      </p>
      {link ? (
        <>
          <p className="truncate rounded-xl bg-sunk px-3 py-2 font-mono text-xs" title={link}>
            {link}
          </p>
          <Button kind="primary" onClick={share}>
            Share link
          </Button>
        </>
      ) : (
        <form onSubmit={create} className="flex gap-2">
          <label htmlFor="your-name" className="sr-only">
            Your name
          </label>
          <input
            id="your-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (message) setMessage(null);
            }}
            maxLength={60}
            placeholder="Your name"
            autoComplete="given-name"
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
          <Button type="submit" disabled={busy}>
            {busy ? 'Creating…' : 'Create link'}
          </Button>
        </form>
      )}
      {message && (
        <p role="status" className="text-sm text-muted">
          {message}
        </p>
      )}
    </div>
  );
}

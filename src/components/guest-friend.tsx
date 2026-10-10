'use client';

import { useState } from 'react';
import type { HeardTaste } from '@/lib/onboarding/types';
import { loadFriends, saveFriends } from '@/lib/friends';
import { newId } from '@/lib/store';
import { apiFetch } from '@/lib/supabase/browser';
import { Button, Label } from './ui';

/**
 * Adds a friend who has no echo: a name and three or four things they love.
 * Each is matched to Qloo where possible; unmatched ones still reach the
 * planner as words.
 */
export function GuestFriendForm({ onAdded, onCancel }: { onAdded: (id: string) => void; onCancel: () => void }) {
  const [name, setName] = useState('');
  const [loves, setLoves] = useState(['', '', '', '']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    const things = [...new Set(loves.map((l) => l.trim()).filter(Boolean))];
    if (!n) return setError('Add their name.');
    if (things.length < 2) return setError('Add at least two things they love.');
    setBusy(true);
    setError(null);
    const tastes = await Promise.all(
      things.map(async (thing): Promise<HeardTaste | null> => {
        try {
          const res = await apiFetch('/api/onboarding/resolve', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name: thing }),
          });
          return res.ok ? ((await res.json()) as HeardTaste) : null;
        } catch {
          return null;
        }
      }),
    );
    const id = `guest-${newId()}`;
    saveFriends([...loadFriends(), { id, name: n, guest: true, loves: things, tastes: tastes.filter((t): t is HeardTaste => !!t) }]);
    setBusy(false);
    onAdded(id);
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3">
      <Label as="p">Someone without Echo</Label>
      <label htmlFor="guest-name" className="sr-only">
        Their name
      </label>
      <input
        id="guest-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Their name"
        maxLength={60}
        className="rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
      />
      <p className="text-sm text-muted">Three or four things they love: shows, music, books, things they do.</p>
      <div className="grid grid-cols-2 gap-2">
        {loves.map((l, i) => (
          <input
            key={i}
            aria-label={`Thing they love ${i + 1}`}
            value={l}
            onChange={(e) => setLoves((all) => all.map((x, j) => (j === i ? e.target.value : x)))}
            placeholder={['Taylor Swift', 'The Bear', 'Climbing', 'Dune'][i]}
            maxLength={80}
            className="min-w-0 rounded-xl border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent"
          />
        ))}
      </div>
      {error && (
        <p role="status" className="text-sm text-warn">
          {error}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Button type="button" onClick={onCancel}>
          Cancel
        </Button>
        <Button kind="primary" type="submit" disabled={busy}>
          {busy ? 'Adding…' : 'Add'}
        </Button>
      </div>
    </form>
  );
}

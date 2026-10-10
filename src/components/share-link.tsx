'use client';

import { useEffect, useState } from 'react';
import type { Plan } from '@/lib/plans/types';
import { loadProfile, saveProfile } from '@/lib/store';
import { supabaseConfigured } from '@/lib/supabase/config';
import { getSharedPlan, sharePlan, type SharedPlanView } from '@/lib/sync';
import { CheckIcon, XIcon } from './icons';
import { Button } from './ui';

/** Creates a link friends can open to see the plan and say whether they're in, and shows their answers. */
export function ShareLink({ plan, onShared }: { plan: Plan; onShared: (token: string) => void }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [view, setView] = useState<SharedPlanView | null>(null);
  const token = plan.share?.token;

  useEffect(() => {
    setName(loadProfile()?.name ?? '');
  }, []);

  useEffect(() => {
    if (!token) return;
    void getSharedPlan(token)
      .then(setView)
      .catch(() => setView(null));
  }, [token]);

  if (!supabaseConfigured()) return null;

  const url = token && typeof window !== 'undefined' ? `${window.location.origin}/p/${token}` : null;

  async function create(e: React.FormEvent) {
    e.preventDefault();
    const display = name.trim();
    if (!display) return setMessage('Add your name so friends know who sent it.');
    setBusy(true);
    setMessage(null);
    try {
      const profile = loadProfile();
      if (profile && profile.name !== display) saveProfile({ ...profile, name: display });
      onShared(await sharePlan(plan, display));
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    if (!url) return;
    const text = `${plan.title}: are you in? ${url}`;
    try {
      if (navigator.share) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(url);
        setMessage('Link copied.');
      }
    } catch {
      // Share sheet dismissed.
    }
  }

  if (!url) {
    return (
      <form onSubmit={create} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface px-3.5 py-3">
        <p className="text-[0.9rem] font-bold">Send a link friends can answer</p>
        <p className="text-sm text-muted">They see the plan and tap &ldquo;I&apos;m in&rdquo; or &ldquo;Not that one&rdquo;. No sign-up.</p>
        <div className="flex gap-2">
          <label htmlFor="share-name" className="sr-only">
            Your name
          </label>
          <input
            id="share-name"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (message) setMessage(null);
            }}
            placeholder="Your name"
            maxLength={60}
            autoComplete="given-name"
            className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3 py-2.5 text-sm outline-none focus:border-accent"
          />
          <Button type="submit" disabled={busy}>
            {busy ? 'Making…' : 'Make link'}
          </Button>
        </div>
        {message && (
          <p role="status" className="text-sm text-muted">
            {message}
          </p>
        )}
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface px-3.5 py-3">
      <div className="flex items-center justify-between gap-2">
        <p className="truncate font-mono text-xs text-muted" title={url}>
          {url}
        </p>
        <Button onClick={send} className="flex-none px-3 py-2">
          Send
        </Button>
      </div>
      {view && view.responses.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {view.responses.map((r) => (
            <li key={r.name} className="flex items-start gap-2 text-[0.85rem]">
              {r.response === 'in' ? <CheckIcon className="mt-0.5 size-4 flex-none text-echo" /> : <XIcon className="mt-0.5 size-4 flex-none text-warn" />}
              <span>
                <span className="font-semibold">{r.name}</span> {r.response === 'in' ? "is in" : 'would rather not'}
                {r.note ? <span className="text-muted">: {r.note}</span> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">No answers yet.</p>
      )}
      {message && (
        <p role="status" className="text-sm text-muted">
          {message}
        </p>
      )}
    </div>
  );
}

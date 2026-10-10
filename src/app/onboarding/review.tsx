'use client';

import { useState } from 'react';
import { ArrowRightIcon, XIcon } from '@/components/icons';
import type { HeardTaste, MentionType } from '@/lib/onboarding/types';
import type { Activity, Preferences } from '@/lib/profile/types';
import type { EntitySummary } from '@/lib/qloo/types';
import { apiFetch } from '@/lib/supabase/browser';

const TYPE_LABEL: Record<string, string> = {
  artist: 'Music',
  movie: 'Film',
  tv_show: 'TV',
  book: 'Book',
  author: 'Author',
  person: 'Person',
  video_game: 'Game',
  podcast: 'Podcast',
  unknown: '',
};

const ACTIVITY_STATUS: Record<Activity['status'], string> = { does: '', used_to: 'used to', wants_to: 'want to try' };

/** Preferences as removable chips. Each chip knows how to clear itself. */
function preferenceChips(p: Preferences): Array<{ label: string; clear: (p: Preferences) => Preferences }> {
  const chips: Array<{ label: string; clear: (p: Preferences) => Preferences }> = [];
  if (p.company)
    chips.push({ label: { solo: 'Likes going solo', group: 'Likes going with people', either: 'Solo or with people' }[p.company], clear: ({ company: _, ...rest }) => rest });
  if (p.setting)
    chips.push({ label: { indoor: 'Prefers indoors', outdoor: 'Prefers outdoors', either: 'Indoors or outdoors' }[p.setting], clear: ({ setting: _, ...rest }) => rest });
  if (p.budget !== undefined) chips.push({ label: `About $${p.budget} an outing`, clear: ({ budget: _, ...rest }) => rest });
  if (p.maxMiles !== undefined) chips.push({ label: `Within ${p.maxMiles} mi`, clear: ({ maxMiles: _, ...rest }) => rest });
  for (const note of p.notes) chips.push({ label: note, clear: (q) => ({ ...q, notes: q.notes.filter((n) => n !== note) }) });
  return chips;
}

function optionLabel(e: EntitySummary) {
  const kind = TYPE_LABEL[String(e.type)] || String(e.type);
  return [kind, e.disambiguation].filter(Boolean).join(', ');
}

export function Review({
  heard,
  onChange,
  activities,
  onActivitiesChange,
  preferences,
  onPreferencesChange,
  onKeepTalking,
  keepLabel = 'Keep talking',
  onBuild,
}: {
  heard: HeardTaste[];
  onChange: (next: HeardTaste[]) => void;
  activities: Activity[];
  onActivitiesChange: (next: Activity[]) => void;
  preferences: Preferences;
  onPreferencesChange: (next: Preferences) => void;
  onKeepTalking: () => void;
  keepLabel?: string;
  onBuild: (tastes: HeardTaste[]) => void;
}) {
  const [adding, setAdding] = useState('');
  const [addBusy, setAddBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const unclear = heard.filter((h) => h.status === 'ambiguous');
  const settled = heard.filter((h) => h.status !== 'ambiguous');
  const pending = settled.filter((h) => h.status === 'pending').length;

  const remove = (key: string) => onChange(heard.filter((h) => h.key !== key));
  const choose = (key: string, entity: EntitySummary) =>
    onChange(
      heard.map((h) =>
        h.key === key ? { ...h, status: 'matched', entity, options: undefined, type: (entity.type as MentionType) ?? h.type } : h,
      ),
    );

  async function add(e: React.FormEvent) {
    e.preventDefault();
    const name = adding.trim();
    if (!name) {
      setMessage('Type a show, artist, book, game, or podcast to add.');
      return;
    }
    setAddBusy(true);
    setMessage(null);
    try {
      const res = await apiFetch('/api/onboarding/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name, type: 'unknown' }),
      });
      if (!res.ok) throw new Error();
      const taste = (await res.json()) as HeardTaste;
      if (heard.some((h) => h.key === taste.key)) setMessage(`${name} is already on your list.`);
      else onChange([...heard, taste]);
      setAdding('');
    } catch {
      setMessage(`Couldn't add ${name}. Try again.`);
    } finally {
      setAddBusy(false);
    }
  }

  function build() {
    if (settled.length === 0) {
      setMessage('Add at least one thing you love first.');
      return;
    }
    if (unclear.length) {
      setMessage(`Pick which ${unclear[0]!.name} you meant, or remove it.`);
      return;
    }
    onBuild(settled);
  }

  return (
    <main className="flex flex-1 flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="text-lg font-bold">Here&apos;s what I heard</h1>
        <p className="text-sm text-muted">Remove anything that&apos;s wrong, or add what I missed.</p>
      </header>

      {settled.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" aria-label="Your tastes">
          {settled.map((h) => (
            <li key={h.key}>
              <button
                type="button"
                onClick={() => remove(h.key)}
                aria-label={`Remove ${h.entity?.name ?? h.name}`}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm ${
                  h.status === 'not_found' ? 'border-dashed border-line text-muted' : 'border-line bg-surface'
                }`}
              >
                {h.entity?.name ?? h.name}
                {h.status === 'not_found' && <span className="text-[11px] text-faint">not found</span>}
                {h.status === 'pending' && <span className="size-1.5 rounded-full bg-faint" aria-label="not checked yet" />}
                <XIcon className="size-3.5 text-faint" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
          Nothing yet. Add a few things you love below.
        </p>
      )}

      {pending > 0 && (
        <p className="text-xs text-faint">
          Items with a dot couldn&apos;t be checked yet. They&apos;re saved by name and checked later.
        </p>
      )}

      {activities.length > 0 && (
        <section className="flex flex-col gap-1.5" aria-label="Things you do">
          <h2 className="text-[11px] font-bold tracking-[0.08em] text-faint uppercase">Things you do</h2>
          <ul className="flex flex-wrap gap-1.5">
            {activities.map((a) => (
              <li key={a.name}>
                <button
                  type="button"
                  onClick={() => onActivitiesChange(activities.filter((x) => x.name !== a.name))}
                  aria-label={`Remove ${a.name}`}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-sm"
                >
                  {a.name}
                  {ACTIVITY_STATUS[a.status] && <span className="text-[11px] text-faint">{ACTIVITY_STATUS[a.status]}</span>}
                  <XIcon className="size-3.5 text-faint" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {preferenceChips(preferences).length > 0 && (
        <section className="flex flex-col gap-1.5" aria-label="Good to know">
          <h2 className="text-[11px] font-bold tracking-[0.08em] text-faint uppercase">Good to know</h2>
          <ul className="flex flex-wrap gap-1.5">
            {preferenceChips(preferences).map((c) => (
              <li key={c.label}>
                <button
                  type="button"
                  onClick={() => onPreferencesChange(c.clear(preferences))}
                  aria-label={`Remove ${c.label}`}
                  className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-transparent bg-accent-soft px-3 py-1.5 text-sm text-accent-text"
                >
                  {c.label}
                  <XIcon className="size-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {unclear.length > 0 && (
        <section className="flex flex-col gap-2" aria-label="Did you mean">
          <h2 className="text-[11px] font-bold tracking-[0.08em] text-faint uppercase">Did you mean</h2>
          {unclear.map((h) => (
            <div key={h.key} className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-bold">&ldquo;{h.name}&rdquo;</p>
                <button type="button" onClick={() => remove(h.key)} className="cursor-pointer text-xs text-faint">
                  Remove
                </button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(h.options ?? []).map((o) => (
                  <button
                    key={o.id}
                    type="button"
                    onClick={() => choose(h.key, o)}
                    className="cursor-pointer rounded-full border border-line px-3 py-1.5 text-left text-sm hover:border-accent"
                  >
                    {o.name}
                    <span className="ml-1.5 text-xs text-faint">{optionLabel(o)}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}

      <form onSubmit={add} className="flex flex-col gap-2">
        <label htmlFor="add-taste" className="text-[11px] font-bold tracking-[0.08em] text-faint uppercase">
          Add something
        </label>
        <div className="flex gap-2">
          <input
            id="add-taste"
            value={adding}
            onChange={(e) => {
              setAdding(e.target.value);
              if (message) setMessage(null);
            }}
            placeholder="Hollow Knight"
            autoComplete="off"
            maxLength={200}
            className="min-w-0 flex-1 rounded-2xl border border-line bg-surface px-3.5 py-3 text-[0.95rem] outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={addBusy}
            className="cursor-pointer rounded-2xl border border-line bg-surface px-4 text-sm font-bold disabled:opacity-60"
          >
            {addBusy ? 'Adding…' : 'Add'}
          </button>
        </div>
      </form>

      {message && (
        <p role="status" className="text-sm text-warn">
          {message}
        </p>
      )}

      <div className="flex-1" />
      <button type="button" onClick={onKeepTalking} className="cursor-pointer text-center text-sm font-bold text-accent">
        {keepLabel}
      </button>
      <button
        type="button"
        onClick={build}
        className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-2xl border border-accent bg-accent px-4 py-3 text-sm font-bold text-accent-ink active:scale-[0.98]"
      >
        Build my echo <ArrowRightIcon className="size-4" />
      </button>
    </main>
  );
}

'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DevTools } from '@/components/dev-tools';
import { CheckIcon, PlugIcon, SendIcon, XIcon } from '@/components/icons';
import { Button, Chip, Label, LinkButton, Spinner, TabBar, Voice, Why } from '@/components/ui';
import { pendingInvite } from '@/lib/invites';
import { tasteKey } from '@/lib/onboarding/resolve';
import type { MentionType } from '@/lib/onboarding/types';
import type { BuiltProfile } from '@/lib/profile/build';
import { shareTasteCard } from '@/lib/profile/taste-card';
import { buildSignature, type EchoProfile, type TastePick } from '@/lib/profile/types';
import { loadPlans, loadProfile, saveProfile, useStored } from '@/lib/store';
import { apiFetch } from '@/lib/supabase/browser';

const TYPE_LABEL: Record<string, string> = {
  tv_show: 'TV',
  artist: 'Music',
  book: 'Book',
  podcast: 'Podcast',
  movie: 'Film',
  video_game: 'Game',
  person: 'Person',
  author: 'Author',
};

const ACTIVITY_STATUS = { does: '', used_to: 'used to', wants_to: 'want to try' } as const;

export function EchoProfileScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const profile = useStored(loadProfile);
  const plans = useStored(loadPlans);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const [openTrait, setOpenTrait] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const started = useRef(false);
  const [invite, setInvite] = useState<string | null>(null);
  useEffect(() => setInvite(pendingInvite()), []);

  function flash(t: string) {
    setToast(t);
    setTimeout(() => setToast(null), 2400);
  }

  const build = useCallback(async (p: EchoProfile) => {
    setBuilding(true);
    setError(null);
    try {
      const res = await apiFetch('/api/profile/build', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tastes: p.tastes, activities: p.activities, preferences: p.preferences, exclude: p.skippedPicks ?? [] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Echo couldn't build your profile just now. Try again.");
      const built = body as BuiltProfile;
      setOffline(built.qlooUnavailable);
      // Read the latest copy: reactions may have changed while this was running.
      const latest = loadProfile() ?? p;
      saveProfile({
        ...latest,
        summary: built.summary,
        traits: built.traits,
        leanings: built.leanings,
        alsoLove: built.alsoLove,
        builtAt: Date.now(),
        builtFrom: buildSignature(latest),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Echo couldn't build your profile just now. Try again.");
    } finally {
      setBuilding(false);
    }
  }, []);

  // Build after onboarding, and rebuild once when tastes or notes have changed since the last build.
  useEffect(() => {
    if (!profile || started.current) return;
    const stale = !profile.builtAt || profile.builtFrom !== buildSignature(profile);
    if (params.get('build') === '1' || stale) {
      started.current = true;
      if (params.get('build')) router.replace('/echo');
      void build(profile);
    }
  }, [profile, params, build, router]);

  if (profile === undefined || plans === undefined) return null;

  if (!profile) {
    return (
      <main className="flex flex-1 flex-col gap-4">
        <h1 className="text-lg font-bold">Your echo</h1>
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-line px-4 py-8 text-center">
          <p className="text-sm text-muted">Echo doesn&apos;t know your taste yet.</p>
          <LinkButton href="/onboarding" kind="primary">
            Tell Echo what you love
          </LinkButton>
        </div>
        <DevTools />
      </main>
    );
  }

  const p = profile;
  const confirmed = new Set(p.confirmedTraits ?? []);
  const lastCheckIn = plans.filter((x) => x.checkIn?.learned.length).sort((a, b) => (b.checkIn!.at ?? 0) - (a.checkIn!.at ?? 0))[0];
  const matched = p.tastes.filter((t) => t.status === 'matched').length;

  function reactTrait(trait: string, fits: boolean) {
    setOpenTrait(null);
    if (fits) {
      saveProfile({ ...p, confirmedTraits: [...new Set([...(p.confirmedTraits ?? []), trait])] });
    } else {
      saveProfile({
        ...p,
        traits: (p.traits ?? []).filter((t) => t !== trait),
        confirmedTraits: (p.confirmedTraits ?? []).filter((t) => t !== trait),
        preferences: { ...p.preferences, notes: [...p.preferences.notes, `doesn't see themselves as "${trait.toLowerCase()}"`] },
      });
      flash('Noted. Echo will keep that in mind.');
    }
  }

  function lovePick(pick: TastePick) {
    const type = pick.type as MentionType;
    const key = tasteKey(pick.name, type);
    if (p.tastes.some((t) => t.key === key)) return;
    saveProfile({
      ...p,
      tastes: [...p.tastes, { key, name: pick.name, type, status: 'matched', entity: { id: pick.id, name: pick.name, type, year: pick.year, image: pick.image } }],
      alsoLove: (p.alsoLove ?? []).filter((x) => x.id !== pick.id),
    });
    flash(`Added ${pick.name}. Your picks will refresh.`);
  }

  function skipPick(pick: TastePick) {
    saveProfile({ ...p, skippedPicks: [...new Set([...(p.skippedPicks ?? []), pick.id])], alsoLove: (p.alsoLove ?? []).filter((x) => x.id !== pick.id) });
  }

  async function shareCard() {
    try {
      const how = await shareTasteCard(p);
      if (how === 'downloaded') flash('Card saved as an image.');
    } catch {
      // Share sheet dismissed.
    }
  }

  return (
    <main className="relative flex flex-1 flex-col gap-3">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Your echo</h1>
        <button type="button" onClick={shareCard} disabled={!p.summary} className="flex cursor-pointer items-center gap-1.5 text-sm font-bold text-accent disabled:opacity-40">
          <SendIcon className="size-4" /> Share card
        </button>
      </header>

      {building && !p.summary ? <Spinner label="Building your echo…" /> : p.summary ? <Voice className="text-[1.25rem]">{p.summary}</Voice> : null}
      {building && p.summary && <Spinner label="Refreshing with your latest tastes…" />}

      {error && (
        <div className="flex flex-col gap-2">
          <p role="status" className="text-sm text-warn">
            {error}
          </p>
          <Button onClick={() => build(p)}>Try again</Button>
        </div>
      )}

      {!!p.traits?.length && (
        <section className="flex flex-col gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            {p.traits.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setOpenTrait(openTrait === t ? null : t)}
                aria-expanded={openTrait === t}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ${
                  confirmed.has(t) ? 'bg-accent text-accent-ink' : 'bg-accent-soft text-accent-text'
                }`}
              >
                {confirmed.has(t) && <CheckIcon className="size-3.5" />}
                {t}
              </button>
            ))}
          </div>
          {openTrait ? (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted">&ldquo;{openTrait}&rdquo;:</span>
              <button type="button" onClick={() => reactTrait(openTrait, true)} className="cursor-pointer rounded-full border border-line px-3 py-1 font-semibold">
                That&apos;s me
              </button>
              <button type="button" onClick={() => reactTrait(openTrait, false)} className="cursor-pointer rounded-full border border-line px-3 py-1 font-semibold">
                Not really
              </button>
            </div>
          ) : (
            <p className="text-xs text-faint">Tap a trait to tell Echo if it fits.</p>
          )}
        </section>
      )}

      {lastCheckIn && (
        <p className="rounded-2xl bg-sunk px-3.5 py-2.5 text-sm">
          <span className="font-semibold">Since your last plan: </span>
          {lastCheckIn.checkIn!.learned.join('; ')}.
        </p>
      )}

      {!!p.leanings?.length && (
        <section className="flex flex-col gap-2">
          <Label>Where your taste leans</Label>
          {p.leanings.map((l) => (
            <div key={l.label} className="flex items-center gap-3">
              <span className="w-28 flex-none truncate text-[0.82rem]">{l.label}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunk">
                <span className="block h-full rounded-full bg-accent" style={{ width: `${l.score}%` }} />
              </span>
            </div>
          ))}
        </section>
      )}

      {!!p.alsoLove?.length && (
        <section className="flex flex-col gap-2">
          <Label>You might also love</Label>
          {p.alsoLove.map((pick) => (
            <div key={pick.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-2.5">
              {pick.image ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pick.image} alt="" referrerPolicy="no-referrer" className="h-16 w-12 flex-none rounded-lg bg-sunk object-cover" />
              ) : null}
              <div className="min-w-0 flex-1">
                <p className="text-[0.9rem] font-bold">
                  {pick.name}
                  <span className="ml-1.5 text-xs font-normal text-faint">{TYPE_LABEL[pick.type] ?? pick.type}</span>
                </p>
                {pick.reason && <Why>{pick.reason}</Why>}
              </div>
              <div className="flex flex-none flex-col gap-1">
                <button type="button" onClick={() => lovePick(pick)} aria-label={`Love ${pick.name}`} className="grid size-8 cursor-pointer place-items-center rounded-full bg-accent text-accent-ink">
                  <CheckIcon className="size-4" />
                </button>
                <button type="button" onClick={() => skipPick(pick)} aria-label={`Skip ${pick.name}`} className="grid size-8 cursor-pointer place-items-center rounded-full border border-line text-muted">
                  <XIcon className="size-4" />
                </button>
              </div>
            </div>
          ))}
        </section>
      )}

      {!building && p.builtAt && !p.alsoLove?.length && (
        <p className="text-sm text-muted">
          {offline || matched === 0 ? 'Recommendations appear once your tastes are checked against Qloo.' : 'No new picks right now. Love a few more things and check back.'}
        </p>
      )}

      <section className="flex flex-col gap-2">
        <Label>What you told Echo</Label>
        <div className="flex flex-wrap gap-1.5">
          {p.tastes.map((t) => (
            <Chip key={t.key}>
              {t.entity?.name ?? t.name}
              {t.status === 'pending' && <span className="size-1.5 rounded-full bg-faint" aria-label="not checked yet" />}
            </Chip>
          ))}
          {p.activities.map((a) => (
            <Chip key={a.name} tone="echo">
              {a.name}
              {ACTIVITY_STATUS[a.status] && <span className="text-[11px] opacity-80">{ACTIVITY_STATUS[a.status]}</span>}
            </Chip>
          ))}
        </div>
      </section>

      {invite ? (
        <LinkButton href={`/join/${invite}`} kind="primary">
          Finish joining your friend
        </LinkButton>
      ) : (
        <LinkButton href="/home" kind="primary">
          Start using Echo
        </LinkButton>
      )}
      <div className="flex gap-2">
        <LinkButton href="/onboarding" className="flex-1">
          Edit what you love
        </LinkButton>
        <Button className="flex-1" onClick={() => build(p)} disabled={building}>
          Refresh
        </Button>
      </div>
      <Link href="/ai" className="flex items-center justify-between rounded-2xl border border-line bg-surface px-3.5 py-3 text-[0.85rem]">
        <span className="flex items-center gap-2">
          <PlugIcon className="size-4 text-muted" /> Use your echo with any AI assistant
        </span>
        <span className="text-faint">›</span>
      </Link>
      <DevTools />
      <TabBar current="/echo" />

      {toast && (
        <p role="status" className="fixed inset-x-4 bottom-20 z-10 mx-auto max-w-sm rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-surface">
          {toast}
        </p>
      )}
    </main>
  );
}

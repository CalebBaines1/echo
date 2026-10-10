'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { DevTools } from '@/components/dev-tools';
import { Button, Card, Chip, Label, LinkButton, Spinner, TabBar, Voice, Why } from '@/components/ui';
import type { BuiltProfile } from '@/lib/profile/build';
import type { EchoProfile } from '@/lib/profile/types';
import { pendingInvite } from '@/lib/invites';
import { loadProfile, saveProfile, useStored } from '@/lib/store';
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
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);
  const started = useRef(false);
  const [invite, setInvite] = useState<string | null>(null);
  useEffect(() => setInvite(pendingInvite()), []);

  const build = useCallback(async (p: EchoProfile) => {
    setBuilding(true);
    setError(null);
    try {
      const res = await apiFetch('/api/profile/build', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tastes: p.tastes, activities: p.activities, preferences: p.preferences }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Echo couldn't build your profile just now. Try again.");
      const built = body as BuiltProfile;
      setOffline(built.qlooUnavailable);
      saveProfile({ ...p, summary: built.summary, traits: built.traits, leanings: built.leanings, alsoLove: built.alsoLove, builtAt: Date.now() });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Echo couldn't build your profile just now. Try again.");
    } finally {
      setBuilding(false);
    }
  }, []);

  // Build once after onboarding, or when a saved profile has never been built.
  useEffect(() => {
    if (!profile || started.current) return;
    if (params.get('build') === '1' || !profile.builtAt) {
      started.current = true;
      router.replace('/echo');
      void build(profile);
    }
  }, [profile, params, build, router]);

  if (profile === undefined) return null;

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

  const matched = profile.tastes.filter((t) => t.status === 'matched').length;

  return (
    <main className="flex flex-1 flex-col gap-3">
      <header className="flex items-center justify-between">
        <h1 className="text-lg font-bold">Your echo</h1>
        <span className="text-xs text-faint">{profile.tastes.length} tastes</span>
      </header>

      {building ? (
        <Spinner label="Building your echo…" />
      ) : profile.summary ? (
        <Voice className="text-[1.25rem]">{profile.summary}</Voice>
      ) : null}

      {error && (
        <div className="flex flex-col gap-2">
          <p role="status" className="text-sm text-warn">
            {error}
          </p>
          <Button onClick={() => build(profile)}>Try again</Button>
        </div>
      )}

      {!!profile.traits?.length && (
        <div className="flex flex-wrap gap-1.5">
          {profile.traits.map((t) => (
            <Chip key={t} tone="accent">
              {t}
            </Chip>
          ))}
        </div>
      )}

      {!!profile.leanings?.length && (
        <section className="flex flex-col gap-2">
          <Label>Where your taste leans</Label>
          {profile.leanings.map((l) => (
            <div key={l.label} className="flex flex-col gap-1">
              <div className="flex justify-between text-[0.8rem]">
                <span>{l.label}</span>
                <span className="text-faint tabular-nums">{l.score}</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-sunk">
                <div className="h-full rounded-full bg-accent" style={{ width: `${l.score}%` }} />
              </div>
            </div>
          ))}
        </section>
      )}

      {!!profile.alsoLove?.length && (
        <section className="flex flex-col gap-2">
          <Label>You might also love</Label>
          {profile.alsoLove.map((p) => (
            <Card key={p.id}>
              <p className="text-[0.9rem] font-bold">
                {p.name}
                <span className="ml-1.5 text-xs font-normal text-faint">{TYPE_LABEL[p.type] ?? p.type}</span>
              </p>
              {p.reason && <Why>{p.reason}</Why>}
            </Card>
          ))}
        </section>
      )}

      {!building && profile.builtAt && !profile.alsoLove?.length && (
        <p className="text-sm text-muted">
          {offline || matched === 0
            ? 'Recommendations appear once your tastes are checked against Qloo.'
            : 'No recommendations came back for these tastes yet.'}
        </p>
      )}

      <section className="flex flex-col gap-2">
        <Label>What you told Echo</Label>
        <div className="flex flex-wrap gap-1.5">
          {profile.tastes.map((t) => (
            <Chip key={t.key}>
              {t.entity?.name ?? t.name}
              {t.status === 'pending' && <span className="size-1.5 rounded-full bg-faint" aria-label="not checked yet" />}
            </Chip>
          ))}
          {profile.activities.map((a) => (
            <Chip key={a.name} tone="echo">
              {a.name}
              {ACTIVITY_STATUS[a.status] && <span className="text-[11px] opacity-80">{ACTIVITY_STATUS[a.status]}</span>}
            </Chip>
          ))}
        </div>
      </section>

      <div className="flex gap-2 pt-1">
        <LinkButton href="/onboarding" className="flex-1">
          Tell Echo more
        </LinkButton>
        <Button className="flex-1" onClick={() => build(profile)} disabled={building}>
          Refresh
        </Button>
      </div>
      {invite ? (
        <LinkButton href={`/join/${invite}`} kind="primary">
          Finish joining your friend
        </LinkButton>
      ) : (
        <LinkButton href="/home" kind="primary">
          Start using Echo
        </LinkButton>
      )}
      <DevTools />
      <TabBar current="/echo" />
    </main>
  );
}

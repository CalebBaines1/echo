'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { SAMPLE_PROFILE } from '@/data/sample-profile';
import { tasteKey } from '@/lib/onboarding/resolve';
import type { HeardTaste } from '@/lib/onboarding/types';
import { buildProfile } from '@/lib/profile/build-client';
import { EMPTY_PREFERENCES, SAMPLE_AREA, type EchoProfile } from '@/lib/profile/types';
import { loadProfile, saveProfile } from '@/lib/store';
import { apiFetch } from '@/lib/supabase/browser';

/** Skips onboarding with a ready-made person in the sample city, for a quick look. */
export function SampleButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // Only for newcomers: never replace someone's own profile.
  const [show, setShow] = useState(false);
  useEffect(() => setShow(!loadProfile()), []);

  async function load() {
    setBusy(true);
    const tastes = await Promise.all(
      SAMPLE_PROFILE.tastes.map(async (t): Promise<HeardTaste> => {
        const fallback: HeardTaste = { key: tasteKey(t.name, t.type), name: t.name, type: t.type, status: 'pending' };
        try {
          const res = await apiFetch('/api/onboarding/resolve', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(t) });
          return res.ok ? ((await res.json()) as HeardTaste) : fallback;
        } catch {
          return fallback;
        }
      }),
    );
    const profile: EchoProfile = { name: SAMPLE_PROFILE.name, tastes, activities: SAMPLE_PROFILE.activities, preferences: EMPTY_PREFERENCES, area: SAMPLE_AREA };
    saveProfile(profile);
    void buildProfile(profile).catch(() => undefined);
    router.push('/home');
  }

  if (!show) return null;
  return (
    <button type="button" onClick={load} disabled={busy} className="cursor-pointer rounded-2xl border border-line bg-surface px-4 py-3 text-sm font-bold disabled:opacity-60">
      {busy ? 'Loading Riley…' : 'Just looking? Try it as Riley, a sample person in New York'}
    </button>
  );
}

'use client';

import type { BuiltProfile } from '@/lib/profile/build';
import { buildSignature, type EchoProfile } from '@/lib/profile/types';
import { loadProfile, saveProfile } from '@/lib/store';
import { apiFetch } from '@/lib/supabase/browser';

let running: Promise<{ qlooUnavailable: boolean }> | null = null;

/**
 * Writes the profile summary, traits and picks, and saves them. One build at a
 * time: a second call while one runs gets the same result. Throws on failure.
 */
export function buildProfile(p: EchoProfile): Promise<{ qlooUnavailable: boolean }> {
  running ??= (async () => {
    try {
      const res = await apiFetch('/api/profile/build', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ tastes: p.tastes, activities: p.activities, preferences: p.preferences, exclude: p.skippedPicks ?? [] }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error ?? "Echo couldn't build your profile just now. Try again.");
      const built = body as BuiltProfile;
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
      return { qlooUnavailable: built.qlooUnavailable };
    } finally {
      running = null;
    }
  })();
  return running;
}

export const profileBuilding = () => running !== null;

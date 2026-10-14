'use client';

import type { HeardTaste } from '@/lib/onboarding/types';
import { loadProfile, saveProfile } from '@/lib/store';
import { apiFetch } from '@/lib/supabase/browser';

// Tastes added while Qloo was unreachable are kept by name as "pending".
// Once Qloo answers again, this matches them so the profile fills in.

const LAST_KEY = 'echo:recheck:last';
const EVERY_MS = 6 * 3_600_000;

/** An ambiguous result settled without asking: the first option of the kind they named, else the first. */
export function settle(found: HeardTaste): HeardTaste {
  if (found.status !== 'ambiguous' || !found.options?.length) return found;
  const pick = found.options.find((o) => o.type === found.type) ?? found.options[0]!;
  return { ...found, status: 'matched', entity: pick, options: undefined };
}

/** Re-resolves pending tastes. Stops at the first one Qloo still can't check. Returns how many changed. */
export async function recheckPendingTastes(): Promise<number> {
  const profile = loadProfile();
  const pending = profile?.tastes.filter((t) => t.status === 'pending') ?? [];
  if (!pending.length) return 0;
  try {
    if (Date.now() - Number(localStorage.getItem(LAST_KEY) ?? 0) < EVERY_MS) return 0;
    localStorage.setItem(LAST_KEY, String(Date.now()));
  } catch {
    // Storage blocked: check anyway.
  }

  const updated = new Map<string, HeardTaste>();
  for (const t of pending) {
    const res = await apiFetch('/api/onboarding/resolve', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: t.name, type: t.type }),
    }).catch(() => null);
    if (!res?.ok) break;
    const found = settle((await res.json()) as HeardTaste);
    if (found.status === 'pending') break; // Qloo still unreachable: try again later.
    updated.set(t.key, { ...found, key: t.key });
  }
  if (!updated.size) return 0;

  // Re-read in case the profile changed while checking.
  const latest = loadProfile();
  if (!latest) return 0;
  saveProfile({ ...latest, tastes: latest.tastes.map((t) => updated.get(t.key) ?? t) });
  return updated.size;
}

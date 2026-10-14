'use client';

import { apiFetch, getSupabaseBrowser } from '@/lib/supabase/browser';
import { hush } from '@/lib/voice/say';

/**
 * Deletes everything: the account on the server, then this browser's copy,
 * then signs out so the next visit starts a fresh anonymous account.
 */
export async function startOver(): Promise<void> {
  const res = await apiFetch('/api/account/reset', { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error ?? "Echo couldn't reset your account just now. Try again.");
  }
  hush();
  await getSupabaseBrowser()
    ?.auth.signOut({ scope: 'local' })
    .catch(() => undefined);
  try {
    for (const key of Object.keys(localStorage)) if (key.startsWith('echo:') || key.startsWith('sb-')) localStorage.removeItem(key);
    sessionStorage.clear();
  } catch {
    // Storage blocked: nothing stored here anyway.
  }
  window.location.href = '/';
}

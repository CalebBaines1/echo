'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { supabaseConfigured, supabasePublicKey, supabaseUrl } from './config';

let client: SupabaseClient | undefined;

export function getSupabaseBrowser(): SupabaseClient | undefined {
  if (!supabaseConfigured()) return undefined;
  client ??= createBrowserClient(supabaseUrl()!, supabasePublicKey()!);
  return client;
}

let pending: Promise<Session | null> | undefined;

/**
 * Returns the current session, signing in anonymously on first visit so
 * nobody has to create an account. Null when Supabase isn't configured.
 */
export async function ensureSession(): Promise<Session | null> {
  const sb = getSupabaseBrowser();
  if (!sb) return null;
  const { data } = await sb.auth.getSession();
  if (data.session) return data.session;
  pending ??= sb.auth
    .signInAnonymously()
    .then(({ data, error }) => {
      if (error) throw error;
      return data.session;
    })
    .finally(() => {
      pending = undefined;
    });
  return pending;
}

/** fetch() for Echo's API routes, with the user's access token attached. */
export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const session = await ensureSession().catch((err) => {
    console.error('Sign-in failed', err);
    return null;
  });
  const headers = new Headers(init.headers);
  if (session) headers.set('authorization', `Bearer ${session.access_token}`);
  return fetch(input, { ...init, headers });
}

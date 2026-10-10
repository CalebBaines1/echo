import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabasePublicKey, supabaseSecretKey, supabaseUrl } from './config';

let admin: SupabaseClient | undefined;

/** Service-role client for server-only tables. Never send this to the browser. */
export function getSupabaseAdmin(): SupabaseClient | undefined {
  const url = supabaseUrl();
  const key = supabaseSecretKey();
  if (!url || !key) return undefined;
  admin ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return admin;
}

let verifier: SupabaseClient | undefined;

/** Client used only to verify user access tokens. */
export function getSupabaseVerifier(): SupabaseClient | undefined {
  const url = supabaseUrl();
  const key = supabasePublicKey();
  if (!url || !key) return undefined;
  verifier ??= createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return verifier;
}

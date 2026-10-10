// Supabase settings. Both the newer key names (publishable/secret) and the
// older ones (anon/service role) are accepted.

export function supabaseUrl(): string | undefined {
  return process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || undefined;
}

export function supabasePublicKey(): string | undefined {
  return (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)?.trim() || undefined;
}

export function supabaseSecretKey(): string | undefined {
  return (process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY)?.trim() || undefined;
}

/** True when the app should use accounts and the database. Without it, data stays in the browser. */
export function supabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && supabasePublicKey());
}

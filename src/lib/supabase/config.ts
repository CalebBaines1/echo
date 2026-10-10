// Supabase settings. Both the newer key names (publishable/secret) and the
// older ones (anon/service role) are accepted.

/** The project URL. Tolerates a pasted API URL such as ".../rest/v1/" by keeping only the origin. */
export function supabaseUrl(): string | undefined {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!raw) return undefined;
  try {
    return new URL(raw).origin;
  } catch {
    return raw;
  }
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

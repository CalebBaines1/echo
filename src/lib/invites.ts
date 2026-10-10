'use client';

const PENDING_KEY = 'echo:pending-invite';

/** An invite opened before the person had an echo, to finish after onboarding. */
export function pendingInvite(): string | null {
  try {
    return localStorage.getItem(PENDING_KEY);
  } catch {
    return null;
  }
}

export function setPendingInvite(token: string | null) {
  try {
    if (token) localStorage.setItem(PENDING_KEY, token);
    else localStorage.removeItem(PENDING_KEY);
  } catch {
    // Storage blocked: they'll need to open the link again.
  }
}

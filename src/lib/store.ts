'use client';

// Browser-only storage until accounts and the database exist. Every read
// tolerates missing or blocked storage.

import { useCallback, useEffect, useState } from 'react';
import type { EchoProfile } from '@/lib/profile/types';
import type { Plan } from '@/lib/plans/types';

const KEYS = {
  profile: 'echo:profile:v1',
  plans: 'echo:plans:v1',
} as const;

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    window.dispatchEvent(new CustomEvent('echo:store', { detail: key }));
  } catch {
    // Storage blocked: changes last for this page view only.
  }
}

export function loadProfile(): EchoProfile | null {
  return read<EchoProfile | null>(KEYS.profile, null);
}

export function saveProfile(profile: EchoProfile) {
  write(KEYS.profile, profile);
}

export function loadPlans(): Plan[] {
  return read<Plan[]>(KEYS.plans, []);
}

export function savePlan(plan: Plan) {
  const plans = loadPlans().filter((p) => p.id !== plan.id);
  write(KEYS.plans, [plan, ...plans].slice(0, 50));
}

export function getPlan(id: string): Plan | undefined {
  return loadPlans().find((p) => p.id === id);
}

export function clearAll() {
  try {
    localStorage.removeItem(KEYS.profile);
    localStorage.removeItem(KEYS.plans);
    window.dispatchEvent(new CustomEvent('echo:store'));
  } catch {
    // Nothing to clear.
  }
}

/** Reads a stored value and re-reads when it changes. `undefined` until mounted. */
export function useStored<T>(load: () => T): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  const refresh = useCallback(() => setValue(load()), [load]);
  useEffect(() => {
    refresh();
    window.addEventListener('echo:store', refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener('echo:store', refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [refresh]);
  return value;
}

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

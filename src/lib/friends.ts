'use client';

import type { HeardTaste } from '@/lib/onboarding/types';

/**
 * A friend's taste profile. Until accounts exist, friends can only be added
 * as samples in development; invite links need the database.
 */
export interface Friend {
  id: string;
  name: string;
  tastes: HeardTaste[];
  sample?: boolean;
}

const KEY = 'echo:friends:v1';

export function loadFriends(): Friend[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveFriends(friends: Friend[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(friends));
    window.dispatchEvent(new CustomEvent('echo:store', { detail: KEY }));
  } catch {
    // Storage blocked.
  }
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}

'use client';

import type { HeardTaste } from '@/lib/onboarding/types';

/**
 * A friend's taste profile: another member of one of your groups, or a sample
 * friend loaded in development.
 */
export interface Friend {
  id: string;
  name: string;
  tastes: HeardTaste[];
  hobbyIds?: string[];
  groupId?: string;
  sample?: boolean;
  /** Someone without an echo, described by a few things they love. Lives on this device only. */
  guest?: boolean;
  loves?: string[];
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

/** Replaces real friends with a fresh list from the server, keeping sample and guest friends. */
export function mergeServerFriends(server: Friend[]) {
  saveFriends([...server, ...loadFriends().filter((f) => f.sample || f.guest)]);
}

export function removeFriend(id: string) {
  saveFriends(loadFriends().filter((f) => f.id !== id));
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, 2);
}

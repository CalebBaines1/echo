'use client';

import type { Friend } from '@/lib/friends';
import type { HeardTaste } from '@/lib/onboarding/types';
import type { EchoProfile } from '@/lib/profile/types';
import { signalIds } from '@/lib/profile/types';
import type { Person } from './group';

export const YOU_ID = 'you';

export function youAsPerson(profile: EchoProfile): Person {
  return {
    id: YOU_ID,
    name: profile.name ?? 'You',
    ids: signalIds(profile.tastes),
    tasteNames: tasteNames(profile.tastes),
    hobbyIds: profile.activities.filter((a) => a.status !== 'used_to' && a.hobbyId).map((a) => a.hobbyId!),
    notes: [
      ...(profile.preferences.budget !== undefined ? [`about $${profile.preferences.budget} per outing`] : []),
      ...profile.preferences.notes,
    ],
  };
}

export function friendAsPerson(f: Friend): Person {
  return { id: f.id, name: f.name, ids: signalIds(f.tastes), tasteNames: tasteNames(f.tastes), hobbyIds: f.hobbyIds, loves: f.guest ? f.loves : undefined };
}

function tasteNames(tastes: HeardTaste[]): string[] {
  return tastes.slice(0, 6).map((t) => t.entity?.name ?? t.name);
}

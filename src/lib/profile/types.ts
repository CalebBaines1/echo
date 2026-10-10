import type { HeardTaste } from '@/lib/onboarding/types';

export type ActivityStatus = 'does' | 'used_to' | 'wants_to';

/** Something the person does (or wants to do) outside of media. */
export interface Activity {
  name: string;
  status: ActivityStatus;
  /** Matching entry in HOBBIES when there is one. */
  hobbyId?: string;
}

export interface Preferences {
  company?: 'solo' | 'group' | 'either';
  setting?: 'indoor' | 'outdoor' | 'either';
  /** Rough spend per outing, in dollars. */
  budget?: number;
  /** How far they'll travel, in miles. */
  maxMiles?: number;
  /** Short free-form notes, e.g. "prefers quiet places". */
  notes: string[];
}

export interface Area {
  label: string;
  lat: number;
  lon: number;
  /** True for the built-in sample location. */
  sample?: boolean;
}

export interface TastePick {
  id: string;
  name: string;
  type: string;
  year?: number;
  /** "Because you like Severance and Past Lives". */
  reason?: string;
}

export interface Leaning {
  label: string;
  /** 0 to 100, share of the strongest tag. */
  score: number;
}

export interface EchoProfile {
  name?: string;
  tastes: HeardTaste[];
  activities: Activity[];
  preferences: Preferences;
  area: Area;
  summary?: string;
  traits?: string[];
  leanings?: Leaning[];
  alsoLove?: TastePick[];
  builtAt?: number;
}

export const SAMPLE_AREA: Area = { label: 'Lower Manhattan (sample)', lat: 40.7226, lon: -73.9982, sample: true };

export const EMPTY_PREFERENCES: Preferences = { notes: [] };

/** Entity IDs to use as the Qloo taste signal, in the order they were heard. */
export function signalIds(tastes: HeardTaste[]): string[] {
  return tastes.flatMap((t) => (t.status === 'matched' && t.entity?.id ? [t.entity.id] : []));
}

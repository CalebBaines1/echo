import type { Activity, Preferences } from '@/lib/profile/types';
import type { EntitySummary } from '@/lib/qloo/types';

/** What the interviewer thinks a mention is. "author" searches people and books. */
export const MENTION_TYPES = ['artist', 'movie', 'tv_show', 'book', 'author', 'video_game', 'podcast', 'person', 'unknown'] as const;
export type MentionType = (typeof MENTION_TYPES)[number];

export interface Mention {
  name: string;
  type: MentionType;
}

/**
 * - matched: resolved to one Qloo entity
 * - ambiguous: several plausible entities; the person picks on the review screen
 * - pending: Qloo couldn't be checked right now (offline or an error); kept by name
 * - not_found: Qloo had nothing that looks like it
 */
export type TasteStatus = 'matched' | 'ambiguous' | 'pending' | 'not_found';

export interface HeardTaste {
  /** Stable key for de-duplication: lowercased name plus type. */
  key: string;
  name: string;
  type: MentionType;
  status: TasteStatus;
  entity?: EntitySummary;
  options?: EntitySummary[];
}

export interface ChatMessage {
  role: 'echo' | 'user';
  text: string;
}

export interface TurnResponse {
  reply: string;
  done: boolean;
  added: HeardTaste[];
  activities: Activity[];
  preferences: Partial<Preferences>;
}

export const OPENING_LINE =
  "Hi, I'm Echo. Let's figure out what you love. What's a show or movie you've rewatched more than once?";

/** Most questions Echo asks before wrapping up. */
export const MAX_QUESTIONS = 10;

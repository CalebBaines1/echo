import type { LatLon } from '@/lib/qloo/types';
import type { DayPart } from './when';

export type PlanMode = 'hobby' | 'day' | 'group';

/** One line in the live step list, written from the agent's tool calls. */
export interface Step {
  kind: 'ok' | 'dropped' | 'running' | 'info';
  text: string;
}

/** A place shown while the planner works, before the plan exists. */
export interface PlaceCard {
  id: string;
  name: string;
  category: string;
  miles?: number;
  priceLevel?: number;
  matchPercent?: number;
  reason?: string;
  hoursThatDay?: string;
}

/** An option the planner set aside, and why. */
export interface DroppedOption {
  name: string;
  reason: string;
  placeId?: string;
}

export interface PlanStop {
  placeId: string;
  name: string;
  /** Local time like "10:00". */
  time?: string;
  category?: string;
  distanceMiles?: number;
  address?: string;
  website?: string;
  /** Opening hours on the plan's day, e.g. "09:00-17:00", or "Closed". */
  hoursThatDay?: string;
  priceLevel?: number;
  matchPercent?: number;
  why?: string;
  location?: LatLon;
  /** Group plans: estimated fit per member id, 0-99. */
  fit?: Record<string, number>;
}

export interface PlanAction {
  id: string;
  kind: 'calendar' | 'link' | 'message';
  label: string;
  status: 'pending' | 'done';
  url?: string;
  text?: string;
}

export interface HobbyWeek {
  week: string;
  title: string;
  detail: string;
  done?: boolean;
  /** YYYY-MM-DD this step is for. */
  date?: string;
  /** The mission launched for this step, if any. */
  planId?: string;
  /** What they said after doing it. */
  note?: string;
}

export interface GroupMember {
  id: string;
  name: string;
  initials: string;
  you?: boolean;
}

export interface GroupTurn {
  memberId: string;
  text: string;
}

export type Outcome = 'loved' | 'fine' | 'skipped' | 'wrong';

export interface CheckIn {
  outcome?: Outcome;
  answer: string;
  reply: string;
  learned: string[];
  suggestion?: string;
  at: number;
}

export interface Plan {
  id: string;
  mode: PlanMode;
  createdAt: number;
  title: string;
  request: string;
  /** What Echo says about the plan. */
  summary: string;
  /** YYYY-MM-DD. */
  date?: string;
  part?: DayPart;
  areaLabel?: string;
  moods?: string[];
  /** Options the planner set aside, newest reasoning for "Why this one". */
  dropped?: DroppedOption[];
  /** Echo's own suggestion for the home screen, not something the person asked for. */
  proposal?: boolean;
  stops: PlanStop[];
  backup?: PlanStop;
  steps: Step[];
  actions: PlanAction[];
  status: 'proposed' | 'approved' | 'done';
  hobbyId?: string;
  hobbyWeeks?: HobbyWeek[];
  group?: { members: GroupMember[]; exchange: GroupTurn[]; approvals: Record<string, boolean> };
  checkIn?: CheckIn;
  /** A public link friends can open and respond to. */
  share?: { token: string };
}

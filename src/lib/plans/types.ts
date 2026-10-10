import type { LatLon } from '@/lib/qloo/types';

export type PlanMode = 'hobby' | 'day' | 'group';

/** One line in the live step list, written from the agent's tool calls. */
export interface Step {
  kind: 'ok' | 'dropped' | 'running' | 'info';
  text: string;
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

export interface CheckIn {
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
  stops: PlanStop[];
  backup?: PlanStop;
  steps: Step[];
  actions: PlanAction[];
  status: 'proposed' | 'approved' | 'done';
  hobbyId?: string;
  hobbyWeeks?: HobbyWeek[];
  group?: { members: GroupMember[]; exchange: GroupTurn[]; approvals: Record<string, boolean> };
  checkIn?: CheckIn;
}

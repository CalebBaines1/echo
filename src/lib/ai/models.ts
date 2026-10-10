// Which Claude model each agent uses. Change a model here, nowhere else.
export const MODELS = {
  /** Voice onboarding: short, fast turns. */
  interviewer: 'claude-haiku-5-5',
  /** Profile summary and traits: short writing, once per user. */
  profileWriter: 'claude-haiku-5-5',
  /** Missions and solo days: multi-step tool use, where quality matters most. */
  planner: 'claude-sonnet-5-5',
  /** Writes the group exchange from the score table. */
  groupWriter: 'claude-sonnet-5-5',
  /** Check-ins and hobby plans. */
  coach: 'claude-haiku-5-5',
} as const;

export type AgentName = keyof typeof MODELS;

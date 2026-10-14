import type { EchoProfile } from '@/lib/profile/types';
import { shuffle } from '@/lib/variety';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Everything Echo could suggest asking for, built from what the person told it. */
export function requestIdeas(p: EchoProfile): { tryNew: string[]; other: string[] } {
  const budget = p.preferences.budget !== undefined ? `, under $${p.preferences.budget}` : '';
  const quiet = p.preferences.notes.some((n) => /quiet|calm/i.test(n)) ? ', somewhere quiet' : '';
  const tryNew = p.activities
    .filter((a) => a.status === 'wants_to')
    .flatMap((a) => [`Try ${a.name} for the first time${quiet}${budget}`, `A beginner-friendly ${a.name} spot this week`, `${cap(a.name)} somewhere good for a first-timer`]);
  const tastes = p.tastes.map((t) => t.entity?.name ?? t.name);
  const other = [
    ...p.activities.filter((a) => a.status === 'does').flatMap((a) => [`${cap(a.name)} somewhere new${budget}`, `A ${a.name} spot I haven't been to, on a weeknight`]),
    ...p.activities.filter((a) => a.status === 'used_to').map((a) => `Get back into ${a.name}${budget}`),
    ...tastes.slice(0, 6).map((t) => `Somewhere that feels like ${t}`),
    ...(p.preferences.company === 'solo' ? ['A slow evening out on my own'] : []),
    ...(p.preferences.setting !== 'indoor' ? ['Something outdoors this weekend'] : []),
    `Something new that fits my taste${budget}`,
    'A rainy-day spot to get lost in for a few hours',
    'A cheap night out I would actually enjoy',
    'Live music I would like, this week',
    'A cozy café to read or write in',
  ];
  return { tryNew: [...new Set(tryNew)], other: [...new Set(other)] };
}

/** Three ideas: one about something they want to try when there is one, the rest mixed. A new draw each call. */
export function suggestedRequests(p: EchoProfile, rand: () => number = Math.random): string[] {
  const { tryNew, other } = requestIdeas(p);
  const first = shuffle(tryNew, rand).slice(0, 1);
  return [...first, ...shuffle([...tryNew.filter((t) => !first.includes(t)), ...other], rand)].slice(0, 3);
}

/** An example request for placeholders, in their own terms. */
export function exampleRequest(p: EchoProfile | null | undefined, rand: () => number = Math.random): string {
  const days = ['Tuesday evening', 'Saturday morning', 'Friday night', 'Sunday afternoon', 'tomorrow after work'];
  const day = days[Math.floor(rand() * days.length)]!;
  const activity = p ? shuffle(p.activities, rand)[0]?.name : undefined;
  return activity ? `${cap(activity)} ${day}, somewhere quiet` : `Something new ${day}, under $30`;
}

/**
 * What home's "One thing for you" asks the planner for. Varies by day (and on
 * "Another"), leaning toward things they want to try when they've named any.
 */
export function proposalRequest(p: EchoProfile, rand: () => number = Math.random): string {
  const wants = p.activities.filter((a) => a.status === 'wants_to').map((a) => a.name);
  const does = p.activities.filter((a) => a.status === 'does').map((a) => a.name);
  const themes = [
    ...(wants.length ? [`Something I'd enjoy: ideally ${shuffle(wants, rand)[0]} or another activity I want to try.`, `A first try at ${shuffle(wants, rand)[0]}, somewhere welcoming for a beginner.`] : []),
    ...(does.length ? [`A ${shuffle(does, rand)[0]} spot I haven't been to yet.`] : []),
    'Somewhere new near me that fits my taste.',
    'A relaxed evening out that fits my taste.',
    'Something a little outside my usual that I would still enjoy.',
  ];
  return themes[Math.floor(rand() * themes.length)]!;
}

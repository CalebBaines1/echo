import type { EchoProfile } from '@/lib/profile/types';

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Two or three ready-made requests built from what the person told Echo. */
export function suggestedRequests(p: EchoProfile): string[] {
  const budget = p.preferences.budget !== undefined ? `, under $${p.preferences.budget}` : '';
  const quiet = p.preferences.notes.some((n) => /quiet|calm/i.test(n)) ? ', somewhere quiet' : '';
  const out: string[] = [];
  for (const a of p.activities.filter((a) => a.status === 'wants_to')) out.push(`Try ${a.name} for the first time${quiet}${budget}`);
  for (const a of p.activities.filter((a) => a.status === 'does')) out.push(`${cap(a.name)} somewhere new${budget}`);
  for (const a of p.activities.filter((a) => a.status === 'used_to')) out.push(`Get back into ${a.name}${budget}`);
  if (p.preferences.company === 'solo') out.push('A slow evening out on my own');
  out.push(`Something new that fits my taste${budget}`);
  return [...new Set(out)].slice(0, 3);
}

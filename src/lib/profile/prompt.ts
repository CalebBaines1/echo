import type { EchoProfile } from './types';

const STATUS = { does: 'does', used_to: 'used to do', wants_to: 'wants to try' } as const;

/** The profile as text to paste into any AI assistant. */
export function profileAsPrompt(p: EchoProfile, opts: { includeArea: boolean; includePicks: boolean }): string {
  const lines = ['Here is my taste profile from Echo. Use it when you recommend anything to me.', ''];
  if (p.summary) lines.push(`Summary: ${p.summary}`);
  if (p.traits?.length) lines.push(`Traits: ${p.traits.join(', ')}`);
  lines.push(`Things I love: ${p.tastes.map((t) => t.entity?.name ?? t.name).join(', ') || 'none yet'}`);
  if (p.activities.length) lines.push(`Activities: ${p.activities.map((a) => `${a.name} (${STATUS[a.status]})`).join(', ')}`);
  if (p.leanings?.length) lines.push(`My taste leans: ${p.leanings.map((l) => l.label).join(', ')}`);
  const prefs = [
    p.preferences.company && `going ${p.preferences.company === 'either' ? 'solo or with people' : p.preferences.company === 'solo' ? 'solo' : 'with people'}`,
    p.preferences.setting && `${p.preferences.setting} places`,
    p.preferences.budget !== undefined && `about $${p.preferences.budget} per outing`,
    p.preferences.maxMiles !== undefined && `within ${p.preferences.maxMiles} miles`,
    ...p.preferences.notes,
  ].filter(Boolean);
  if (prefs.length) lines.push(`Preferences: ${prefs.join('; ')}`);
  if (opts.includePicks && p.alsoLove?.length) lines.push(`Things Echo thinks I'd also love: ${p.alsoLove.map((x) => x.name).join(', ')}`);
  if (opts.includeArea && !p.area.sample) lines.push(`I'm based around: ${p.area.label}`);
  return lines.join('\n');
}

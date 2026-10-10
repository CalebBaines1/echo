// Works out when a plan is for, from what someone typed or said. Plain rules,
// no model: the result shows as a chip the person can tap to change.

import { localDate } from './time';

export type DayPart = 'morning' | 'afternoon' | 'evening' | 'any';

export interface When {
  /** YYYY-MM-DD, local. */
  date: string;
  part: DayPart;
}

/** Start and end of each part of the day, 24-hour. */
export const PART_WINDOWS: Record<DayPart, [string, string]> = {
  morning: ['09:00', '12:00'],
  afternoon: ['12:00', '17:00'],
  evening: ['17:00', '22:00'],
  any: ['09:00', '22:00'],
};

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

function addDays(d: Date, n: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + n);
  return out;
}

function parseDate(date: string): Date {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

function partFrom(text: string): DayPart | undefined {
  if (/\b(tonight|evening|night|after work|dinner|drinks)\b/.test(text)) return 'evening';
  if (/\b(afternoon|lunch|midday)\b/.test(text)) return 'afternoon';
  if (/\b(morning|breakfast|brunch|early)\b/.test(text)) return 'morning';
  return undefined;
}

/**
 * Reads a day and part of day from free text: "tonight", "tomorrow morning",
 * "Tuesday evening", "this weekend", "next Saturday". Null when the text
 * doesn't say.
 */
export function parseWhen(input: string, now = new Date()): When | null {
  const text = input.toLowerCase();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const part = partFrom(text);

  if (/\btonight\b/.test(text)) return { date: localDate(today), part: 'evening' };
  if (/\btoday\b/.test(text)) return { date: localDate(today), part: part ?? 'any' };
  if (/\btomorrow\b/.test(text)) return { date: localDate(addDays(today, 1)), part: part ?? 'any' };

  const day = WEEKDAYS.findIndex((d) => new RegExp(`\\b${d}s?\\b|\\b${d.slice(0, 3)}\\b`).test(text));
  if (day >= 0) {
    let ahead = (day - today.getDay() + 7) % 7;
    // "next Tuesday" on a Tuesday means a week out; otherwise the coming one.
    if (ahead === 0 && /\bnext\b/.test(text)) ahead = 7;
    return { date: localDate(addDays(today, ahead)), part: part ?? 'any' };
  }

  if (/\b(this |the )?weekend\b/.test(text)) {
    const ahead = today.getDay() === 0 ? 0 : (6 - today.getDay() + 7) % 7;
    return { date: localDate(addDays(today, ahead)), part: part ?? 'any' };
  }

  if (part) return { date: localDate(part === 'evening' && now.getHours() >= 20 ? addDays(today, 1) : today), part };
  return null;
}

/**
 * The default when nothing was said: the next free weekend day from Thursday
 * evening on, otherwise the next weekday evening. A full day out always lands
 * on a weekend day.
 */
export function defaultWhen(mode: 'hobby' | 'day' | 'group', now = new Date()): When {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dow = today.getDay();
  const hour = now.getHours();
  const weekendSoon = mode === 'day' || dow === 5 || dow === 6 || dow === 0 || (dow === 4 && hour >= 17);
  if (weekendSoon) {
    if (dow === 6) return { date: localDate(hour < 15 ? today : addDays(today, 1)), part: 'any' };
    if (dow === 0 && hour < 15) return { date: localDate(today), part: 'any' };
    return { date: localDate(addDays(today, (6 - dow + 7) % 7 || 7)), part: 'any' };
  }
  return hour < 16 ? { date: localDate(today), part: 'evening' } : { date: localDate(addDays(today, 1)), part: 'evening' };
}

/** "Tonight", "Tomorrow evening", "Saturday", "Tue, Oct 20 morning". */
export function whenLabel(w: When, now = new Date()): string {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d = parseDate(w.date);
  const days = Math.round((d.getTime() - today.getTime()) / 86_400_000);
  const partWord = w.part === 'any' ? '' : w.part;
  if (days === 0) return w.part === 'evening' ? 'Tonight' : w.part === 'any' ? 'Today' : `This ${partWord}`;
  if (days === 1) return partWord ? `Tomorrow ${partWord}` : 'Tomorrow';
  const name = d.toLocaleDateString('en-US', { weekday: 'long' });
  if (days > 1 && days < 7) return partWord ? `${name} ${partWord}` : name;
  const short = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  return partWord ? `${short}, ${partWord}` : short;
}

export function isWhen(v: unknown): v is When {
  const w = v as When;
  return !!w && /^\d{4}-\d{2}-\d{2}$/.test(w.date) && ['morning', 'afternoon', 'evening', 'any'].includes(w.part);
}

export { parseDate };

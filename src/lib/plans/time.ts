import type { OpeningHours, Weekday } from '@/lib/qloo/types';

export const WEEKDAYS: Weekday[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/** Weekday for a YYYY-MM-DD date, read as a calendar date (no time zone shift). */
export function weekdayOf(date: string): Weekday {
  const [y, m, d] = date.split('-').map(Number);
  return WEEKDAYS[new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay()]!;
}

/** The coming Saturday (or today, if it's Saturday) as YYYY-MM-DD in local time. */
export function nextSaturday(from = new Date()): string {
  const d = new Date(from);
  d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
  return localDate(d);
}

export function localDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** "09:00-17:00, 18:00-22:00", "Closed", or undefined when hours aren't known. */
export function hoursOn(hours: OpeningHours | undefined, day: Weekday): string | undefined {
  const slots = hours?.[day];
  if (!slots) return undefined;
  return slots.length ? slots.join(', ') : 'Closed';
}

function minutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/** Whether a place is open at a time, given hoursOn output. Undefined when unknown. */
export function isOpenAt(hoursThatDay: string | undefined, time: string): boolean | undefined {
  if (!hoursThatDay) return undefined;
  if (hoursThatDay === 'Closed') return false;
  const t = minutes(time);
  return hoursThatDay.split(',').some((range) => {
    const [open, close] = range.trim().split('-');
    if (!open || !close) return false;
    const o = minutes(open);
    let c = minutes(close);
    if (c <= o) c += 24 * 60; // Closes after midnight.
    return (t >= o && t < c) || (t + 24 * 60 >= o && t + 24 * 60 < c);
  });
}

export function formatTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  const hour = ((h ?? 0) + 11) % 12 + 1;
  const suffix = (h ?? 0) < 12 ? 'am' : 'pm';
  return m ? `${hour}:${String(m).padStart(2, '0')}${suffix}` : `${hour}${suffix}`;
}

export function formatDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
}

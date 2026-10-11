import type { OpeningHours, Weekday } from '@/lib/qloo/types';

// Reads the common forms of OpenStreetMap's opening_hours tag, like
// "Mo-Fr 10:00-22:00; Sa,Su 10:00-18:00" or "24/7". Anything fancier
// (holidays, weeks, sunrise) returns undefined: unknown beats wrong.

const DAYS: Array<[string, Weekday]> = [
  ['Mo', 'monday'],
  ['Tu', 'tuesday'],
  ['We', 'wednesday'],
  ['Th', 'thursday'],
  ['Fr', 'friday'],
  ['Sa', 'saturday'],
  ['Su', 'sunday'],
];
const INDEX = new Map(DAYS.map(([abbr], i) => [abbr, i]));
const TIME = /^\d{2}:\d{2}-\d{2}:\d{2}$/;

function days(spec: string): Weekday[] | null {
  const out: Weekday[] = [];
  for (const part of spec.split(',')) {
    const [a, b] = part.split('-');
    const from = INDEX.get(a!);
    const to = b === undefined ? from : INDEX.get(b);
    if (from === undefined || to === undefined) return null;
    for (let i = from; ; i = (i + 1) % 7) {
      out.push(DAYS[i]![1]);
      if (i === to) break;
    }
  }
  return out;
}

export function parseOpeningHours(raw: string | undefined): OpeningHours | undefined {
  const text = raw?.trim();
  if (!text) return undefined;
  if (text === '24/7') return Object.fromEntries(DAYS.map(([, d]) => [d, ['00:00-24:00']]));
  const hours: OpeningHours = {};
  for (const rule of text.split(';').map((r) => r.trim()).filter(Boolean)) {
    const m = rule.match(/^([A-Za-z,-]+)\s+(.+)$/);
    if (!m) return undefined;
    const which = days(m[1]!);
    if (!which) return undefined;
    const spec = m[2]!.trim();
    if (spec === 'off' || spec === 'closed') {
      for (const d of which) hours[d] = [];
      continue;
    }
    const ranges = spec.split(',').map((r) => r.trim());
    if (!ranges.every((r) => TIME.test(r))) return undefined;
    for (const d of which) hours[d] = ranges;
  }
  return Object.keys(hours).length ? hours : undefined;
}

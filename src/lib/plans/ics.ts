// Builds .ics calendar files. Times are "floating" (no time zone), so they
// land at the same clock time in whatever calendar opens them.

export interface CalendarEvent {
  title: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM, 24-hour. */
  time: string;
  durationMinutes?: number;
  location?: string;
  description?: string;
  url?: string;
}

function escape(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

function stamp(date: string, time: string, addMinutes = 0): string {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = time.split(':').map(Number);
  const t = new Date(Date.UTC(y!, mo! - 1, d!, h!, mi! + addMinutes));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}${p(t.getUTCMonth() + 1)}${p(t.getUTCDate())}T${p(t.getUTCHours())}${p(t.getUTCMinutes())}00`;
}

/** Folds lines at 75 characters as the format requires. */
function fold(line: string): string {
  const out: string[] = [];
  let rest = line;
  while (rest.length > 75) {
    out.push(rest.slice(0, 75));
    rest = ` ${rest.slice(75)}`;
  }
  out.push(rest);
  return out.join('\r\n');
}

export function buildIcs(events: CalendarEvent[], uid = () => `${Date.now()}-${Math.random().toString(36).slice(2)}@echo`): string {
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Echo//Plans//EN', 'CALSCALE:GREGORIAN'];
  for (const e of events) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${uid()}`,
      `DTSTAMP:${now}`,
      `DTSTART:${stamp(e.date, e.time)}`,
      `DTEND:${stamp(e.date, e.time, e.durationMinutes ?? 120)}`,
      `SUMMARY:${escape(e.title)}`,
    );
    if (e.location) lines.push(`LOCATION:${escape(e.location)}`);
    if (e.description) lines.push(`DESCRIPTION:${escape(e.description)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

/** Saves the file in the browser. */
export function downloadIcs(filename: string, ics: string) {
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

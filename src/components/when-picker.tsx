'use client';

import { useState } from 'react';
import { localDate } from '@/lib/plans/time';
import { whenLabel, type DayPart, type When } from '@/lib/plans/when';
import { CalendarIcon } from './icons';

const PARTS: Array<{ part: DayPart; label: string }> = [
  { part: 'any', label: 'Any time' },
  { part: 'morning', label: 'Morning' },
  { part: 'afternoon', label: 'Afternoon' },
  { part: 'evening', label: 'Evening' },
];

function quickOptions(now = new Date()): When[] {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const add = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return localDate(d);
  };
  const toSat = (6 - today.getDay() + 7) % 7;
  const out: When[] = [
    { date: add(0), part: 'evening' },
    { date: add(1), part: 'evening' },
    { date: add(toSat), part: 'any' },
    { date: add(toSat + 1), part: 'any' },
  ];
  const seen = new Set<string>();
  return out.filter((w) => !seen.has(`${w.date}${w.part}`) && seen.add(`${w.date}${w.part}`));
}

/** A chip showing when the plan is for. Tapping it opens quick choices plus a date and part of day. */
export function WhenChip({ when, onChange, auto }: { when: When; onChange: (w: When) => void; auto?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="inline-flex cursor-pointer items-center gap-1.5 self-start rounded-full border border-transparent bg-accent-soft px-3 py-1.5 text-sm font-semibold text-accent-text"
      >
        <CalendarIcon className="size-4" />
        {whenLabel(when)}
        {auto && <span className="text-[11px] font-normal opacity-80">· change</span>}
      </button>
      {open && (
        <div className="flex flex-col gap-2 rounded-2xl border border-line bg-surface p-3">
          <div className="flex flex-wrap gap-1.5">
            {quickOptions().map((w) => (
              <button
                key={`${w.date}-${w.part}`}
                type="button"
                onClick={() => {
                  onChange(w);
                  setOpen(false);
                }}
                className="cursor-pointer rounded-full border border-line px-3 py-1.5 text-sm hover:border-accent"
              >
                {whenLabel(w)}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="when-date" className="sr-only">
              Date
            </label>
            <input
              id="when-date"
              type="date"
              value={when.date}
              min={localDate(new Date())}
              onChange={(e) => e.target.value && onChange({ ...when, date: e.target.value })}
              className="rounded-xl border border-line bg-surface px-2.5 py-1.5 text-sm"
            />
            <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Time of day">
              {PARTS.map((p) => (
                <button
                  key={p.part}
                  type="button"
                  role="radio"
                  aria-checked={when.part === p.part}
                  onClick={() => onChange({ ...when, part: p.part })}
                  className={`cursor-pointer rounded-full px-2.5 py-1 text-xs font-semibold ${when.part === p.part ? 'bg-accent text-accent-ink' : 'border border-line'}`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

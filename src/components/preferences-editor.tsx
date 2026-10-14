'use client';

import type { Preferences } from '@/lib/profile/types';
import { Label } from './ui';

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value?: T; options: Array<{ id: T; label: string }>; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label as="p">{label}</Label>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="radiogroup" aria-label={label}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            onClick={() => onChange(o.id)}
            className={`cursor-pointer rounded-xl border px-2 py-2.5 text-sm font-semibold ${value === o.id ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

const DISTANCES = [1, 3, 5, 10, 20];

/** How someone likes to go out: company, setting, budget, distance. Every field is optional. */
export function PreferencesEditor({ value: p, onChange }: { value: Preferences; onChange: (p: Preferences) => void }) {
  const budget = p.budget ?? 150;
  return (
    <div className="flex flex-col gap-3">
      <Segmented
        label="Company"
        value={p.company}
        options={[
          { id: 'solo', label: 'Solo' },
          { id: 'group', label: 'With people' },
          { id: 'either', label: 'Either' },
        ]}
        onChange={(company) => onChange({ ...p, company })}
      />
      <Segmented
        label="Setting"
        value={p.setting}
        options={[
          { id: 'indoor', label: 'Indoors' },
          { id: 'outdoor', label: 'Outdoors' },
          { id: 'either', label: 'Either' },
        ]}
        onChange={(setting) => onChange({ ...p, setting })}
      />
      <div className="flex flex-col gap-1.5">
        <div className="flex items-baseline justify-between">
          <Label as="p">Budget per outing</Label>
          <span className="text-sm font-bold tabular-nums">{budget >= 150 ? 'No limit' : `$${budget}`}</span>
        </div>
        <label htmlFor="budget" className="sr-only">
          Budget per outing in dollars
        </label>
        <input
          id="budget"
          type="range"
          min={0}
          max={150}
          step={5}
          value={budget}
          onChange={(e) => {
            const v = Number(e.target.value);
            onChange({ ...p, budget: v >= 150 ? undefined : v });
          }}
          className="w-full accent-[var(--accent)]"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label as="p">Usual distance</Label>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Usual distance">
          {DISTANCES.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={p.maxMiles === d}
              onClick={() => onChange({ ...p, maxMiles: p.maxMiles === d ? undefined : d })}
              className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-sm font-semibold ${p.maxMiles === d ? 'border-accent bg-accent text-accent-ink' : 'border-line bg-surface'}`}
            >
              {d} mi
            </button>
          ))}
        </div>
        <p className="text-xs text-faint">Echo goes a little farther for something you really want to try, and says so.</p>
      </div>
    </div>
  );
}

import { formatTime } from '@/lib/plans/time';
import type { GroupMember, PlanStop } from '@/lib/plans/types';
import { Card, Why } from './ui';

const PRICE = ['', '$', '$$', '$$$', '$$$$'];

export function StopCard({ stop, label, members }: { stop: PlanStop; label?: string; members?: GroupMember[] }) {
  const meta = [
    stop.hoursThatDay && (stop.hoursThatDay === 'Closed' ? 'Closed that day' : `Open ${stop.hoursThatDay.replace(/-/g, '–')}`),
    stop.priceLevel ? PRICE[stop.priceLevel] : undefined,
    stop.category,
  ].filter(Boolean);
  const fits = members && stop.fit ? members.filter((m) => stop.fit![m.id] !== undefined) : [];
  return (
    <Card>
      <div className="flex items-start justify-between gap-2">
        <p className="text-[0.9rem] font-bold">
          {label ?? (stop.time ? `${formatTime(stop.time)} · ` : '')}
          {stop.name}
        </p>
        {stop.distanceMiles !== undefined && <span className="flex-none text-xs text-faint">{stop.distanceMiles} mi</span>}
      </div>
      {meta.length > 0 && <p className="text-[0.8rem] text-muted">{meta.join(' · ')}</p>}
      {stop.why && <Why>{stop.matchPercent && !fits.length ? `${stop.matchPercent}% match · ${stop.why}` : stop.why}</Why>}
      {fits.length > 0 && (
        <div className="mt-2 flex flex-col gap-1" aria-label="How well this fits each person">
          {fits.map((m) => (
            <div key={m.id} className="flex items-center gap-2 text-[11px]">
              <span className="w-14 truncate text-muted">{m.you ? 'You' : m.name}</span>
              <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunk">
                <span className="block h-full rounded-full bg-accent" style={{ width: `${stop.fit![m.id]}%` }} />
              </span>
              <span className="w-7 text-right text-faint tabular-nums">{stop.fit![m.id]}</span>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

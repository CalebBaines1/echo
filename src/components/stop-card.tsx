import { formatTime } from '@/lib/plans/time';
import type { PlanStop } from '@/lib/plans/types';
import { Card, Why } from './ui';

const PRICE = ['', '$', '$$', '$$$', '$$$$'];

export function StopCard({ stop, label }: { stop: PlanStop; label?: string }) {
  const meta = [
    stop.hoursThatDay && (stop.hoursThatDay === 'Closed' ? 'Closed that day' : `Open ${stop.hoursThatDay.replace(/-/g, '–')}`),
    stop.priceLevel ? PRICE[stop.priceLevel] : undefined,
    stop.category,
  ].filter(Boolean);
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
      {stop.why && <Why>{stop.matchPercent ? `${stop.matchPercent}% match · ${stop.why}` : stop.why}</Why>}
    </Card>
  );
}

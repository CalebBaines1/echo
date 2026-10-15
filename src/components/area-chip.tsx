'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import type { Area } from '@/lib/profile/types';

function PinIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
      <circle cx="12" cy="9.5" r="2.5" />
    </svg>
  );
}

/** Where plans happen. Tapping opens the area picker and comes back here. */
export function AreaChip({ area }: { area: Area }) {
  const path = usePathname();
  const params = useSearchParams();
  const back = params.size ? `${path}?${params}` : path;
  return (
    <Link
      href={`/area?next=${encodeURIComponent(back)}`}
      className={`inline-flex max-w-full min-w-0 items-center gap-1.5 self-start rounded-full border px-3 py-1.5 text-sm font-semibold ${
        area.sample ? 'border-line bg-surface text-muted' : 'border-transparent bg-accent-soft text-accent-text'
      }`}
    >
      <PinIcon className="size-4" />
      <span className="truncate">{area.sample ? area.label.replace(/\s*\(sample\)$/, '') : area.label}</span>
      {area.sample && <span className="flex-none text-[11px] font-normal whitespace-nowrap opacity-80">sample · change</span>}
    </Link>
  );
}

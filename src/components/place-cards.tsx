import type { DroppedOption, PlaceCard } from '@/lib/plans/types';

const PRICE = ['', '$', '$$', '$$$', '$$$$'];

/** Places found during a run. Ruled-out ones fade and show the reason. */
export function PlaceCards({ cards, dropped, picked }: { cards: PlaceCard[]; dropped: DroppedOption[]; picked?: Set<string> }) {
  const reasonFor = (c: PlaceCard) => dropped.find((d) => d.placeId === c.id)?.reason;
  return (
    <ul className="grid grid-cols-1 gap-2" aria-live="polite">
      {cards.map((c) => {
        const out = reasonFor(c);
        const chosen = picked?.has(c.id);
        return (
          <li
            key={c.id}
            className={`flex flex-col gap-0.5 rounded-2xl border px-3 py-2.5 transition-all duration-500 motion-safe:animate-[card-in_0.35s_ease-out] ${
              out ? 'border-line bg-sunk opacity-60' : chosen ? 'border-2 border-echo bg-surface px-[11px] py-[9px]' : 'border-line bg-surface'
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <p className={`text-[0.85rem] font-bold ${out ? 'line-through decoration-warn/70' : ''}`}>{c.name}</p>
              <span className="flex-none text-[11px] text-faint">
                {[c.miles !== undefined ? `${c.miles} mi` : '', c.priceLevel ? PRICE[c.priceLevel] : ''].filter(Boolean).join(' · ')}
              </span>
            </div>
            <p className="text-[11px] text-muted">
              {c.category}
              {c.matchPercent ? ` · ${c.matchPercent}% match` : ''}
            </p>
            {out ? (
              <p className="text-xs font-semibold text-warn">{out}</p>
            ) : chosen ? (
              <p className="text-xs font-semibold text-echo">Echo's pick</p>
            ) : c.reason ? (
              <p className="text-xs text-echo">{c.reason}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

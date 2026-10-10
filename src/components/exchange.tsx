import type { GroupMember, GroupTurn } from '@/lib/plans/types';

const TONES = [
  { bubble: 'bg-accent-soft', name: 'text-accent-text', side: 'self-start' },
  { bubble: 'bg-friend-soft', name: 'text-friend', side: 'self-end' },
  { bubble: 'bg-echo-soft', name: 'text-echo', side: 'self-start' },
];

/** The agents' conversation, one bubble per turn. */
export function Exchange({ members, turns, visible = turns.length }: { members: GroupMember[]; turns: GroupTurn[]; visible?: number }) {
  return (
    <div className="flex flex-col gap-2">
      {turns.slice(0, visible).map((t, i) => {
        const idx = Math.max(0, members.findIndex((m) => m.id === t.memberId));
        const tone = TONES[idx % TONES.length]!;
        const m = members[idx];
        return (
          <p key={i} className={`max-w-[88%] rounded-xl px-3 py-2 text-[0.82rem] leading-snug ${tone.bubble} ${tone.side}`}>
            <span className={`mb-0.5 block text-[10.5px] font-bold tracking-[0.05em] uppercase ${tone.name}`}>{!m ? 'Echo' : m.you ? 'Your Echo' : m.guest ? `Echo for ${m.name}` : `${m.name}'s Echo`}</span>
            {t.text}
          </p>
        );
      })}
    </div>
  );
}

// Small helpers so screens don't show the same things in the same order every time.

/** A repeatable random number generator from a string seed (mulberry32 over a string hash). */
export function seeded(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rand: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/** Shuffles within each group, then deals one from each group in turn, so kinds stay mixed. */
export function interleave<T>(items: readonly T[], groupOf: (t: T) => string, rand: () => number = Math.random): T[] {
  const groups = new Map<string, T[]>();
  for (const t of items) groups.set(groupOf(t), [...(groups.get(groupOf(t)) ?? []), t]);
  const decks = shuffle([...groups.values()].map((g) => shuffle(g, rand)), rand);
  const out: T[] = [];
  while (decks.some((d) => d.length)) for (const d of decks) if (d.length) out.push(d.shift()!);
  return out;
}

/** Today's date as a seed: stable for the day, different tomorrow. */
export const daySeed = (extra = '') => `${new Date().toDateString()}:${extra}`;

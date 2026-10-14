import { describe, expect, it } from 'vitest';
import { interleave, seeded, shuffle } from './variety';

describe('variety', () => {
  it('shuffles the same way for the same seed and keeps every item', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    expect(shuffle(items, seeded('a'))).toEqual(shuffle(items, seeded('a')));
    expect(shuffle(items, seeded('a'))).not.toEqual(shuffle(items, seeded('b')));
    expect([...shuffle(items, seeded('a'))].sort((x, y) => x - y)).toEqual(items);
  });
  it('keeps kinds mixed', () => {
    const items = [...'aaaa'].map((k, i) => ({ k, i })).concat([...'bbbb'].map((k, i) => ({ k, i })));
    const out = interleave(items, (t) => t.k, seeded('x'));
    for (let i = 1; i < out.length; i++) expect(out[i]!.k).not.toBe(out[i - 1]!.k);
  });
});

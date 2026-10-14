import { describe, expect, it } from 'vitest';
import { settle } from './recheck';

describe('settle', () => {
  it('picks the option of the kind they named', () => {
    const out = settle({
      key: 'dune:book',
      name: 'Dune',
      type: 'book',
      status: 'ambiguous',
      options: [
        { id: 'm', name: 'Dune', type: 'movie' },
        { id: 'b', name: 'Dune', type: 'book' },
      ],
    });
    expect(out).toMatchObject({ status: 'matched', entity: { id: 'b' } });
  });
  it('leaves other results alone', () => {
    const t = { key: 'x', name: 'X', type: 'unknown' as const, status: 'not_found' as const };
    expect(settle(t)).toBe(t);
  });
});

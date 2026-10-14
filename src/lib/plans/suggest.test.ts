import { describe, expect, it } from 'vitest';
import { EMPTY_PREFERENCES, SAMPLE_AREA, type EchoProfile } from '@/lib/profile/types';
import { seeded } from '@/lib/variety';
import { exampleRequest, proposalRequest, suggestedRequests } from './suggest';

const profile: EchoProfile = {
  tastes: [{ key: 'severance:tv_show', name: 'Severance', type: 'tv_show', status: 'pending' }],
  activities: [
    { name: 'pottery', status: 'wants_to', hobbyId: 'pottery' },
    { name: 'reading', status: 'does', hobbyId: 'books' },
  ],
  preferences: EMPTY_PREFERENCES,
  area: SAMPLE_AREA,
};

describe('suggestions', () => {
  it('leads with something they want to try, and varies between draws', () => {
    const draws = Array.from({ length: 8 }, (_, i) => suggestedRequests(profile, seeded(String(i))));
    for (const d of draws) {
      expect(d).toHaveLength(3);
      expect(d[0]).toMatch(/pottery/i);
    }
    expect(new Set(draws.map((d) => d.join('|'))).size).toBeGreaterThan(1);
  });
  it('uses their own activities in examples and daily themes', () => {
    expect(exampleRequest(profile, seeded('a'))).toMatch(/pottery|reading/i);
    const themes = new Set(Array.from({ length: 20 }, (_, i) => proposalRequest(profile, seeded(String(i)))));
    expect(themes.size).toBeGreaterThan(2);
  });
});

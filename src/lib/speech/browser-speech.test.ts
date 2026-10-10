import { describe, expect, it } from 'vitest';
import { silenceDelay } from './browser-speech';

describe('silenceDelay', () => {
  it('waits the normal window after a finished thought', () => {
    expect(silenceDelay('I love Severance', 2200)).toBe(2200);
  });

  it('waits longer when the person trails off', () => {
    expect(silenceDelay('Phoebe Bridgers and', 2200)).toBe(4000);
    expect(silenceDelay('probably, um', 2200)).toBe(4000);
    expect(silenceDelay('I like Severance, uh...', 2200)).toBe(4000);
  });
});

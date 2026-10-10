import { describe, expect, it } from 'vitest';
import { costOf } from './prices';

describe('costOf', () => {
  it('prices input, output and cache tokens per model', () => {
    expect(costOf('claude-sonnet-5-5', { input_tokens: 1_000_000, output_tokens: 100_000 })).toBeCloseTo(3, 6);
    expect(costOf('claude-haiku-5-5', { input_tokens: 2000, output_tokens: 400 })).toBeCloseTo(0.0004, 6);
    expect(costOf('claude-sonnet-5-5', { cache_read_input_tokens: 1_000_000, cache_creation_input_tokens: 1_000_000 })).toBeCloseTo(2.7, 6);
  });

  it('charges unknown models at the highest known rate', () => {
    expect(costOf('some-new-model', { output_tokens: 1_000_000 })).toBeCloseTo(20, 6);
  });
});

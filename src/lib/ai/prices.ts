// Dollars per million tokens. Cache writes (5-minute) cost 1.25x input.
// Haiku's cache-read price is assumed at 10% of input.
const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.2 },
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
};
// Unknown models (for example a refusal fallback) are charged at Opus rates to stay on the safe side.
const FALLBACK_PRICE = PRICES['claude-opus-5-5']!;

export interface TokenUsage {
  input_tokens?: number | null;
  output_tokens?: number | null;
  cache_read_input_tokens?: number | null;
  cache_creation_input_tokens?: number | null;
}

export function costOf(model: string, usage: TokenUsage): number {
  const p = PRICES[model] ?? FALLBACK_PRICE;
  const n = (v: number | null | undefined) => v ?? 0;
  return (
    (n(usage.input_tokens) * p.input +
      n(usage.cache_creation_input_tokens) * p.input * 1.25 +
      n(usage.cache_read_input_tokens) * p.cacheRead +
      n(usage.output_tokens) * p.output) /
    1_000_000
  );
}

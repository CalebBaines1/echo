import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { recordSpend } from './spend';

let client: Anthropic | undefined;

/**
 * Records the cost of every Messages API response. Reads the model that
 * actually answered (including refusal fallbacks) and its token usage.
 */
const meteredFetch: typeof fetch = async (input, init) => {
  const res = await fetch(input, init);
  try {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (res.ok && url.pathname === '/v1/messages') {
      const body = await res.clone().json();
      await recordSpend(String(body?.model ?? ''), body?.usage);
    }
  } catch (err) {
    console.error('Couldn’t record model spend', err instanceof Error ? err.message : err);
  }
  return res;
};

/** Shared server-side client. Reads ANTHROPIC_API_KEY from the environment. */
export function getAnthropic(): Anthropic {
  client ??= new Anthropic({ fetch: meteredFetch });
  return client;
}

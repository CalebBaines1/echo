import 'server-only';
import Anthropic from '@anthropic-ai/sdk';

let client: Anthropic | undefined;

/** Shared server-side client. Reads ANTHROPIC_API_KEY from the environment. */
export function getAnthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

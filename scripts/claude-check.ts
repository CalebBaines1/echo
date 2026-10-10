// Confirms the Anthropic API key works by sending one tiny request per model.
// Usage: npm run claude:check [model ...]
// Costs a fraction of a cent. The key is read from .env.local and never printed.

import Anthropic from '@anthropic-ai/sdk';

const models = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5'];

if (!process.env.ANTHROPIC_API_KEY?.trim()) {
  console.error('ANTHROPIC_API_KEY is not set in .env.local.');
  process.exit(1);
}

const client = new Anthropic();
let failed = 0;

for (const model of models) {
  const started = performance.now();
  try {
    const res = await client.messages.create({
      model,
      max_tokens: 1024,
      output_config: { effort: 'low' },
      messages: [{ role: 'user', content: 'Reply with exactly: Echo is connected.' }],
    });
    const ms = Math.round(performance.now() - started);
    if (res.stop_reason === 'refusal') {
      console.log(`✗ ${model}: refused (${res.stop_details?.category ?? 'no category'})`);
      failed++;
      continue;
    }
    const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text.trim()] : [])).join(' ');
    console.log(`✓ ${model}: "${text}" (${ms} ms, ${res.usage.input_tokens} in / ${res.usage.output_tokens} out)`);
  } catch (err) {
    failed++;
    if (err instanceof Anthropic.AuthenticationError) {
      console.log(`✗ ${model}: the API key was rejected (401). Check ANTHROPIC_API_KEY in .env.local.`);
      break;
    } else if (err instanceof Anthropic.PermissionDeniedError) {
      console.log(`✗ ${model}: this key can't use this model (403).`);
    } else if (err instanceof Anthropic.NotFoundError) {
      console.log(`✗ ${model}: model not found (404).`);
    } else if (err instanceof Anthropic.RateLimitError) {
      console.log(`✗ ${model}: rate limited or out of credits (429). Check billing in the Claude Console.`);
    } else if (err instanceof Anthropic.APIError) {
      console.log(`✗ ${model}: API error ${err.status}: ${err.message.slice(0, 200)}`);
    } else {
      console.log(`✗ ${model}: ${(err as Error).message}`);
    }
  }
}

process.exit(failed ? 1 : 0);

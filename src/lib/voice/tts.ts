import 'server-only';
import { getSupabaseAdmin } from '@/lib/supabase/admin';

// OpenAI text-to-speech. gpt-4o-mini-tts is about $0.015 per minute of audio;
// a minute of speech is roughly 900 characters, so charge a safe 2.5e-5 per character.
const MODEL = 'gpt-4o-mini-tts';
const COST_PER_CHAR = 0.000025;
const INSTRUCTIONS =
  'Speak like a warm, thoughtful friend recommending something: relaxed pace, natural pauses, gentle enthusiasm. Never sound like an announcer.';

export const MAX_SPEECH_CHARS = 600;

export function ttsConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}

/** The daily text-to-speech cap in dollars. VOICE_DAILY_BUDGET_USD overrides the $0.10 default. */
export function voiceBudget(): number {
  const v = Number(process.env.VOICE_DAILY_BUDGET_USD);
  return Number.isFinite(v) && v > 0 ? v : 0.1;
}

export const speechCost = (text: string) => text.length * COST_PER_CHAR;

const today = () => new Date().toISOString().slice(0, 10);
const local = new Map<string, number>();

export async function voiceBudgetAllows(estimate: number): Promise<boolean> {
  const db = getSupabaseAdmin();
  if (!db) return (local.get(today()) ?? 0) + estimate <= voiceBudget();
  const { data, error } = await db.rpc('voice_spend_allows', { p_day: today(), p_cap: voiceBudget(), p_estimate: estimate });
  if (error) {
    console.error('Voice spend check failed', error.message);
    return false;
  }
  return data === true;
}

async function recordVoiceSpend(cost: number) {
  const db = getSupabaseAdmin();
  if (!db) {
    local.set(today(), (local.get(today()) ?? 0) + cost);
    return;
  }
  const { error } = await db.rpc('voice_spend_add', { p_day: today(), p_cost: cost });
  if (error) console.error('Recording voice spend failed', error.message);
}

// Recent clips stay in memory on this server instance, so replaying a line is free.
const recent = new Map<string, ArrayBuffer>();
const RECENT_MAX = 40;

/** Speaks text as MP3. Throws if the API call fails. */
export async function synthesize(text: string): Promise<ArrayBuffer> {
  const voice = process.env.VOICE_NAME?.trim() || 'coral';
  const key = `${voice}:${text}`;
  const hit = recent.get(key);
  if (hit) return hit;

  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY!.trim()}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: MODEL, voice, input: text, instructions: INSTRUCTIONS, response_format: 'mp3' }),
  });
  if (!res.ok) throw new Error(`Speech failed with ${res.status}`);
  const audio = await res.arrayBuffer();
  await recordVoiceSpend(speechCost(text));

  recent.set(key, audio);
  if (recent.size > RECENT_MAX) recent.delete(recent.keys().next().value!);
  return audio;
}

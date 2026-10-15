# Echo

**An agent that turns what you love into what you do.** Tap a few favorite shows, songs, books and games, swipe through a few activities, and Echo plans one real thing to do near you, matched to your taste with [Qloo](https://qloo.com). It checks in afterwards and plans the next one better. It can also plan with friends, including friends who don't use Echo.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com).

- **Live app:** https://echo-sigma-plum.vercel.app (no account needed; tap "Try it as Riley" for a ready-made profile)
- **Stack:** Next.js 16, React 19, TypeScript, Tailwind 4, Supabase (Postgres + anonymous auth), Claude (Anthropic API), Qloo, Vercel

## The problem

People know their taste in media precisely and their taste in *going out* barely at all. "What should I do this weekend?" ends in the same three places, or a list of generic "top 10 things to do" that knows nothing about you. Picking up a new hobby is worse: you don't know where to start, what's nearby, or whether you'd like it.

Echo uses the one thing people can describe easily, what they love, and Qloo's cross-domain taste graph to answer the question they can't: where to go, and what to try.

## What it does

| | |
|---|---|
| **Onboarding in about a minute** | Tap titles from a shuffled grid with real cover art; Qloo suggests more as you tap. Add anything missing by typing or speaking. Pick your area. Swipe through activities: want to try, already do, or not for me. |
| **Your echo** | A taste profile written from Qloo's analysis: a summary, traits you can confirm or dismiss, leanings, and picks across film, TV, books, music and podcasts, each with a "because you like…" reason. Shareable as an image. |
| **One thing for you** | Every day home proposes one concrete plan, such as "Tomorrow, 6pm: Halo Pottery". Say "I'm in" or ask for another. |
| **Plans on request** | Ask in your own words ("pottery Tuesday evening, somewhere quiet"). Watch the agent work: places appear as it finds them, and it says what it set aside and why. |
| **The plan** | One pick plus a backup you can swap, hours checked for that day, one-tap calendar (the event carries a check-in link), and a link friends can answer with "I'm in". |
| **Check-ins** | "Did you go?" with quick answers. Echo replies, notes what it learned ("prefers open studio over classes") and suggests what's next. |
| **Six-week hobby plans** | Turn a first visit into dated steps. Each step can find a place for itself, and after each one Echo rewrites the rest based on how it went. |
| **With friends** | Compare tastes (shared ground and differences from Qloo's Analysis Compare), then let each person's Echo talk it over and agree on a plan, scored for every person. Friends without Echo can be added from a few things they love. |
| **Voice** | Talk to Echo on home, in requests and in check-ins. After you speak, it answers out loud in a natural voice. |
| **Use with AI** | Copy your echo as a prompt for any assistant. |

## How Claude and Qloo work together

Claude reasons and writes. Qloo supplies the places and the taste matching. Every recommendation traces back to a Qloo result; the model never invents a place.

**Planning a mission** (`src/lib/plans/planner.ts`). Claude Sonnet runs as a tool-using agent:

1. It reads the request and the profile, then picks three or four place categories to try.
2. `find_places` calls Qloo **Insights** (`filter.type=urn:entity:place`, a category tag, the person's taste entities as signals, `feature.explainability`). It returns nearby places ranked by affinity, with *why* each one matches.
3. `search_categories` calls Qloo **Tags** when a request names something outside the known categories.
4. If nothing is close, Echo searches twice as far. If Qloo has nothing at all for a category in that area, real places come from OpenStreetMap instead, clearly labelled and without a taste score.
5. Claude sets options aside with reasons (`rule_out`) and submits a plan (`finish_plan`).
6. Code then checks every place came from a search, that times fit opening hours and the chosen time window, and that what the person asked for wasn't quietly swapped out. Failures go back to Claude to fix.

Every tool call is streamed to the screen as a step and a place card.

**Elsewhere:**

- **Onboarding:** Qloo **Search** matches tapped and typed titles to entities. Qloo **Insights** (cross-domain recommendations) powers "Echo thinks you'll like". Claude Haiku extracts titles and activities from free text.
- **Your echo:** Qloo Insights and tag data give the leanings and picks. Haiku writes the summary and traits.
- **Groups:** Qloo **Analysis Compare** finds shared ground and differences. Places are searched with everyone's signals, and each person's fit is estimated from Qloo's explainability (whose tastes drove the match). Sonnet writes the exchange between Echos from that score table.
- **Check-ins and hobby plans:** Haiku, grounded in the places from the original plan.

Models are chosen per agent in `src/lib/ai/models.ts`: Sonnet where reasoning matters, Haiku where speed and cost matter. Structured outputs are used throughout.

## Architecture

```
Browser (Next.js client)          Vercel (Next.js API routes)               Services
─────────────────────────         ────────────────────────────              ─────────────────
Onboarding, home, plans,   ──▶    guard: session, per-user limits,   ──▶   Claude (Sonnet, Haiku)
friends, check-ins                global daily spend cap                    Qloo API
localStorage + sync        ──▶    planner / group / coach agents     ──▶   OpenStreetMap (Overpass, Nominatim)
Web Speech (listen)               Qloo client: cache, budget,               OpenAI TTS (Echo's voice)
                                  rate limiting                       ──▶   Supabase Postgres
```

- **Qloo client** (`src/lib/qloo`): every response is cached in Postgres and shared across serverless instances. Live calls are spaced to Qloo's 5-per-second limit and retried once on errors, and identical concurrent requests share a call. A daily cap and a monthly reserve stop spending before the quota runs out. Without `QLOO_LIVE=1` the client only serves the cache, so development never spends quota by accident.
- **Guardrails** (`src/lib/api/guard.ts`, `src/lib/ai/spend.ts`):
  - Every API route checks the session and a per-user daily limit.
  - Claude cost is metered from real token usage and checked against a global daily budget before work starts.
  - Speech has its own budget.
- **Data:** anonymous Supabase accounts, so there's no sign-up. Data is held per user under row-level security, and "Start over" deletes everything. Location is rounded to about a kilometre before it's stored.
- **Cover art** comes from Qloo, then from Apple, Open Library and Wikipedia at view time. No images are stored.

## Run it locally

Requires Node 22+.

```bash
npm install
cp .env.local.example .env.local
npm run dev
```

Then fill in `.env.local`:

- `ANTHROPIC_API_KEY`
- `QLOO_API_KEY` (hackathon keys work on `https://hackathon.api.qloo.com`)
- Optional: the Supabase keys (without them, data stays in the browser)
- Optional: `OPENAI_API_KEY` for the natural voice (without it, the browser's voice is used)

Live Qloo calls are off by default. Set `QLOO_LIVE=1` to make them; with it off, Echo only uses cached responses and OpenStreetMap.

With Supabase configured, create the tables with:

```bash
npm run db:migrate
```

Checks:

```bash
npm test
npm run typecheck
```

Other scripts: `npm run qloo:probe` (exercises each Qloo endpoint once and saves responses locally), `npm run qloo:seed` (loads those responses into the local cache for offline work), `npm run claude:check` and `npm run db:check`.

Qloo response data stays out of the repo: `results/` and `.cache/` are gitignored.

## Project layout

```
src/app/            screens and API routes (onboarding, home, plan, friends, echo, api/*)
src/lib/qloo/       Qloo client, cache, budget, response normalization
src/lib/plans/      planner agent, group planning, coach, time and calendar helpers
src/lib/profile/    profile building, taste card, background re-checks
src/lib/places/     OpenStreetMap opening-hours parsing
src/lib/ai/         Anthropic client with metered spend, model choices, prices
src/lib/voice/      text-to-speech with its own budget
supabase/migrations Postgres schema, row-level security, RPCs
```

## License

MIT

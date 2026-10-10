# Echo

A voice-first taste agent built on the [Qloo](https://qloo.com) taste graph. Echo learns what you love from a short conversation, then plans hobbies, days out and group plans grounded in real places near you.

Built for the Qloo Agentic Hackathon.

## Status

Pre-build. The first step is validating Qloo's data for Echo's use cases.

## Qloo probe

Checks entity search on spoken names, cross-domain recommendations, hobby places near a location, tags, group signals, Analysis Compare and Trending.

1. Copy `.env.local.example` to `.env.local` and add your `QLOO_API_KEY`.
2. Optionally set `QLOO_BASE_URL` (host only) and `TEST_LAT` / `TEST_LON`.
3. Run:

   ```bash
   npm run qloo:probe
   ```

Raw responses and a `summary.md` are written to `results/<timestamp>/` (gitignored). The key is never logged or saved.

Requires Node 22 or later. No dependencies.

## Qloo client

`src/lib/qloo` wraps the Qloo API for the app and the agent:

- **Offline by default.** Without `QLOO_LIVE=1` the client only serves cached responses and never calls Qloo. Missing requests throw `QlooOfflineError`.
- **Caching.** Every successful response is cached (search 30 days, tags 90 days, insights and compare 7 days, trending 1 day). Offline mode also serves expired entries.
- **Budget.** Live calls stop at `QLOO_DAILY_CAP` per UTC day (default 300) and when Qloo reports `QLOO_MONTHLY_RESERVE` or fewer calls left this month (default 3000, kept for judging).
- **Rate limiting.** Live requests start at least 220 ms apart (Qloo allows 5 per second), with one retry on 429, 5xx and network errors. Identical concurrent requests share one call.
- **Small results.** Responses are normalized into compact place, media, tag, compare and trend shapes for the agent.

To develop offline against real data, load the probe's saved responses into the local cache:

```bash
npm run qloo:seed
```

The cache lives in `.cache/qloo/` and is gitignored. Qloo's hackathon terms don't allow publishing its response data, so never commit `results/` or `.cache/`.

```bash
npm test
npm run typecheck
```

## License

MIT

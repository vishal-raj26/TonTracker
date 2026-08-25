# Telegram Username Valuation Deployment Runbook

## Required services

Run these as three separate Railway services. Never enable more than one worker mode in a service.

1. **Event ingestion**
   - `USERNAME_INGEST_CONTINUOUS=1`
   - `USERNAME_DATABASE_URL=<postgres connection string>`
   - Leave `USERNAME_EVENT_SOURCE_URL` blank to use the built-in Fragment collector.
   - The first run recursively partitions Fragment's completed-sale search, then visits each discovered username's ownership history so the 500-row search cap does not truncate the ledger.
   - After the backfill, the checkpoint switches permanently to a lightweight latest-500 poll every 15 minutes. A new sale reopens only that username's history job.
   - GRAM is converted to USD at each sale timestamp from a historical price series before insertion. Sales without event-time USD evidence are rejected.
   - A custom bridge remains supported through `USERNAME_EVENT_SOURCE_URL`; it must return `{ "events": [...], "nextCursor": "..." }`.

2. **Feature and valuation pipeline**
   - `USERNAME_PIPELINE_CONTINUOUS=1`
   - `USERNAME_DATABASE_URL=<postgres connection string>`
   - This computes deterministic features, queues scores, and refreshes robust sale-only archetype baselines.

3. **Optional semantic enrichment**
   - `USERNAME_SEMANTIC_CONTINUOUS=1`
   - `USERNAME_DATABASE_URL=<postgres connection string>`
   - `USERNAME_SEMANTIC_SERVICE_URL=<internal semantic tagging endpoint>`
   - The endpoint can return tags and classifications only. Price fields are rejected.

## Safety gates

- Use only the verified Telegram Username collection address.
- Fragment is the canonical marketplace source. Keep its parsed raw rows and ownership-history provenance with every event.
- Store listings and bids as market state, never as completed sales or estimator labels.
- Do not use a current, static, or fallback GRAM/USD rate for a historical sale.
- Keep `USERNAME_PORTFOLIO_ESTIMATES_ENABLED=0` during the backfill and validation period.
- Run `npm run backtest:usernames` after the event ledger is backfilled. Enable portfolio inclusion only after the selected confidence threshold passes the backtest.

## App serving behavior

The app resolves both exact NFT-address aliases and normalized usernames to precomputed valuations. A first wallet import never starts historical research. It receives an existing valuation, a conservative precomputed sale-only archetype baseline, or an explicit processing state while the already-running worker computes the exact asset.

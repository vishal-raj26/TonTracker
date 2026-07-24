# Railway Deployment

## Services

Create three Railway services in one project:

1. **TonTrack API**
   - Source: this repo
   - Start command: `npm start`
   - Runs the web app and API.

2. **PostgreSQL**
   - Railway PostgreSQL plugin/service.
   - Exposes `DATABASE_URL`.

3. **Gift Snapshot Cron**
   - Source: this repo
   - Start command: `npm run worker:gift-snapshots:once`
   - Cron schedule: `0 * * * *`
   - Runs once every hour UTC and exits.

4. **Gift Sales Worker**
   - Source: this repo
   - Start command: `npm start`
   - Set `GIFT_SALES_CONTINUOUS=1` only on this service.
   - Use a Railway worker service with no HTTP health check.
   - Continuously stores GiftSatellite recent sales in D1; it must be a separate service from the combo-floor worker.

## Required Variables

Set these on the API service and cron service:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
TONAPI_KEY=your_tonapi_key
DUNE_API_KEY=your_dune_api_key
DUNE_GIFT_MODEL_STATS_QUERY_ID=your_dune_query_id
DUNE_GIFT_COLLECTION_STATS_QUERY_ID=5254340
```

Railway injects `PORT` automatically for the API, so setting it manually is optional.

Set this on the API service:

```env
GIFT_SNAPSHOT_AUTORUN=0
```

Set this only on a dedicated snapshot/worker service:

```env
GIFT_SNAPSHOT_AUTORUN=1
```

Set these only on the dedicated Gift Sales Worker:

```env
GIFT_SALES_CONTINUOUS=1
GIFT_SATELLITE_INIT_DATA=your_telegram_webapp_init_data
GIFT_SATELLITE_TELEGRAM_BOT=gift_satellite_bot
GIFT_SATELLITE_TELEGRAM_APP=sniper
GIFT_SATELLITE_AUTH_REFRESH_MS=600000
TELEGRAM_SESSION=your_saved_telegram_string_session
D1_REGISTRY_URL=https://your-registry.workers.dev
D1_INGEST_SECRET=your_registry_ingest_secret
```

Each cycle first checks the latest page for every collection so new sales continue updating. It then walks each collection's complete chronological history until the 365-day boundary, checkpointing every burst. This is the canonical archive because a current floor registry cannot represent variants that sold but are no longer actively listed. D1 de-duplicates overlapping checkpoint pages by sale ID. Wallet-requested exact collection/model/backdrop scans remain available as an optional catch-up tool, but must never replace chronological coverage. GiftSatellite enforces a maximum page size of 20 and a shared one-request-per-second limit. Tune `GIFT_SALES_BACKFILL_PAGES_PER_COLLECTION`, `GIFT_SALES_REQUEST_INTERVAL_MS`, and `GIFT_SALES_CYCLE_DELAY_MS` only after observing the provider's limits. Set `GIFT_SALES_BACKFILL_MODE=exact` only for a targeted exact-combination run.

Before starting this worker, apply `cloudflare/schema.sql` to a new D1 database. For the existing registry, apply `cloudflare/migrations/0002_gift_sales_backfill.sql` and `cloudflare/migrations/0003_gift_sales_scan_targets.sql`, then deploy `cloudflare/gift-registry-worker.mjs`. The registry exposes exact-combination reads at `/sales`, latest checkpoints at `/sales-state`, historical checkpoints at `/sales-backfill-state`, wallet-priority targets at `/sales-targets`, and coverage through `/stats`.

The public API must not run gift snapshot or xGift attribute collection on startup. Fixed gift attributes and floor snapshots belong in the background worker/registry path so missing Python or scraper failures cannot crash the user-facing app.

## Dune Model Stats

The gift detail screen can show model-level stats when a Dune query is configured:

- model NFT count
- model supply %
- model holder count
- 7D / 30D model activity count
- upgraded/on-chain count

Create a Dune query using:

```text
docs/dune-gift-model-stats.sql
```

Then set `DUNE_API_KEY` and `DUNE_GIFT_MODEL_STATS_QUERY_ID` on the API service. Without these variables, TonTrack still shows model count and supply % from the stored gift attribute registry, but holder/activity/upgraded values remain unavailable instead of being guessed.

## Dune Collection Stats

The gift detail screen can also show collection-level stats when a collection query is configured:

- mint price
- upgraded supply
- unupgraded supply
- total burned
- on-chain holders
- Telegram holders
- total minted

Create a Dune query using:

```text
docs/dune-gift-collection-stats.sql
```

`DUNE_GIFT_COLLECTION_STATS_QUERY_ID` defaults to the public TonTrack-compatible query `5254340`, but it can be overridden if we create a better query later. If a field is not present in the Dune result, TonTrack shows it as unavailable rather than estimating it.

## Snapshot Storage

When `DATABASE_URL` exists, gift floor snapshots are stored in Postgres.

The tables are auto-created by the app, but the schema is also available here:

```text
data/gift-floor-snapshots.schema.sql
```

## Commands

API:

```bash
npm start
```

Hourly gift snapshot job:

```bash
npm run worker:gift-snapshots:once
```

Local long-running worker:

```bash
npm run worker:gift-snapshots
```

Gift sales worker:

```bash
npm run worker:gift-sales
```

One GiftSatellite sales cycle:

```bash
npm run worker:gift-sales:once
```

## Expected Result

- Users do not trigger gift history building.
- The cron job stores one fresh floor snapshot per gift collection every hour.
- Gift detail pages read already-stored graph history instantly.

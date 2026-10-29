# Railway Deployment

## Production Services

The web application and every background responsibility must be separate.
Do not deploy any legacy PostgreSQL worker, hourly snapshot job, Telegram-floor
worker, or second copy of a long-running Gift worker.

| Railway service | Start command | Schedule | Responsibility |
| --- | --- | --- | --- |
| **TonTrack API** | `npm start` | always on | Serves the Mini App and reads prepared D1 materializations only. |
| **Gift floor singleton** | `npm start` + `GIFT_COMBO_CONTINUOUS=1` | always on | Writes complete Thermos floor snapshots and compact seven-day history. |
| **Gift sales singleton** | `npm start` + `GIFT_SALES_CONTINUOUS=1` | always on | Backfills and polls GiftSatellite sales under its durable checkpoint. |
| **DNS D1 cron** | `python -m dns_worker direct-d1-cycle --page-size 25` | every 5 minutes | Seeds verified DNS ownership, then writes compact verified sale evidence. |
| **Username market cron** | `npm run worker:run -- --role username-market` | every 5 minutes | Advances one resumable Fragment market page. |
| **Identity baseline cron** | `npm run worker:run -- --role identity-baselines` | hourly at minute 7 | Rebuilds prepared DNS and Username valuations. |

The DNS service is a separate Python deployment from `dns-worker/`. Deploy it
using `railway up dns-worker --path-as-root --service dns-d1-ingest-cron
--environment production --detach`; deploying it from the repository root can
replace its Python command with the web server.

## Required Variables

Set D1 read credentials on the API service. The API must not run background
scans or carry a PostgreSQL connection string in production.

```env
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

Set these only on the dedicated Gift floor singleton:

```env
GIFT_COMBO_CONTINUOUS=1
D1_REGISTRY_URL=https://your-registry.workers.dev
D1_INGEST_SECRET=your_registry_ingest_secret
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

Each cycle first checks the latest page for every collection so new sales continue updating. It then walks chronological history toward the 365-day boundary, checkpointing every burst. This is the canonical archive because a current floor registry cannot represent variants that sold but are no longer actively listed. D1 de-duplicates overlapping checkpoint pages by sale ID. Wallet-requested exact collection/model/backdrop scans are only catch-up work and never replace chronological coverage. GiftSatellite enforces a maximum page size of 20 and a shared one-request-per-second limit. Tune `GIFT_SALES_BACKFILL_PAGES_PER_COLLECTION`, `GIFT_SALES_REQUEST_INTERVAL_MS`, and `GIFT_SALES_CYCLE_DELAY_MS` only after observing provider limits. Set `GIFT_SALES_BACKFILL_MODE=exact` only for a targeted exact-combination run.

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

## Storage

Cloudflare D1 is the production source of truth for current Gift floors,
seven-day compact history, compact sales, and identity valuations. Do not store
raw scanner payloads or repeated complete snapshots in D1. PostgreSQL is
rollback-only until parity is verified, and no active production worker may
write new valuation data to it.

## Commands

API:

```bash
npm start
```

Gift floor worker:

```bash
npm run worker:gift-combos
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
- One Gift floor singleton publishes complete snapshots and seven-day history.
- One Gift sales singleton preserves 365-day sale evidence under a durable checkpoint.
- Bounded DNS, Username, and baseline crons can resume safely without duplicate workers.
- Gift detail pages read already-stored graph history instantly.
- `GET /api/health` returns the active runtime mode and Railway revision, so a
  Mini App can be checked against the intended deployment before debugging UI
  cache or tunnel issues.

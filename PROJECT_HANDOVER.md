# TonTrack Project Handover

Last updated: June 11, 2026

## Project Overview

TonTrack is a mobile-first TON portfolio tracker intended to become a Telegram Mini App. It combines:

- Native TON and jetton balances
- Token pricing and market statistics
- Telegram collectible gifts
- TON NFT sticker packs
- Wallet transaction activity
- Portfolio allocation and asset-detail views
- Background gift floor/model snapshots for historical charts

Repository: `https://github.com/vishal-raj26/TonTracker`

Active branch: `main`

Read `AGENTS.md` before making changes. It contains the user's scope, accuracy, communication, and token-use rules.

## Architecture

### Frontend

The frontend is a vanilla single-page application:

- `index.html` contains all screen containers, sheets, and navigation.
- `styles.css` contains the complete responsive visual system.
- `app.js` owns state, navigation, rendering, wallet import, fetch orchestration, charts, animations, and interaction logic.
- Screens are shown and hidden using `data-screen-target` attributes rather than a router.

### Backend

`server.js` is a CommonJS Node.js HTTP server that:

- Serves the static frontend.
- Exposes the `/api/*` proxy and aggregation routes.
- Fetches wallet, token, NFT, activity, pricing, and market data.
- Normalizes inconsistent third-party responses.
- Maintains in-memory caches.
- Reads and writes gift-floor history from PostgreSQL when `DATABASE_URL` exists.
- Uses local JSON files as development/fallback storage.

### Background Jobs

Gift history is collected independently of user wallet imports:

- `gift-snapshot-worker.js`: long-running interval worker.
- `gift-snapshot-once.js`: one collection snapshot pass, suitable for Railway cron.
- `gift-model-snapshot-once.js`: model-level floor snapshot pass.

Recommended production arrangement:

1. Railway API service running `npm start`.
2. Railway PostgreSQL service.
3. Railway cron service running `npm run worker:gift-snapshots:once` hourly.

### Main Data Flow

1. User connects with TonConnect or imports a wallet address.
2. `/api/wallet` returns the current account summary and fast wallet data.
3. Token balances/prices, activity, gifts, and stickers hydrate independently.
4. UI shows progressive loading states rather than waiting for every subsystem.
5. Gift and sticker assets are classified using registries and metadata.
6. Gift floor/model prices are resolved by verified market sources and stored snapshots.
7. Derived totals update Home, Allocation, Assets, Analytics, and detail screens.

## Folder Structure

```text
ton-portfolio-ui/
|-- AGENTS.md                         Project working rules
|-- PROJECT_HANDOVER.md               This handover
|-- README.md                         Basic project introduction
|-- RAILWAY-DEPLOYMENT.md             Railway service setup
|-- REPO-PLUGIN-SETUP.md              Repository plugin notes
|-- index.html                        SPA screen markup
|-- styles.css                        Complete UI styling
|-- app.js                            Frontend state and behavior
|-- server.js                         Static server and API aggregation
|-- package.json                      Node scripts and dependencies
|-- railway.json                      Railway deployment configuration
|-- .env.example                      Environment variable template
|-- xgift_bridge.py                   Experimental xGift-compatible bridge/probing
|-- gift-snapshot-worker.js           Continuous gift snapshot worker
|-- gift-snapshot-once.js             Single snapshot run
|-- gift-model-snapshot-once.js       Single model snapshot run
|-- assets/
|   `-- gifts/
|       `-- vintage-cigar/            Verified local layered-media test assets
|-- data/
|   |-- gift-floor-snapshots.schema.sql
|   |-- gift-floor-snapshots.json     Local gift history fallback
|   |-- gift-layer-registry.json      Verified local layered gift media
|   |-- sticker-collections-registry.json
|   |-- telegram-collectibles-registry.json
|   |-- wallet-snapshots.json         Local wallet snapshot data
|   `-- history-cache/                Per-wallet/range history cache files
`-- preview-*.png                     Historical visual QA screenshots
```

Generated logs, tunnel output, probes, previews, and downloaded xGift bundles are development artifacts rather than core application modules.

## Tech Stack

### Runtime

- Node.js
- CommonJS modules
- Native Node `http` and `fetch`
- Python only for the experimental `xgift_bridge.py`

### Frontend

- HTML5
- CSS3
- Vanilla JavaScript
- SVG-generated charts
- Lucide icons via CDN
- TonConnect UI via CDN
- Bodymovin/Lottie runtime loaded on demand
- Google Manrope font

### Packages

- `@ton/core`
- `@tonconnect/ui`
- `pg`

### Infrastructure

- Railway for application hosting
- Railway PostgreSQL for permanent snapshots
- GitHub as deployment source

### External Data Sources

Sources are not equally authoritative. Always match assets by address/ID, never only by name or symbol.

- TonAPI: wallet, NFT, jetton, and transaction data
- TonCenter v3: account and jetton balances/metadata
- TONScan public DYOR endpoints: jetton details/history where available
- STON.fi: token assets and selected market data
- DeDust: token/pool pricing and charts where available
- DexScreener: contract-matched market pairs with liquidity/transaction validation
- CoinGecko: TON and known-token pricing/history
- Thermos: gift and sticker collection/model market data
- xGift endpoints/bridge: gift floor/model enrichment experiments
- see.tg: gift floor/history/sales enrichment where valid
- MRKT: collectible and market enrichment
- Getgems: NFT collection and sales fallback
- stickers.tools, Stickerdom, and Goodies: sticker registry and market metadata
- TONStat: TON network metrics

## Database Schema

Schema source: `data/gift-floor-snapshots.schema.sql`

### `gift_floor_collections`

One row per gift collection.

| Column | Purpose |
|---|---|
| `collection_key` | Normalized primary key |
| `name` | Display name |
| `gift_id` | Marketplace/Telegram gift identifier |
| `recent_sales` | Latest normalized sales JSON |
| `updated_at` | Last collection update |

### `gift_floor_snapshots`

Hourly collection-level market snapshots.

Important fields:

- `sampled_at`
- `floor_ton`
- `floor_usd`
- `ton_usd_rate`
- `source`
- `listed_count`
- `total_supply`
- `opened`
- `onchain`
- `holders`
- `volume_24h_ton`
- `volume_24h_usd`
- `sales_24h`
- `sales_30d`
- `change_24h_pct`
- `period_change_pct`
- `ath_floor_usd`
- `market_updated_at`

Indexed by collection and descending sample time.

### `gift_model_floor_snapshots`

Hourly model-level gift floor snapshots.

Important fields:

- `collection_key`
- `model_key`
- `model_name`
- `sampled_at`
- `floor_ton`
- `floor_usd`
- `ton_usd_rate`
- `source`
- `listed_count`
- `deals_30d`
- `avg_30d_ton`
- `avg_30d_usd`
- `model_count`
- `rarity`
- `market_updated_at`
- `icon_url`
- `animation_url`
- `media_type`

Indexed by collection, model, and descending sample time.

### Local Development Storage

Without `DATABASE_URL`, the app uses JSON/cache files under `data/`. These are not a production substitute for PostgreSQL and may grow or become stale.

## Environment Variables

```env
PORT=5177
TONAPI_KEY=
DATABASE_URL=

GIFT_SNAPSHOT_INTERVAL_MS=3600000
GIFT_SNAPSHOT_UNCHANGED_INTERVAL_MS=82800000
GIFT_SNAPSHOT_RETENTION_DAYS=370
GIFT_SNAPSHOT_DELAY_MS=15000
GIFT_SNAPSHOT_AUTORUN=1

GIFT_MODEL_SNAPSHOT_DELAY_MS=15000
GIFT_MODEL_RETRY_DELAY_MS=120000
GIFT_MODEL_RETRY_COUNT=2
GIFT_MODEL_CHUNK_SIZE=

TON_USD_RATE=
RAILWAY_POSTGRES_VOLUME_MB=500
PYTHON=
TONTRACK_MODE=
```

Notes:

- Railway normally injects `PORT`.
- API and cron services both require `DATABASE_URL`.
- `TONAPI_KEY` is strongly recommended to reduce rate-limit failures.
- Set `GIFT_SNAPSHOT_AUTORUN=0` for a responsive local preview when the separate cron/worker handles snapshots.
- `TONTRACK_MODE=gift-snapshot-worker` runs the server process in worker mode.
- Never commit real secrets.

## API Surface

Main routes in `server.js`:

```text
GET /api/health
GET /api/wallet
GET /api/wallet/activity
GET /api/transaction-detail
GET /api/token-detail-data
GET /api/collectibles
GET /api/nfts
GET /api/collectibles-registry
GET /api/sticker-collections-registry
GET /api/gift-floor-snapshots
GET /api/snapshot-storage-status
GET /api/gift-model-floors
GET /api/collection-floor
GET /api/collectible-floor
GET /api/collection-sales
GET /api/collectible-sales
GET /api/gift-detail-data
GET /api/asset-media
GET /api/wallet/history-status
GET /api/wallet/history
```

Check the route handler before changing request or response fields because `app.js` has many direct consumers.

## Completed Features

### Wallet

- TonConnect integration
- Tonkeeper/MyTonWallet connection entry points
- Read-only wallet address import
- Saved-wallet restoration
- Wallet disconnect and wallet switching
- Wallet-specific state/cache isolation improvements
- Import loader and progressive section hydration

### Home

- Current portfolio total
- Range-aware PnL
- Allocation donut with segment and legend interaction
- Real token-driven best/worst performers
- Recent wallet activity
- Range graph implementation and touch/hover tooltip
- Home entrance animations

The expensive wallet-history loading is currently intentionally paused for the session in `app.js`:

```js
let graphHistoryLoadingPaused = true;
```

Do not re-enable it until the user asks.

### TON Tokens

- Native TON plus jetton balance discovery
- Contract-address-based price matching
- TON pinned first and USDT pinned second
- Filtering of tiny values
- Sorting by value, name, and 24-hour change
- Token logo fallbacks
- Liquidity/transaction safeguards against bogus high-value pairs
- Token detail screen with price graph, metrics, activity, and portfolio share
- Multiple market-data fallbacks

### Activity

- Wallet transaction loading
- Sent/Received/Swap filters
- Search
- Date grouping
- Transaction detail sheet
- Sender/recipient and `.ton` name enrichment
- TONScan links
- Background preloading/caching

### Gifts

- Wallet NFT fetch and Telegram-gift classification
- Trait-based gift recognition using Model + Backdrop + Symbol
- Collection and model grouping
- Incremental floor loading
- Collection/model floor snapshots
- Gift detail page with hero, traits, origin, position, floor chart, demand, sales, and market links
- Same-model grouping, counts, summed values, and individual gift drill-down
- Thermos/xGift/see.tg/MRKT/Getgems integration work

### Stickers

- Wallet NFT fetch
- Registry-backed NFT sticker classification
- Brand grouping
- Search, sorting, and counts
- Sticker market price/floor enrichment
- Sticker detail views
- Registries built from stickers.tools, Stickerdom, Goodies, and other observed sources

### Assets And Analytics

- Dynamic category totals
- Dynamic item counts
- Wallet summary
- Top asset selection
- Token-driven performer cards and analytics synchronization

### Deployment And Persistence

- Railway deployment files
- PostgreSQL snapshot schema
- Hourly snapshot scripts
- Retention/storage policy support
- GitHub remote connected to `vishal-raj26/TonTracker`

## Current Tasks

### Active Task: Verified Layered Gift Media

A one-gift proof of concept is in progress for:

- Collection: Vintage Cigar / Vintage Cigars
- Model: Golden Hour
- Backdrop: Shamrock Green
- Symbol: The Eye

The agreed architecture is:

- Store model animation locally as Lottie JSON.
- Store the symbol locally as PNG.
- Store backdrop as palette/gradient metadata.
- Compose the layers in the app.
- Do not guess or construct remote runtime URLs.
- Unregistered gifts continue using their original static image.

Current files:

```text
assets/gifts/vintage-cigar/models/golden-hour.json
assets/gifts/vintage-cigar/patterns/the-eye.png
data/gift-layer-registry.json
```

The registry currently covers only this verified test. Do not automatically expand it to all gifts without a separate request and a reliable asset-ingestion plan.

### Next Suggested Step

Visually verify the Vintage Cigar layered composition in both:

1. The gift/model card.
2. The gift asset-detail hero.

If correct, design a controlled ingestion process for additional verified model, symbol, and backdrop assets.

## Known Issues

- Third-party collectible APIs are undocumented, inconsistent, rate-limited, or protected by Cloudflare.
- xGift access is experimental and may require the Python bridge or stop working.
- Some gift collections/models still lack trustworthy historical floor data.
- see.tg data must be validated; malformed or scaled values previously produced bogus charts.
- Gift and sticker classification remains registry-dependent for edge cases.
- Sticker market coverage is incomplete across providers.
- Token market data must remain contract-address matched and liquidity validated; symbol matching caused severe bogus values in the past.
- Token detail metrics are not universally available for every jetton.
- Current frontend and backend files are very large, making broad changes risky.
- Several development logs, probes, downloaded bundles, and preview images are present in the repository workspace.
- The root README is outdated and still describes an early prototype.
- Tunnel URLs are temporary and unreliable; Railway should be used for stable access.
- CDN failure can affect Lucide, TonConnect UI, Lottie, or fonts.
- Local server startup can feel blocked if snapshot autorun begins heavy background work.
- No automated test suite currently protects wallet import, pricing, classification, or screen navigation.

## Important Decisions

### Financial Accuracy

- Never show guessed financial values as live.
- Match jettons by master/contract address.
- Select DEX pairs only after validating the exact token address, liquidity, volume, and transactions.
- Hide/reject suspicious illiquid tokens rather than inflating portfolio totals.
- Show loading or unavailable states until verified data exists.

### Gift Floors

- The application registry/snapshot database is the fast read path.
- Snapshot workers update data independently of user activity.
- Reuse one verified collection/model floor for matching wallet holdings.
- Do not fetch the same floor separately for every duplicate gift.
- Model floor and collection floor are different and must not be mixed.

### Gift Media

- Model is the animated layer.
- Backdrop and symbol are static layers.
- Verified assets should be saved locally.
- Runtime-generated remote asset URLs are not trusted.

### NFT Classification

- Telegram gifts require Model + Backdrop + Symbol traits or an explicit trusted registry match.
- NFT stickers use trusted sticker registries/identifiers.
- Ordinary NFTs, game items, gift boxes, badges, domains, and receipts must not be classified as gifts or stickers.

### Loading UX

- List holdings as soon as ownership data is known.
- Load prices progressively.
- Replace stale/zero placeholders with skeletons while verification is active.
- Update totals, allocation, and asset summaries as each verified price becomes ready.

### Portfolio History

- Current-value fetching and historical reconstruction are separate concerns.
- Home wallet-history reconstruction is temporarily paused because it was expensive and slow.
- Do not silently display synthetic history as real history.

## Coding Conventions

- Read `AGENTS.md` before editing.
- Use vanilla JavaScript and existing helper patterns.
- Keep changes tightly scoped.
- Use `apply_patch` for manual edits.
- Prefer `rg` and targeted file ranges.
- Avoid new dependencies unless essential.
- Escape dynamic HTML with the existing `escapeHtml` helper.
- Re-run `window.lucide?.createIcons()` after injecting icon markup.
- Resolve IPFS media through the existing media helpers.
- Keep CSS variables and established classes instead of introducing parallel design systems.
- Do not rename existing functions used across screens.
- Preserve unrelated uncommitted changes.
- Use contract/collection IDs as cache keys where possible.
- Include wallet address in wallet-specific cache/state keys.
- Use skeleton/unavailable states instead of fake values.
- Run focused syntax checks after JavaScript changes:

```powershell
node --check app.js
node --check server.js
```

## Current Git State

There are uncommitted changes. Do not reset or overwrite them.

At handover time, modified/untracked work includes:

```text
M  app.js
M  data/gift-floor-snapshots.schema.sql
M  index.html
M  server.js
M  styles.css
M  xgift_bridge.py
?? AGENTS.md
?? PROJECT_HANDOVER.md
?? assets/
```

Inspect `git diff` before editing files that overlap this work.

## Local Development

```powershell
cd "C:\Users\vishu\Documents\New project\ton-portfolio-ui"
npm install
$env:GIFT_SNAPSHOT_AUTORUN="0"
npm start
```

Open:

```text
http://127.0.0.1:5177/
```

The server binds to `0.0.0.0` and defaults to port `5177`.

## New Chat Startup Prompt

Use this in the next Codex chat:

```text
Open the ton-portfolio-ui workspace. Read AGENTS.md and PROJECT_HANDOVER.md first. Preserve all existing uncommitted changes. Continue from the Current Tasks section, and before editing tell me exactly what you will change in no more than two sentences.
```

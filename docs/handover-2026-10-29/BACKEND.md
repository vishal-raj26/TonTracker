# TonTrack backend and operations handover

> **P0 follow-up:** See [current hardening checkpoint](../P0_HARDENING_CHECKPOINT.md) and [bounded D1 rollout](../D1_BOUNDED_MAINTENANCE_ROLLOUT.md) for subsequent source changes and unresolved production gates. Historical risk statements below do not supersede those records.

Prepared 29 October 2026. Read with [the main handover](PROJECT_HANDOVER_2026-10-29.md) and [generated inventory](INVENTORY.md). Current source and fresh local checks are distinguished from historical deployment descriptions. No production configuration or database was changed during this handover.

## 1. Backend boundaries

The backend is not a single price API. It comprises:

1. A CommonJS Node HTTP application (`server.js`).
2. Provider adapters and canonical ownership/price normalization.
3. Independent DNS and username runtime/estimation modules (`lib/`).
4. A Cloudflare registry/read-model Worker with D1 bindings.
5. A Cloudflare application-edge wrapper around the Node handler.
6. A Cloudflare identity-ingestion Worker with scheduled/manual bounded jobs.
7. Railway Node ingestion services and scheduled roles.
8. A Python DNS ingestion service, plus older/optional semantic and Lake/PostgreSQL code.
9. Local JSON/caches/media registries and research/evaluation tooling.

No dedicated central user-account database is established by this architecture. TON address reads are public-data imports; Telegram identity is separately authenticated. Browser preferences/watchlist are local rather than evidence of a cloud synchronization backend.

## 2. Node server initialization

`server.js` imports Node HTTP, filesystem/path, zlib, URL, child-process and crypto utilities, `@ton/core`, DNS/username runtimes and the local Gift fixture module. It reads `.env` from the configured root without overriding pre-existing process environment. Do not print that file.

Root resolution uses `TONTRACK_ROOT`, otherwise `__dirname` or `process.cwd()` in the bundled edge context. `PORT` defaults to 5177. Revision comes from Railway/build revision variables or `local`; runtime mode defaults to `app-server`.

The Node server binds `0.0.0.0`, not exclusively loopback. `/api/*` goes through `handleApi`; other paths go through special Lottie/manifest handlers or static serving. Requiring the module exposes the handler/runtimes for tests and the edge wrapper; direct startup has mode-dependent behavior. Do not casually import a worker entry point expecting no execution.

Startup can warm identity runtimes and Dune collection stats, with scheduled stats prewarming. Registry preload and legacy Gift snapshot autorun are conditional. The intended production API configuration disables long scans, but source still contains optional worker/preload paths. Review flags rather than assuming a deployment runs only one responsibility.

**Source size/locations:** inventory fingerprints record exact line counts and a 998-entry named-function index across core files. Source locations below should be rediscovered after edits. Graphify confirmed `importWallet()` in `app.js`, `handleApi()` and `walletActivity()` in `server.js`, and the registry/valuation runtime relationships; the graph also includes historical backup files, so live source wins.

## 3. Configured serving topology

### Local

`node server.js` serves HTML/CSS/JS/media and APIs directly. A static-only Python server is not an equivalent development environment.

### Cloudflare app edge

`wrangler-app.jsonc` names `tontrack-app-edge`, entry `cloudflare/tontrack-app-edge.mjs`, with Node compatibility flags and `.edge-static` as `ASSETS` (SPA fallback).

The wrapper uses `httpServerHandler(serverModule.server)`. It configures a service-bound registry fetch and warms DNS/username runtimes, resetting its warm promise on failure so an isolate is not permanently poisoned.

For GET `/api/wallet`, if `HEAVY_API_ORIGIN` is set, it proxies to the configured origin. After receiving the wallet payload it revalues DNS/usernames through edge runtimes, replaces identity arrays and adjusts `summary.identityValueUsd`, `summary.totalUsd` and category counts. It enqueues background identity work through `ctx.waitUntil`. This response transformation is business logic and must be retained or intentionally replaced when moving backends; simply proxying origin JSON is not necessarily equivalent.

Other API paths use the Node-compatible handler. Static paths use `env.ASSETS`. Registry service binding is `REGISTRY_SERVICE` → `tontrack-gift-registry`.

The checked config's heavy origin is `https://tontracker-production-01f4.up.railway.app`; registry/read-model origin is `https://tontrack-gift-registry.vishu-vishal264.workers.dev`. These are public configured addresses, not live-tested deployment guarantees.

**Packaging blocker:** `scripts/build-edge-static-assets.js` recursively removes and recreates `.edge-static`, then copies an explicit frontend list, assets, Chart.js and Lottie. It currently omits `styles-ui-restoration.css` and `styles-reference-ui.css`, although HTML loads both. Both are absent from the existing output. Fix and verify this before any edge frontend rollout; do not execute a deployment merely to test the hypothesis.

### Railway

`railway.json` uses Nixpacks, `npm start`, on-failure restarts with max 10 retries. `npm start` runs `scripts/railway-start.js`, not directly the server.

That launcher selects a bounded dispatched role or a single continuous worker from flags; it rejects multiple simultaneous responsibilities and retired PostgreSQL identity modes. Read its credential/config validation: certain misconfigured requested workers log a warning and select app-server instead. Monitoring must verify actual selected mode, not only service name.

## 4. Wallet import pipeline

Key path: resolve input → canonical address → account + paginated inventory → normalize/merge/reconcile → bounded market enrichment → summary → shared collectible discovery and secondary reads.

`resolveWalletAddress()` handles supported address/name input. `@ton/core` parsing prevents treating arbitrary strings as verified addresses. Keep friendly/raw address equivalence across cache/store keys.

`walletImport()`:

- Starts TonAPI and TON Center account candidates and bounds account presentation.
- Starts both paginated jetton providers concurrently with provider timeouts/retries.
- Immediately attaches a fallback to the optional Tonkeeper image-registry promise, preventing the historical unhandled AbortError crash.
- Normalizes provider response differences, merges by master contract and reconciles prior same-wallet inventory under explicit provider status.
- Removes cached holdings after authoritative fresh empty discovery; retains appropriate same-wallet fallback on failed/partial discovery.
- Enriches prices and optionally resolves the profile name within bounded initial-presentation time.
- Reuses warm collectible cache if available; otherwise starts shared collectible discovery while the client hydrates through `/api/collectibles`.
- Calculates category/identity totals using eligible values, not arbitrary positive fields.

The API may return usable tokens while collectibles are pending. Frontend session completion has its own terminal-state aggregation/failsafe. Do not merge all provider arrays through a single last-response-wins assignment.

`walletNftsByType()` combines direct/indirect and available alternate ownership sources, deduplicates canonical NFTs and classifies using verified collection registries/metadata. Deny registries/patterns exist. Native identity assets use known collection contracts. Generic `classifyCollectible()` and legacy helpers also exist; if changing classification, trace actual call paths and tests rather than improving one unused helper.

`getCollectiblesShared()` and `fetchWalletCollectiblesPayload()` coordinate shared work so Gift/sticker/identity consumers do not each repeat discovery. Price loading and ownership completeness are distinct.

## 5. Token prices and details

The server contains TonAPI rate access, CoinGecko/GeckoTerminal resolution, market/DEX-related evidence, historical prices and detail-stat enrichment. `tokenDetailData()` aggregates supported data for native and jetton consumers. Some query parameters are parsed inside helpers, so the literal route inventory does not describe every accepted token-detail parameter.

`JETTON_QUALITY_RULES` includes source-specific liquidity/volume/transaction checks and stricter checks for huge apparent values. Exact contract association, numeric finiteness, decimals, pricing age and market quality matter. A known ticker or provider-returned numeric price is not sufficient.

Recent accepted-price reuse is exact-master-contract keyed. Tests reject stale/blocked data and same-name/symbol impostors. An unavailable rate must not erase balance ownership or manufacture a peg.

Native currency uses backend TON names and `Ton` field suffixes while UI often says GRAM. Preserve canonical native-payment semantics; a jetton named GRAM is not native.

## 6. Gift floor resolution

### Non-negotiable identity

`collection + model + backdrop`; symbol never selects market floor/history. For example, `giftDetailResponseKey(collection, model, backdrop, symbol, range)` accepts a legacy symbol argument but deliberately omits it from the returned key.

### Prepared read path

Registry lookups resolve exact combo floors, history, model/collection stats and recent sales. `d1RegistryJson()` uses configured/public registry origins, optional proxy fallback, timeouts and a short unavailable-backoff period. Service bindings can avoid public HTTP when configured on edge.

Core functions include `d1GiftComboFloors`, `d1GiftComboHistory`, `d1GiftSales`, `estimatedGiftComboFloorFromRegistry`, `buildGiftDetailResponse`, `assembleGiftDetailResponse`, `giftDetailData` and timeout/stale merge helpers. The inventory provides exact locations.

If exact active listing count is greater than one and the floor passes freshness/verification, it may be used. At `listedCount <= 1` use the supported estimator; if unsupported, remain unavailable. Do not use one sale as a floor or symbol rarity to choose a different price. Older generic sale/floor helpers exist but are not blanket permission to violate current policy.

Batch endpoints accept requested `pairs` and reuse prepared information across holdings. Missing/partial rows can cause healing to be scheduled. The server has legacy provider fallbacks, so the goal of prepared serving is not a proof that every path has zero external provider calls.

### Detail response model

The assembler returns `floor`, `sales`, `salesStats`, `salesScope`, `modelStats`, `collectionStats`, `floorHistory`, `floorHistorySource`, supporting objects (`origin`, `rarity`, `links`, `onchainActivity`) and `partial` / `partialSources`. Empty supporting objects mean unavailable evidence, not zero-valued facts.

Stats and media should enrich without blocking core ownership indefinitely. Same-identity stale response reuse must not cross wallets/traits or turn an obsolete quote into current evidence.

## 7. Gift sales, statistics and media

`scripts/snapshot-gift-combos.js` is the canonical complete-collection Thermos scanner. It groups exact combos, retains unique listing IDs/counts, checkpoints/schedules work and publishes only complete snapshots. Warm/fresh registry coverage can avoid rescans after restart. Keep one owner per source; duplicate singleton workers increase cost and race stale snapshots.

`scripts/snapshot-gift-sales.js` handles GiftSatellite chronological/backfill and latest pages, durable per-collection progress, historical FX and compact ingestion. Provider pacing/page limits described in deployment notes are operational observations, not immutable external contracts. Read current source before changing concurrency.

Dune queries supply collection/model aggregates. `server.js` normalizes multiple possible output column names and can prewarm them. Check configured query IDs, output schema and credential availability separately from Gift floor health.

Layer registry comes from bundled `assets/gift-layer-registry.json`, local/runtime registry paths and verified ingestion tools such as `scripts/ingest-giftchanges-layers.js`. The bundled location protects against a Railway data-volume mount hiding catalog files. Lottie is served same-origin at `/assets/vendor/lottie.min.js`.

Static fallback is required when the exact layered asset is not registered. Symbol PNG/backdrop metadata are artwork only, not price keys. Do not reconstruct remote media URLs from slugs or assume a template asset is licensed for redistribution.

## 8. Sticker pipeline

The server has Thermos sticker collection/character metadata, Stickers.tools market metadata/stats/character-floor reads, Goodies-related collection mapping and Getgems-related NFT metadata. Helpers normalize collection IDs, characters, animated/static artwork and available market intelligence.

Key public reads: `/api/sticker-collections-registry`, `/api/sticker-animation`, `/api/sticker-detail-intel`, plus shared wallet collectibles. Relevant server functions include `thermosSticker...`, `stickersTools...` and sticker normalization/registry builders; use the function index.

Use real collection/character/NFT identity and source coverage. Never reinterpret generic NFTs as stickers or apply the Gift backdrop floor gate to sticker economics without explicit policy.

## 9. Identity valuation runtimes

### Shared infrastructure, separate domains

`createDnsRuntime()` and `createUsernameRuntime()` are created by the server with the prepared valuation-read-model URL. They coordinate cached reads, evidence lookup, stale/version checks, background enrichment and asset-specific publication. `lib/valuation-ledger-client.js` normalizes HTTP access to compact D1 assets, aliases, sales, current market, baselines, valuations and cursor state.

The ledger client batches writes in chunks of 500, alias reads in chunks of 50, and attaches a bearer secret for authorized writes/maintenance. Its default request timeout is 45 seconds; runtime-level deadlines may be shorter. Do not call it from the browser with the ingest secret.

### Username module map

| Responsibility | Files |
|---|---|
| Versions/baseline keys | `lib/username-engine.js` |
| Name normalization and structural taxonomy | `lib/username-structural.js` |
| Fragment parsing/market evidence | `lib/fragment-username-source.js` |
| First-import enrichment | `lib/username-first-import-evidence.js` |
| Canonical settlement evidence | `lib/toncenter-username-settlement-ledger.js` |
| Secondary resale verification | `lib/toncenter-username-secondary-ledger.js` |
| Knowledge/classification | `lib/username-knowledge.js` |
| Comparable selection/trend/own anchors | `lib/username-estimator.js` |
| Ridge/cohort model | `lib/username-learned-model.js` |
| Risk checks | `lib/username-market-risk.js` |
| API/runtime/cache | `lib/username-runtime.js` |
| Public quote/portfolio safety | `lib/username-publication.js` |
| Active-auction verification/nowcast support | `lib/username-auction-state.js`, `lib/username-active-auction-nowcast.js` |
| Legacy storage | `lib/username-store.js` |
| Baseline job | `scripts/refresh-identity-baselines.js` |
| Evaluation | `lib/username-backtest.js`, `scripts/evaluate-username-rebuild.js`, research scripts |

Not every research module in `lib/username-*` is production-wired. Vector retrieval, fusion, compound evidence and numerous candidate evaluators must be classified by actual imports and qualification documents. Their test coverage is not deployment approval.

Publication rejects obsolete, expired, future/undated, nonfinite or unsupported values and conflicting real-NFT identities. Single/batch/detail paths must use the guarded interface, not raw cached values. Market signals expire independently from estimates; seller asks cannot silently become portfolio fair values. Medium/high supported eligibility is different from visible low-confidence indicative information.

Own prior sales are evidence anchors, not perpetual USD minimums. Lower-reliability canonical Fragment-reported completed sales can survive an unavailable chain verifier with honest provenance; they must not be relabeled chain-confirmed. Backtesting admits only strictly earlier evidence and preserves target own history separately from a bounded global market window.

**Do not improve numeric pricing incidentally during a UI/backend migration.** Versions are v25/v15/v5 and premium quality remains unqualified. See main handover and canonical username records for failures, sealed evaluations and separate research scope.

### DNS module map

`lib/dns-engine.js`, `dns-structural.js`, `dns-estimator.js`, `dns-runtime.js`, `dns-store.js`, `dns-historical-rates.js` and `dns-toncenter-ledger.js` cover domain taxonomy, structural/semantic comparable context, verified markets, publication and direct-D1 evidence. Exact module list is in inventory.

DNS uses its own market-v7 model and canonical rules. The optional Python semantic service enriches meaning/embeddings and queues valuations; its design prohibits choosing/writing prices directly. Historic BGE-M3/Qwen3-8B/pgvector references are not proof those paid services are active. Avoid reintroducing request-time inference or PostgreSQL workers simply because old docs describe them.

## 10. Storage and schema map

### Configured D1 bindings

| Binding | Database name in current configuration | Intended role |
|---|---|---|
| `GIFT_REGISTRY` | `tontrack-gift-registry` | Materialized collection/combo registry, history/targets/status |
| `GIFT_SALES_CURRENT` | `tontrack-gift-sales-live` | Current compact sales |
| `GIFT_SALES_2025` | `tontrack-gift-sales-2025` | Historical sales shard |
| `GIFT_SALES_2026` | `tontrack-gift-sales-2026` | Historical sales shard |
| `GIFT_SALES_2026_B` | `tontrack-gift-sales-2026-b` | Historical sales shard |
| `GIFT_SALES_RESERVE_1` | `tontrack-gift-sales-2026-c` | Reserved/routed capacity; exact active use must be checked |
| `GIFT_SALES_ARCHIVE` | `tontrack-gift-sales-current` | Archive/legacy reader |
| `GIFT_SALES_ARCHIVE_2` | `tontrack-gift-sales` | Archive/legacy reader |
| `GIFT_FLOOR_SOURCES` | `tontrack-gift-floor-sources` | Compact source snapshot/history buckets |
| `VALUATION_READ_MODEL` | `tontrack-valuation-read-model` | Identity evidence, baselines and prepared valuation projection |

These are configured bindings, not today's measured database sizes, migration versions or production activity. IDs remain in Wrangler config, not copied as secrets/credentials into this guide.

### Gift tables

- Registry: `gift_combo_collections`, `gift_combo_buckets`, worker status, scan/backfill/estimate-history targets.
- Source/history: `gift_combo_source_buckets`, `gift_combo_history_buckets`, `gift_combo_history_segments`.
- Compact sales: `gift_sale_combos`, `gift_sale_events`; older `gift_sales` and source/checkpoint tables coexist.
- Floor/model snapshot and attribute tables exist in legacy/local schema too.

### Compact identity tables

- `identity_assets`: canonical identity and classification/features.
- `identity_asset_aliases`: canonical address/name/alias bridge.
- `identity_sales`: deduplicated finalized evidence with event-time attribution.
- `identity_current_market`: overwrite-by-key current market with freshness.
- `identity_archetype_baselines`: prepared cohort knowledge.
- `valuation_records`: current versioned published/prepared valuations.
- `valuation_projection_state`, `identity_pipeline_state`: progress/watermarks.
- `identity_storage_policy`: bounded storage/counters/maintenance state.

Relevant D1 schemas are under `cloudflare/`, migrations under `cloudflare/migrations/` and `cloudflare/valuation-read-model-migrations/`. `0002_valuation_read_model_bootstrap.sql` is the documented deployment bootstrap, not merely the standalone schema file. Inventory lists all 79 CREATE TABLE declarations, including repeated/historical definitions. Never infer actual deployed schema from that count.

### Legacy PostgreSQL and local stores

`sql/ton-dns-estimator.sql`, `sql/telegram-username-estimator.sql`, Python sidecar migrations and optional `pg` stores remain. Modern production architecture calls these rollback/reconciliation or retired pathways rather than new serving dependencies. Do not write new data or delete rollback evidence without an approved migration/parity decision.

Local `data/` holds registry JSON, gift layers, wallet snapshots/history cache, model/stat/knowledge caches and locks. Many are ignored. They can affect development output despite not being in GitHub. Local files and service memory are not durable global truth.

R2 is described as optional short-retention raw scanner audit storage. Its current provisioning/use was not verified. D1 should store compact indexed evidence/read models, not repeated raw source payloads or embeddings.

## 11. Worker inventory and scheduling

| Entry | Responsibility | State caveat |
|---|---|---|
| `scripts/snapshot-gift-combos.js --continuous` | Complete Thermos floor snapshots/history | Intended one singleton, not verified running |
| `scripts/snapshot-gift-sales.js --continuous` | GiftSatellite sales/backfill/FX | Intended one singleton, not verified running |
| `scripts/worker-dispatch.js --role gift-floor` | Bounded floor pass | Manual/canary role; not a second continuous source owner |
| `... --role gift-sales` | Bounded sales batch | Same caution |
| `... --role gift-estimate-history` | `server.js` one-shot estimate history | Isolated worker mode |
| `... --role username-market` | One Fragment page/checkpoint | Requires ledger/auth/provider settings |
| `... --role identity-baselines` | Prepared DNS/username baseline/valuation refresh | Avoid repeated full corpus scans |
| Python `dns_worker direct-d1-cycle` | Verified membership seed then bounded completed-sale evidence | Separate Docker/service root |
| `cloudflare/identity-ingestion-edge.mjs` | Scheduled identity/knowledge cycles and authorized triggers | Alternative/parallel deployment exists; verify duplicate ownership |
| Old `gift-snapshot-*.js`, DNS pipeline/rate/semantic and username pipeline scripts | Historical snapshot/PG architecture | Existing npm command is not production recommendation |

Dispatcher roles have a four-minute default hard timeout (`TONTRACK_BOUNDED_TIMEOUT_MS`), terminate child processes and exit nonzero on failure. Continuous scanner roles are explicit exceptions for slow provider-bound work. Preserve durable progress and backoff; do not add unconditional restart loops inside scheduled jobs.

Registry Worker config schedules `17 * * * *`; its code distinguishes daily maintenance windows and checks `GIFT_SALES_CLEANUP_PAUSED`. Identity-ingestion config has `*/5 * * * *` and `* * * * *`: per-minute knowledge cycle versus other identity cycle. A configured schedule is not evidence it is enabled on the account today.

Manual ingestion endpoints include authorized POST `/run/username`, `/run/username-settlements`, `/run/dns`, `/run/refresh`, `/run/knowledge`, `/run/all`; `/health` is separate. `IDENTITY_TRIGGER_SECRET` or ingest secret is expected as bearer auth. These mutate/crawl data and must not be invoked during a read-only status check.

The Python DNS Railway config explicitly starts `python -m dns_worker direct-d1-cycle --page-size 25`, cron `*/5 * * * *`, no restart. Production notes also discuss a smaller page cap for runtime safety. Inspect actual service variables before assuming the command's page size is the effective limit.

**Critical launcher caveat:** `scripts/start-active-local.js` is not a plain neutral dev launcher: it reads Railway Postgres variables via CLI, constructs `DNS_DATABASE_URL`, stops port 5177 and starts a detached server. `npm run dev:active` invokes it. This conflicts with assuming D1-only local execution. Do not run it automatically just because its name says “active”; use normal startup after reviewing the intended environment. No credentials were read through that launcher for this handover.

## 12. D1 incident and maintenance

Historical account exhaustion was traced to rows scanned, not simply database size. Tiny queue result limits still scanned/sorted huge tables. Additional costs came from repeated counts, orphan joins, global ranking/retention deletes and baseline aggregation.

Changes already present: 64-row indexed queue traversal with durable cursors/pending fairness; incoming-key count deltas; reduced full reconciliation cadence; idle-shard orphan-scan avoidance; temporary Gift sales cleanup pause. Remaining baseline/count/retention costs are not certified fixed.

Keep `GIFT_SALES_CLEANUP_PAUSED=1` until an approved bounded cleanup redesign is measured. The pause occurs after some identity maintenance and does not stop all account reads. Do not confuse a daily quota reset with a root fix. Measure indexed plans, per-query rows/run, executions and aggregate account-wide daily consumption—including other projects.

No live Cloudflare analytics or current plan/billing data was fetched for this handover. Historical OAuth permission issues and deployed version IDs are in the D1 checkpoint. Refresh account access through the normal user flow if a future authorized audit requires it.

## 13. API usage map

See [INVENTORY.md](INVENTORY.md) for all 94 extracted literal route branches across app, registry and ingestion Workers. Most app routes after the shared gate are GET; the inventory's broad extraction can also include static routes outside `handleApi`, so verify handler scope before generating a formal spec.

### User-facing application groups

| Group | Routes | Principal inputs/behavior |
|---|---|---|
| Health | `/api/health` | Service/mode/revision/time; not full downstream readiness |
| Wallet | `/api/wallet` | `address`, optional `refresh=1`; may resolve `.ton`, returns account/inventory/summary/status |
| Collectibles | `/api/collectibles`, `/api/nfts` | Canonical address; grouped discovered holdings; separate ownership/pricing state |
| Activity | `/api/wallet/activity`, `/api/transaction-detail` | Address/limit or hash; exact normalized transaction information |
| History | `/api/wallet/history`, `/api/wallet/history-status` | Address/range and job/read state; may return 202/partial |
| Token detail | `/api/token-detail-data` | Helper-parsed native/contract/range inputs; inspect function/tests |
| Telegram | POST `/api/telegram/webapp/assets`, GET `/api/telegram/webapp/file` | Validated initData / signed media ticket payload |
| Gift core | `/api/gift-detail-data` | Wallet/NFT/collection/model/backdrop/range/refresh; legacy symbol/tgauth args exist |
| Gift batching | POST `/api/gift-model-floors/bulk`, `/api/gift-model-stats`, `/api/gift-registry/combos`, `/api/gift-registry/collection-combos` | Bounded requested pairs; exact combo reuse |
| Gift evidence | `/api/gift-registry/history`, `/api/gift-registry/sales` | Collection/model/backdrop/range or limit |
| Legacy/general NFT market | `/api/collection-floor`, `/api/collectible-floor`, `/api/collection-sales`, `/api/collectible-sales` | Asset kind/collection/traits; trace source/price semantics |
| Sticker | `/api/sticker-collections-registry`, `/api/sticker-animation`, `/api/sticker-detail-intel` | Collection/character/sticker identity |
| Identity status | `/api/dns-estimator/status`, `/api/username-estimator/status` | Configuration/runtime state |
| Identity single | `/api/dns-estimator/valuation`, `/api/username-estimator/valuation` | `domain` or `username`; username `evidence=1` detail |
| Identity batch | POST `/api/dns-estimator/valuations`, `/api/username-estimator/valuations` | JSON `addresses`, capped 500; guarded username publication |
| Media | `/api/asset-media`, same-origin Lottie | Proxy/player path; security/allowlist review required before expanding |

Examples using placeholder input (not real credential data):

```text
GET /api/wallet?address=<public-address-or-supported-name>
GET /api/collectibles?address=<canonical-address>
GET /api/username-estimator/valuation?username=<collectible-name>&evidence=1
POST /api/username-estimator/valuations  {"addresses":["<nft-address>"]}
POST /api/telegram/webapp/assets  {"initData":"<fresh-validated-telegram-data>"}
```

Some old GET routes have mutation/refresh semantics, e.g. `gift-floor-snapshots?collect=...`, registry refreshes and `/api/dev/gift-pricing-import-check`. Do not crawl every route as an innocent health audit. Internal registry `/ingest/*`, maintenance and manual run endpoints are operational actions.

Error contracts are not identical: individual valuation may 404 when absent; batch validation returns error plus empty arrays; provider errors often 502; Telegram auth rejection 401; preview non-loopback 403; queued history 202. Preserve the difference between an authoritative empty inventory and an error with an empty fallback array.

## 14. History and activity internals

Wallet activity is normalized from provider transactions/events with exact asset amounts and direction. NFT transfers and economic sales require distinct classification. Transaction detail is keyed by hash. Missing activity is not proof of no holdings.

History includes cache/disk reads, event/transaction reconstruction jobs, range polling and snapshot observations. `approximateWalletHistory()` / `approx-current-holdings` paths still exist. Client `refreshLiveHistory()` recognizes `status:partial` and tracks building versus final. Current enrichment no longer pins a historical endpoint to today's total.

A fresh UI must explicitly choose whether/how reconstructed data is shown. Do not display a reconstructed current-holdings path as verified portfolio observations or derive guaranteed investment performance from changing coverage. Event-time FX remains distinct from today's native conversion.

## 15. Authentication, secrets and security review

### Implemented mechanisms

- Telegram initData validation uses bot-token-derived HMAC-SHA256, sorted check string, timing-safe comparison, required user/hash/auth_date and a 24-hour age check. Review all timestamp/replay expectations before treating this as a full auth audit.
- Telegram media uses server-issued signed/ticketed data and server-side file retrieval, not an exposed bot token.
- Registry/ingestion writes require server-held bearer secrets on protected paths. Verify the authorization boundary for any newly added route.
- JSON body readers have size limits; some identity/auth routes use 64 KiB. Generic body-size code should still be load/security tested.
- Fixture mode is disabled by production/Railway/Cloudflare environment checks and API loopback restriction.

### Newly observed source-level risks, NOT exploited or fixed

**P0 before public origin exposure:** `safeStaticPath()` resolves a path under the repository root and checks string-prefix containment; `serveStatic()` reads that path. The inspected code does not show a dedicated public-file allowlist or dotfile/session denylist. Combined with listening on `0.0.0.0`, this warrants immediate origin/static-serving hardening review. No request for `.env`, `.git`, Telegram sessions or any other secret was made, and production exploitability is not claimed; upstream routing/configuration may differ. Test a hardened allowlist using synthetic sensitive fixtures, not real secrets.

Other review boundaries: wildcard API CORS, public expensive reads/refreshes, URL/media proxy restrictions, forwarded-host/proto trust, future-dated/replayed Telegram sessions, request cancellation/rate limits, and secret-bearing query arguments such as legacy `tgauth`. Do not log full provider/Telegram URLs or tokens during investigation.

Environment names are exported in the inventory; **values are not**. Important families include `TONAPI_*`, `TONCENTER_*`, `DUNE_*`, `TELEGRAM_*`, `D1_*`, `VALUATION_READ_MODEL_URL`, `IDENTITY_TRIGGER_SECRET`, `GIFT_*`, `USERNAME_*`, `DNS_*`, Railway/Cloudflare runtime markers and optional legacy database keys. Not all 232 discovered names are deployment requirements; tests/research/legacy code also contribute names.

`.gitignore` excludes `.env`, some Telegram session/login files, logs, local caches/data JSON and dependencies. `.wrangler/` and `.tmp/` were untracked at inspection, so indiscriminate staging can still leak operational data. Treat ignored files and research/label datasets as separate secure transfer material. Never open a secret merely to prove it exists.

## 16. Development and deployment commands

### Read-only/local checks used for this handover

```powershell
Set-Location 'C:\Users\vishu\Documents\New project\ton-portfolio-chart-platform'
git status --short
git log -8 --oneline
git ls-remote origin HEAD refs/heads/main refs/heads/codex/chart-platform-rebuild
npm test
node --check server.js
node --check app.js
node docs/handover-2026-10-29/build-inventory.cjs
```

Do not confuse the inventory generator with a source-code build: it writes only handover evidence and does not validate deployed API behavior. Source syntax checks and package commands do not prove credentials work.

### Authorized future operations only

- `npm run dev`: Node local app; inspect 5177 and verify markers first/afterward.
- `node scripts/start-gift-price-preview.js`: local fixtures, stops/replaces listener; not live valuation.
- `npm run build:edge`: regenerates `.edge-static`; review the missing-styles defect before relying on it.
- `npm run worker:run -- --role <role>`: runs actual ingestion/computation; may use paid provider/database resources.
- `npm run valuation:export`, baseline/ledger commands: can publish/write state; not diagnostics.
- Wrangler deploy/migration commands and Railway deploy commands: production mutations requiring approved scope and rollback.
- DNS deployment must use the `dns-worker` root/Docker context; deploying repo root to that service can replace Python with the web server.

No production command above was executed for this handover. Retired npm command names still exist; read current dispatch/role guards and modern deployment records before use.

## 17. Tests and backend acceptance

Fresh `npm test`: 452/452 pass on this worktree, under Node v24.13.0/npm 11.6.2. The package declares Node 22.x, so deployment-target compatibility is not certified by this run. Backend-relevant groups cover wallet providers/order/races, registry/schema/queue/storage, historical FX, exact gift identity, preview isolation, cleanup pause, token detail loading, DNS, username runtime/publication/provenance and temporal/candidate research regressions. The inventory lists filenames.

`npm test` does not automatically execute Python DNS/semantic/research tests. Python projects use their own requirements/test structure; do not assume `pyproject.toml` exists. Do not run a historical research evaluator that opens sealed labels or contacts live providers merely because it is called “test”.

Before any backend release require representative exact-identity canaries, relevant focused tests, full Node regression, Python tests where changed, bounded query plans, requested API contract verification, production-mode fixture rejection, static/media/auth security review, build asset parity, migration parity and explicit rollback. Numeric estimator changes additionally require legitimate temporal quality evaluation; unit tests alone are insufficient.

## 18. Troubleshooting decision tree

### “Failed to fetch”

Check listener/active cwd, served markers, health and local error log. Distinguish process exit/unhandled rejection from upstream HTTP failure, auth, CORS or wrong-origin routing. Preserve the optional-image-registry AbortError fix. Do not invent an API key or conclude all pricing is broken from one request.

### Tokens or collectibles disappear

Inspect provider terminal states, pagination, exact addresses, shared collectibles request, same-wallet snapshot fallback and import generation guards. A failed empty array is not authoritative zero ownership. Test both completion orders and a wallet switch during requests.

### Gift value does not load

First establish preview versus live mode. Then exact combo identity, registry availability/freshness/listing count, allowed estimate branch, worker checkpoint and D1 account budget. Check model/collection stats separately. Do not loosen identity/listing requirements to force a number.

### Username value looks wrong

Check NFT/name identity, current model/version, expiry, portfolio eligibility, provenance, comparable timestamps and current-market freshness. Distinguish unsupported indicative display from accepted portfolio contribution. Escalate premium numerical quality as research, not a UI patch.

### Quota keeps returning

Inspect account-wide rows read, query executions, indexed seek versus scan, full counts, baseline sources, cleanup windows and duplicate worker owners. A pause/reset is temporary relief. Read the D1 checkpoint before reenabling maintenance.

### Edge differs from local

Compare actual deployed revision, HTML JS/CSS markers, static manifest, missing assets, environment/bindings and heavy-origin transformation. The known two-stylesheet build omission is a concrete first check. Do not assume a successful deploy command means a complete UI was packaged.

## 19. Remaining backend work / resume boundary

No backend implementation was requested in this session. Highest-risk follow-ups are secure preservation of the worktree; static-serving hardening review before public exposure; missing edge CSS packaging; bounded D1 maintenance; authenticated actual worker/schema/quota inventory; live exact-identity pricing acceptance; and explicit separation of any fresh frontend from legacy approximate-history/placeholder behavior.

Do not auto-resume premium research, paid workers or old PostgreSQL services. Retain the source-of-truth documents, research holdouts and unresolved limitations. The companion source inventory is a map for continuation, not a guarantee that every branch/helper or historical schema is current production architecture.

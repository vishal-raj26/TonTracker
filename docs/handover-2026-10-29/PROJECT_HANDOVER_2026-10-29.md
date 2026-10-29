# TonTrack — complete project handover

> **P0 follow-up:** The original risk findings below are a historical snapshot. Subsequent local security/build/pricing fixes and bounded D1 work are recorded in [P0 hardening checkpoint](../P0_HARDENING_CHECKPOINT.md). Production D1 rollout and account quota acceptance remain incomplete. Read that checkpoint before repeating remediation or deploying.

Prepared **29 October 2026**, Asia/Colombo. This is a repository-grounded engineering and product continuity package, including the backend. It is not a production-readiness certificate.

## 0. How to use this package

Read this document first, then [the backend guide](BACKEND.md), then [the generated inventory](INVENTORY.md). [FILES.md](FILES.md) lists the scoped repository paths, including non-source assets/research artifacts. [snapshot.json](snapshot.json) contains machine-readable evidence and core-file fingerprints. The generator is [build-inventory.cjs](build-inventory.cjs).

The inventory includes literal routes, query-key hints, schema declarations, configuration bindings, package commands, environment-variable **names only**, named functions, first-party source paths and the documentation/research index. This preserves discovery paths for details too extensive to repeat in prose. It is not an OpenAPI specification or a declaration that all historical code is deployed.

See [VERIFICATION.md](VERIFICATION.md) for fresh command results, graph warnings and explicit unverified boundaries.

Evidence labels used here:

- **Current source:** inspected in this worktree on the preparation date.
- **Fresh local check:** actually executed for this handover.
- **Historical checkpoint:** earlier recorded result, not rerun now.
- **User direction:** latest instructions from this conversation, sometimes newer than repository documents.
- **Unverified:** requires further source tracing, real-device/browser testing or authenticated production access.

No single handover can embed every source line, private runtime file, market dataset or external account state. This package therefore combines detailed explanations with a complete scoped source/reference inventory. Secrets, Telegram session contents, wallet-specific payloads and raw database contents are deliberately excluded. Keep the repository and secure runtime backups alongside this document.

## 1. Immediate state and critical warnings

1. **Only active workspace:** `C:\Users\vishu\Documents\New project\ton-portfolio-chart-platform`.
2. **Repository:** <https://github.com/vishal-raj26/TonTracker>.
3. **Current branch:** `codex/chart-platform-rebuild`.
4. **HEAD:** `5d1562ae3d8692cb7409f18b3cb5f5e217817bca`, “Finish TonTrack requirement fixes”, dated 29 August 2026. The commit title does not certify the later worktree.
5. **GitHub branch check:** `origin/codex/chart-platform-rebuild` returned the same SHA through a fresh `git ls-remote`. GitHub's default `main` returned `4555d15ee9575ede7d9bc32b22816cd3072c2b79`. Local `main` is `e82a7f1`; do not assume local main or cached remote refs are current.
6. **Substantial work is NOT in those commits:** before creating this package, Git reported **40 tracked changed paths and 241 untracked status entries**. Untracked directory entries may represent many files; this is not a total file count. `git diff --stat` showed 4,458 insertions / 1,222 deletions in tracked changes. See inventory for the exact snapshot; this package adds further untracked documentation.
7. **Fresh local tests:** `npm test` passed **452/452**, zero skipped/cancelled/failed, using installed **Node v24.13.0 / npm 11.6.2**. Package deployment target is Node 22.x; Node 22 parity was not rerun. Log: `.tmp/handover-tests-20261029.log`. This is functional/source-test evidence, not independent estimator-quality or full visual acceptance.
8. **Fresh local HTTP:** `/` and `/api/health` returned 200 at `http://127.0.0.1:5177/`; every versioned JS/CSS URL in served HTML matched active `index.html`. Health reported `app-server`, revision `local`. No server was restarted for the handover. Health had no `x-tontrack-preview` header; it did not indicate local fixture mode.
9. **Production not checked:** no account-wide Railway/Cloudflare audit, database-content reconciliation, billing/quota check, deployment, worker restart or subscription change occurred for this handover.
10. **Known deployment gap:** `scripts/build-edge-static-assets.js` does not copy the loaded `styles-ui-restoration.css` or `styles-reference-ui.css`. Neither exists in the current local `.edge-static` output. The build deletes/recreates that output, so a manual stale copy is not a fix. Do not claim local/edge visual parity until packaging and served assets are verified. This was documented, not fixed under this documentation-only request.
11. **Pricing caveat:** prior gift UI work used opt-in fixture pricing. Attractive screenshots and “Reference” labels are not proof that production gift pricing recovered.
12. **Valuation caveat:** username integration safety was improved, but premium/current-market valuation accuracy remains unqualified. Do not describe it as “the best estimator”.
13. **Infrastructure caveat:** repeated D1 row-read exhaustion is explicitly unresolved in the latest infrastructure checkpoint. Gift-sales cleanup is temporarily paused in checked-in configuration.
14. **Design caveat:** the latest requested dot-matrix/gradient/Liquid Glass direction is a future brief, not implemented across this repository.
15. **Source-level security review needed:** the Node static handler resolves files under the repository root without an inspected explicit public-file allowlist/dotfile denylist. It binds `0.0.0.0`. Harden/review before exposing the origin; no secret URL was requested and no production exploit is claimed. See backend guide.
16. **Launcher caveat:** `npm run dev:active` calls a script that obtains Railway Postgres variables and injects a DNS database URL. It is not a neutral D1-only launcher. Do not run it automatically; use reviewed normal startup.

## 2. Rules and authority

Read [AGENTS.md](../../AGENTS.md) before editing or running services. It is the operational rulebook.

Priority: latest explicit user direction and safety/accuracy rules → current source, diffs and fresh evidence → feature-specific current checkpoints → older handovers/design plans.

Never edit/run/deploy `ton-portfolio-ui` or another copy without a new explicit workspace instruction. References to that path in README, chart-parity records and old handovers are historical, not authority to use it.

Preserve dirty work. Do not reset, clean, mass-stage or push everything indiscriminately. `.tmp/`, `.wrangler/`, research artifacts, local skills and caches are mixed into the untracked state and need classification before any GitHub backup.

Use vanilla JS/Node/HTML/CSS patterns for changes in this existing app, and `apply_patch` for manual edits. Do not change valuation rules or API contracts merely to accommodate UI styling. A separately authorized fresh rebuild can choose a new stack; the existing-workspace rules do not themselves authorize creating or switching to a new repository.

This handover is not permission to deploy, resume billable workers, migrate/delete stores, upgrade/cancel plans or perform financial transactions. Earlier user authorization allowed username ingestion only in a specific task. Do not reinterpret it as approval to resume every worker. The user previously asked not to cancel the Railway plan.

## 3. What TonTrack is

TonTrack is a mobile-first, read-only, non-custodial portfolio tracker for TON and Telegram assets. It is usable as a web application and integrates with Telegram Mini App identity.

Its product questions are: what do I own, what is it worth based on supported evidence, how is it distributed, what changed, and what evidence explains the value?

It is **not** an exchange, trading terminal, custodial wallet, social feed or AI chatbot. “Swap” in activity is a historical transaction type, not swap execution. External market/explorer links are not execution inside TonTrack.

The `vaulton-portfolio` package name, `vaulton:` storage keys and occasional “Trove” README text are legacy naming. The product name in the active application is TonTrack. Naming inconsistencies should not be mistaken for separate operational products.

## 4. Asset domain and identity

| Asset | Meaning | Important identity/valuation distinction |
|---|---|---|
| Native TON / displayed GRAM | Native network balance | Existing UI uses GRAM as the native label; provider TON/Toncoin aliases are not evidence that an arbitrary jetton is native |
| Jettons | Fungible tokens issued on TON | Master contract identifies the token; names/tickers alone are unsafe |
| Telegram Gifts | Collectible presents, potentially inside Telegram or exported on chain | Collection/model/backdrop controls floor identity; symbol is art/rarity metadata |
| NFT stickers | Collectible sticker assets, not ordinary chat sticker packs | Separate registries, character/collection semantics and pricing from Gifts |
| TON DNS | Collectible `.ton` domains | Verified DNS collection/NFT and normalized domain; DNS-specific evidence/estimator |
| Telegram usernames | Collectible identity assets, not every ordinary account handle | Verified collectible contract/NFT plus normalized username; separate estimator |
| Anonymous numbers | Collectible Telegram numbers, typically +888 | Separate verified collection and market; not a user's SIM number |
| Other NFTs | Unrecognized/other blockchain collectibles | Do not force into Gift/sticker classification; dedicated generic-NFT UX completeness is not established |

Canonical identity-collection raw addresses are declared in `server.js`: DNS `0:b774d95eb20543f186c06b371ab88ad704f7e256130caf96189368a7d0cb6ccf`; usernames `0:80d78a35f955a14b679faa887ff4cd5bfc0f43b4a4eea2a7e6927f3701b273c2`; anonymous numbers `0:0e41dc1dc3c9067ed24248580e12b3359818d83dee0304fabcf80845eafafdb2`.

Raw/friendly TON address forms must canonicalize consistently. Display names, art URLs and symbols are not ownership keys. Collection counts, model counts, minted supply, upgraded supply, listed supply and owners are different metrics. Do not hardcode a current worldwide Gift collection count from earlier chat research.

## 5. Connections and ownership scope

### TON wallet

TonConnect UI supports compatible wallets. There is also read-only address input and supported `.ton` resolution. No seed phrase/private key or movement of funds is required. TonConnect connection state is not equivalent to a persistent multi-wallet aggregation service.

### Telegram

The Mini App supplies `Telegram.WebApp.initData`. The client submits it to `/api/telegram/webapp/assets`; the server validates it and obtains supported Telegram-held assets. Media uses signed/ticketed server URLs. User IDs submitted without validated authentication are not proof of ownership.

The server includes Telegram bot/API integration and session-related configuration. Secure Telegram sessions and provider WebApp auth are operational credentials, not public frontend assets. See backend guide for the boundary; never paste `.telegram-session` or `.env` into a handover or commit.

### Combined state

Wallet-held and Telegram-held assets must retain source identity and deduplicate by verified collectible identity. A wallet import cannot automatically reveal all gifts still held within Telegram. Wallet switching/disconnect must clear obsolete details, caches and in-flight response authority. Do not assume implemented support for arbitrary multi-wallet simultaneous totals or rename/export features merely because an older backlog mentions them.

## 6. Current frontend architecture

- `index.html`: screen containers, navigation, sheets, welcome gate and import overlay.
- `app.js`: state, routes/back stacks, import orchestration, provider-facing API requests, asset normalization/grouping, list/detail rendering, price coverage, watchlist/preferences, media, chart consumers and activity.
- `chart-platform.js`: shared chart presentation/interaction infrastructure. Chart.js is the underlying library; actual readings/labels remain application-controlled.
- `terminal-system.js`: later interaction/presentation layer; inspect before assuming `app.js` alone owns a behavior.
- `styles.css` → `styles-product-v2.css` → `styles-terminal-system.css` → `styles-ui-restoration.css` → `styles-reference-ui.css`: actual loaded stylesheet order. Later ownership selectors override older layers.
- `styles-product-system.css` exists but is **not** in the current loaded stylesheet list. A file existing is not proof it is active.
- `data-ref-owned` marks migrated visual ownership and excludes certain legacy selectors. Removing it can revive older card/layout rules.
- `assets/`: branding, local collectible layers/registry, fonts/media and verified static fallbacks.

This is a vanilla SPA with `data-screen` / `data-screen-target`, not a framework/router project. Dynamic detail modes share containers; 16 static screens do not describe the full nested product. Top-level state is memory plus selected localStorage persistence, not a server-side user account database.

External runtime assets include Google fonts, Lucide and TonConnect CDN scripts, Telegram WebApp JS, Chart.js and a same-origin Lottie player. Telegram Desktop can delay/block third-party CDNs; the local Lottie route exists for that reason. Review offline/CSP/CDN assumptions before a rebuild.

### Current loaded version markers

`styles.css`: `ui-system-20261007-2`; product CSS: `reference-20261007-2`; terminal CSS: `pre-fomo-reference-20261007-2`; restoration CSS: `pre-fomo-20261005-2`; reference CSS: `reference-20261007-13`; chart JS: `reference-20261007-2`; app JS: `reference-20261007-12`; terminal JS: `reference-20261007-2`.

## 7. Existing screen/interaction map — descriptive, not a new design prescription

The following describes this repository. The user does **not** want these screens prescribed to the company designing a fresh product.

| Screen key | Current role and deeper states |
|---|---|
| `home` | Identity/source, current balance/privacy, wallets/refresh, recorded history, featured moving holdings, allocation, Today movers and recent activity |
| `assets` | Six supported category entry points and top asset |
| `tokens` | Native/jetton holdings, summary, sorting, supported detail routes |
| `gifts` | Gift totals, search, sort/filter and grouped inventory; priced coverage |
| `gift-brand` | Collection browsing plus dynamic model-group and individual-item modes |
| `stickers` | Sticker totals, search/filter/sort and collection inventory |
| `sticker-brand` | Collection/brand, character and owned-item exploration |
| `dns` | Verified `.ton` holdings and domain detail |
| `anonymous-numbers` | Collectible numbers and detail |
| `usernames` | Collectible handles, valuation states and explanation detail |
| `analytics` | Current total, observed history, best/weakest/unrealized P&L/snapshot metrics and mix |
| `watchlist` | Saved assets, retained metadata, open/remove; must not contribute to ownership totals |
| `activity` | Summary, search, All/Sent/Received/Swap filters and transaction detail |
| `detail` | Shared dynamic native-token, jetton, Gift, sticker and identity detail families; watchlist/refresh/external actions |
| `wallets` | Connected-source information, connection and management |
| `settings` | Currency USD/GRAM, privacy, refresh preference, credits/disconnect; Price alerts currently navigates to Watchlist, not a push-alert backend |

Nested states that must not be missed: Gift collection → model group → individual Gift; sticker collection → character/owned item; individual Gift/sticker detail; native GRAM and every jetton detail; domain/username/number detail; transaction sheet; wallet source-choice/Telegram/TON/error states; wallet action sheet; token-sort sheet; gift/sticker preview trays and sticker artwork overlay; welcome gate; import overlay.

Gift detail retains compact artwork, traits, valuation/model reference, chart/sales, collection statistics, supply/ownership, demand and origin where data exists. “Quick sell”, P&L, sample prices or generic static HTML must not become financial facts just because a template contains them. Renderers must suppress unsupported fields. Full supported data differs by asset type.

## 8. Import, refresh and cache lifecycle

The main wallet response is intentionally faster than complete enrichment. `server.js:walletImport()` races/settles account providers, paginates jettons, reconciles inventory and enriches pricing with time bounds. `/api/collectibles` is a shared separate discovery request; its results populate Gift/sticker/identity branches.

`app.js` tracks import sessions and wallet keys. Token, collectible, identity and activity completion cannot erase each other's state. Loading, authoritative fresh empty, failed, stale and unavailable are distinct. Same-wallet snapshots can survive failed/partial refreshes; an authoritative empty result must clear obsolete holdings. A response from wallet A cannot mutate wallet B.

There is branded video/logo/progress import UI and a usable-data dismissal failsafe. The user previously complained about premature completion. Tests cover terminal identity/discovery state and order-independent merging, but do not promise that every provider succeeds or every price is available before dashboard access. Inspect actual `importLoader` conditions before changing this tradeoff.

Persistence includes last wallet address, compact wallet snapshot, Gift detail cache, watchlist and privacy/refresh/currency preferences. Preview mode uses a separate namespace. TTLs and exact limits belong to source constants, not prose promises. Cache invalidation must preserve contract identity and prevent stale price revival.

## 9. Financial and history rules

- Ownership does not depend on a verified price. An owned unpriced item still exists.
- `null`/unavailable is not zero. A genuinely measured zero is not a missing value.
- A live floor, estimate, historical sale, seller ask and bid must remain distinct.
- Explicit `portfolioEligible:false` must override a positive numeric field.
- Low-confidence/unsupported identity estimates should not inflate headline totals.
- Totals, allocation bars and currency views must share accepted underlying data and pricing coverage.
- Display precision and compact formatting must not silently change numeric truth; keep exact accessible values.
- Historical sale USD uses event-time FX, not a present-day rate.
- No fabricated live values or a plausible chart synthesized to fill a day-one empty state.
- New users may have insufficient observations; show an intentional no-history state.
- Current-value enrichment must not overwrite a historical point. Pricing-coverage changes are not automatically investment returns.

**Implementation caveat:** the server retains reconstructed/approximate-history helpers and can return `status:partial`, `source:approx-current-holdings`. `refreshLiveHistory()` treats partial data separately. Therefore this codebase must not be described as having only pure observed histories on every API path. Audit selection/labeling before exposing any such path in a fresh frontend. Do not silently relabel an approximation as a recorded observation.

## 10. Backend and deployment overview

See [BACKEND.md](BACKEND.md) for detailed ownership, providers, routes, schemas, workers, auth, caches, configuration and troubleshooting.

```text
Browser / Telegram Mini App
  ├─ local: Node server.js → static frontend + /api/*
  └─ configured edge: Cloudflare app Worker → static ASSETS
       ├─ /api/wallet → Railway heavy origin → edge identity revaluation
       └─ other /api/* → bundled Node-compatible HTTP handler

Application / identity runtimes
  ├─ TON ownership/activity and token-market adapters
  ├─ authenticated Telegram-held inventory
  └─ registry Worker / D1 prepared floor, sales and valuation reads

Independent ingestion / computation
  ├─ Thermos Gift floor singleton
  ├─ GiftSatellite sales singleton
  ├─ Fragment / TON Center identity ingestion
  ├─ Python DNS direct-D1 ingestion
  └─ bounded baseline / valuation refresh → prepared read model
```

This is configured/local-source architecture, not proof that every deployment is running. The Node origin also contains legacy market fallbacks, optional prewarming and old worker modes. The modern goal is prepared reads and separate ingestion, but “no request can ever call a provider” would be an inaccurate absolute.

## 11. Provider map

| Data | Existing integrations | Caveat |
|---|---|---|
| Ownership, balances, transfers, sale-contract evidence | TonAPI, TON Center | Public access exists but rate limits/coverage/verification still matter |
| Native/token rates and chart data | TonAPI rates, CoinGecko/GeckoTerminal, DEX-related evidence | Exact contract, freshness/liquidity and decimal normalization are essential |
| Gift complete listing snapshots | Thermos aggregate listings | Exact combo + stable distinct listing count; incomplete scans cannot replace full snapshots |
| Gift sales | GiftSatellite; legacy other market adapters exist | Event-time USD, durable cursor, source provenance; sales do not become floors |
| Gift model/collection aggregates | Dune | Requires configured queries/auth; aggregate stats are not live listings |
| Gift layers | GiftChanges-derived verified registry and bundled assets | Do not guess remote model/pattern URLs |
| Stickers | Thermos, Stickers.tools, Goodies-related data, Getgems-related metadata | Different collection/character IDs and provider coverage |
| DNS / usernames / anonymous numbers | Fragment and verified blockchain evidence | Transfer/ask/bid/finalized sale are not interchangeable |
| Telegram-held gifts/media | Validated Mini App and Telegram APIs | Separate from on-chain inventory; credentials remain server-side |

These are code integrations, not a guarantee of current access, API stability, commercial rights or active subscriptions. Revalidate authentication/terms before sharing data or replacing a provider.

## 12. Gift contract — do not regress

Canonical market identity is **collection + model + backdrop**. Never add symbol to storage/lookup/display-floor selection or price-series identity. Some API signatures and legacy migration names still contain symbol; their presence does not supersede this rule.

An exact qualifying floor requires more than one active uniquely identified listing. With `listedCount <= 1`, including a missing floor as zero listings, use the supported estimate if available. Never relax the gate to make a UI look populated. A historical sale cannot become a current floor.

Fetch/reuse grouped market information rather than one provider request per owned item. Gift layered rendering uses verified local Lottie model, local PNG symbol and stored backdrop palette. Unregistered gifts retain static art. Gifts, NFT stickers and arbitrary NFTs remain separate.

Complete collection snapshots publish atomically/coherently; partial scans do not erase the previous complete state. History ends when a combination is no longer active rather than extending a stale floor indefinitely. Recent exact-combination sales can fall back to explicitly broader evidence, never undisclosed substitution.

## 13. Username estimator continuity

Read in order: [USERNAME_REBUILD_CHECKPOINT.md](../USERNAME_REBUILD_CHECKPOINT.md) → [USERNAME_IMPLEMENTATION_VERIFICATION.md](../USERNAME_IMPLEMENTATION_VERIFICATION.md) → [TELEGRAM_USERNAME_ESTIMATOR_SOURCE_OF_TRUTH.md](../TELEGRAM_USERNAME_ESTIMATOR_SOURCE_OF_TRUTH.md) → qualification/revised-goal/source-policy documents.

Current source versions: `username-market-v25`, `username-learned-ridge-v15`, `username-calibration-v5`. Numerical valuation uses evidence-led comparables, own-sale history as an anchor rather than permanent floor, trend/structural/semantic context, learned ridge/cohort behavior and uncertainty/publication gates. Baseline and runtime must use the same numerical logic.

Completed safeguards documented in the current integration checkpoint include: finite reliability validation; economic-event deduplication; strictly prior temporal evidence; dated semantic knowledge; retained old own-sale history; canonical contract identity; rejection of ambiguous name-only matches; expiry/version/confidence/eligibility publication guards; independent current-bid/ask freshness; wallet-response isolation; authoritative empty handling. Detail communicates evidence/range/limitations. Passing these tests does not establish premium accuracy.

Historical evaluations used a partial ~340,000-sale Dune export ending July 2025. Recorded 200-case runs had median multiplicative errors of 1.139x/1.084x and range coverage 62.5%/83.5%, but serious premium-segment failures: the spread $100–$500 cohort 9.37x error/21.7% coverage; above $500 about 40.9x/0% on just two examples. These are historical diagnostics, not current-market performance claims.

There are extensive rejected/development modules and sealed prospective evaluations under `research/telegram-usernames`, plus collector/audit/replay scripts. Do not wire a research candidate into production because it looks promising or reopen held-out/reserved outcomes casually. Do not tune to known premium examples. The revised integration scope was verified locally on September 30; the original strongest-estimator objective was not achieved.

Do not restart months of completed research merely because an old handover labels it active. A new research task needs a concrete scope, preserved holdouts, time-aware evaluation and an explicit decision about deployment versus offline work.

## 14. TON DNS continuity

[TON_DNS_VALUATION_SOURCE_OF_TRUTH.md](../TON_DNS_VALUATION_SOURCE_OF_TRUTH.md) and [TON_DNS_ESTIMATOR_IMPLEMENTATION_PLAN.md](../TON_DNS_ESTIMATOR_IMPLEMENTATION_PLAN.md) are canonical DNS records. Read them before changing discovery/classification/pricing/storage/valuation UI. Their older baseline descriptions can predate later compact-D1 implementation; compare current source and production architecture notes.

Core separation: deterministic structure + cached semantic meaning → comparable retrieval → verified market engine → value/range/confidence. Never `LLM → price`. Entity/Wikipedia relevance is not proof of a market premium; verified entity-market evidence must be explicit. Do not transfer username assumptions/prices with a fixed multiplier.

Current DNS engine identifies `dns-market-v7`, calibration `dns-calibration-v1`, features `dns-structural-v1`. Runtime, store, classifier, estimator, market/source and backtest modules are in `lib/dns-*`. The Python DNS worker now has direct-D1 membership and TON Center verified-sale flows; old Lake/PostgreSQL documentation and semantic-worker code remain as historical/optional architecture, not instructions to revive retired services.

## 15. Infrastructure incident and pricing-preview continuity

Read [D1_ROW_READ_CHECKPOINT.md](../D1_ROW_READ_CHECKPOINT.md). Its latest recorded status is **incomplete**: hot queues improved but remaining maintenance exceeded the quota. It is not evidence about today's account usage.

Historical causes included per-minute identity knowledge queues scanning broad ledgers, shard-wide `COUNT(*)`, orphan joins, Gift sales ranking/retention DELETEs and baseline aggregations. Bounded indexed cursor queues and incoming-key accounting were introduced. Later recorded account reads still reached ~15.3M against the then-observed 5M/day free allowance. Verify today's limits/plan separately; do not treat historical allowance as a timeless billing statement.

`wrangler.jsonc` currently sets `GIFT_SALES_CLEANUP_PAUSED=1`. Scheduled compact/legacy gift-sales cleanup returns early; this does **not** pause all ingestion, all identity maintenance or all Cloudflare projects. Stored sales were not deleted by the pause. Historical live version/health claims in the checkpoint are historical only.

User authorized temporary local Gift fixtures to unblock UI work. `lib/gift-price-preview.js` and `scripts/start-gift-price-preview.js` enable them only through opt-in outside production/Railway/Cloudflare, and the server restricts preview requests to loopback. Response clones should not mutate market evidence; browser caches use preview namespaces. UI notice/mock wording was removed at the user's request; absence of a notice is not proof that values are real. `x-tontrack-preview: mock-gift-prices` is an internal diagnostic response header.

The latest inspected server's health response had no preview header. No real wallet/price call was made for this handover, so current Gift price availability is not certified. Restoring scheduled cleanup requires bounded/indexed work and account-wide post-reset verification—not simply flipping the pause flag.

Historical Railway pauses and the separate “usecert alerts” Cloudflare request are mentioned in conversation. Their current account state was not audited. Do not stop unrelated services based on inferred ownership.

## 16. Wallet recovery and remaining operational risks

[WALLET_IMPORT_RECOVERY_CHECKPOINT.md](../WALLET_IMPORT_RECOVERY_CHECKPOINT.md) records a local `Failed to fetch` incident caused by an unhandled AbortError from the optional Tonkeeper image-registry download. The server now attaches its fallback before awaiting required account/inventory work. Public TonAPI discovery is no longer disabled just because no API key is configured.

The historical check returned 45 nonzero jettons with both providers ready, but DNS/username registry reads failed upstream. Do not infer permanent provider availability or fixed collectible pricing from that result. Today's fresh 452-test run includes the recovery/regression suite, not a rerun of that live wallet.

Other current risks: large monolithic source files; accumulating CSS ownership layers; uncommitted integration files; optional provider credentials; stale local snapshots; network/CDN dependencies; side-effecting legacy “read-looking” API endpoints; missing edge CSS packaging; incomplete all-screen visual audit; no new production p95/SLA measurement.

## 17. UI history and latest approved direction

Chronology matters:

1. Earlier Home-consistency work, then actual-device Fomo inspection through scrcpy/ADB. The user prohibited any Fomo transactions or asset movement. Existing observation logs preserve that research; do not claim a new inspection.
2. Multiple redesign/restore iterations followed. The user rejected incremental lighting-only changes and asked for structural work.
3. October 5–7 ten-sheet reference reproduction added measured atlas, Inter/Manrope comparison, layered hero/cards, chart callouts, shared navigation and Home changes. This remained incomplete across nested screens.
4. Latest implemented Home scope: allocation converted to data-synchronized segmented bars; Today reconstructed as a split comparison with percentage then identity; Recent activity became one continuous ledger with a centered empty state. Tests and 320/393px checks are historical in the reference checkpoint.
5. October 28–29 conversation shifts to a **fresh product/design brief for a new implementation**. The user wants product/asset/source information, not a prescribed screen list. A highly experienced company should determine information architecture, flows, navigation and composition.
6. Latest visual direction: **monochrome base + dot-matrix icons and selective prominent numerical typography + purposeful colorful gradients + selective Apple Liquid Glass/material principles**. Not every element should receive every effect. Preserve readable financial values, accessible conventional text, efficient rendering and reduced-motion/transparency fallbacks.

The latest screenshots show dotted icon construction and luminous fitness-style numerical/data treatments. Transfer the visual language, not fitness metrics/features. The earlier Vaulta/Behance reference and ten-sheet dimensions are historical implementation context, not a mandate for the new company's screen structure. A web/Telegram implementation can approximate Liquid Glass; do not call a CSS effect a native Apple API.

**Nothing in the handover request authorizes implementing that rebuild now.** No new repository, final stack decision or new design-system implementation was created in this session. Do not mistake the active app for an implementation of the new dot-matrix/Liquid Glass brief.

## 18. Design and reference artifacts

- `docs/REFERENCE_UI_CHECKPOINT.md`: latest actual local reconstruction state; newest scoped entry wins over older pending text below.
- `docs/REFERENCE_UI_RECONSTRUCTION_PLAN.md`: ten-sheet source register, component atlas/contracts, visual acceptance and nested-state backlog.
- `docs/reference-ui/atlas-spec.json`, generated atlas, analysis files: source measurements/crops.
- `docs/FOMO_MOBILE_OBSERVATION_LOG.md`, `FOMO_PRODUCT_DESIGN_DIRECTION.md`, `FOMO_REDESIGN_CHECKPOINT.md`, `FOMO_REDESIGN_COVERAGE.md`: actual-device research and historical coverage/backlog, not fresh completion evidence.
- `docs/PRODUCT_EXPERIENCE_REBUILD.md`: historical structural decisions; not the latest new-company brief.
- Original October 5 sheets were supplied from `C:/Users/vishu/Downloads/ChatGPT Image Oct 5, 2026, ... PM-1.png` through `... PM-10.png`; see source register for all exact filenames.
- Latest visual-reference attachments are in the user's Temp folder: `codex-clipboard-fae6a542-7e39-4845-8df6-4611db524717.png` and `codex-clipboard-8b7ea647-d64d-4b69-8e69-00222334d680.png`. Temp/download attachments are not portable guaranteed assets. Copy only appropriate authorized references into a new briefing package before relying on their availability.
- Branding includes the import video, welcome images and reference-sheet-derived art. `reference-hero-fold-20261007.png` was a rejected generated draft, not the deployed hero. Reference/source images and third-party artifacts need provenance/licensing review before public reuse; their local presence is not permission to redistribute proprietary assets.

## 19. Tests and verification boundaries

Fresh command: `npm test` → Node `--test test/*.test.js` → **452 pass, zero fail/skip/cancel**, approximately 69.9 seconds test duration. Full log remains local under `.tmp/handover-tests-20261029.log`; package it securely if needed. The handover generator was added after that app-suite run and is syntax/output-checked separately.

Coverage includes wallet token pagination/reconciliation/public access, ordering/isolation/import presentation, Gift registry/storage/media/preview/cleanup pause, shared charts, collectible browsing/preview, identity publication/source/provenance/temporal behavior, DNS, source/static UI contracts and research-module regressions. The generated index lists test paths.

Some tests assert source strings/geometry contracts or VM behaviors. Passing them does not equal screenshot fidelity, accessible end-to-end approval, live data availability, billing safety or statistical valuation quality. Node's main glob does not run Python test files; Python DNS/semantic/research suites were not rerun for this handover. No new device/Fomo/browser visual pass occurred.

Chart/source verification commands exist but can depend on older source snapshots and the forbidden-to-edit old copy. Read `scripts/verify-chart-loc.js`, `scripts/verify-source-untouched.js` and `docs/chart-parity.json` before interpreting their scope; do not blindly run every old command.

## 20. Running locally, safely

From the absolute active workspace:

```powershell
Set-Location 'C:\Users\vishu\Documents\New project\ton-portfolio-chart-platform'
node --version
npm --version
```

`package.json` specifies Node `22.x`, while the inspected machine currently executes Node `v24.13.0` and npm `11.6.2`. Test deployment-target compatibility separately before release. Dependencies are recorded exactly in package/lock and the inventory; no dependency install/upgrade was performed for this handover.

For a server start, inspect the 5177 listener, stop the exact existing listener as required by AGENTS, then start `node server.js` from that absolute directory. Use hidden windows for background helpers. Existing project-local launcher scripts encode workspace checks, but read them before execution. Do not run two servers or a legacy Python static preview from another folder.

Normal mode: `npm run dev` / `node server.js` without Gift preview opt-in. UI fixture mode: `node scripts/start-gift-price-preview.js` (explicitly stops the current 5177 listener and starts the server with local fixture opt-in). This is not production recovery.

After any start, compare the full list of JS/CSS query-version URLs in GET `/` with `index.html`, and check `/api/health`. A TonTrack title or listening PID is insufficient. Then explicitly verify whether preview headers are present before interpreting prices.

## 21. Git preservation and transfer

GitHub alone does not contain this current project state. A fresh clone of main or even the matching feature-branch commit lacks critical local modules, UI styles, tests, checkpoints and research work.

Before transfer:

1. Save a secure filesystem backup of the active workspace and necessary ignored data separately.
2. Review `git diff` and untracked paths against the generated snapshot.
3. Separate first-party code/docs/tests from secrets, `.wrangler` state, `.tmp`, local datasets, caches and proprietary/reference downloads.
4. Ensure all required locally referenced new modules/styles/assets are included in a reviewed integration commit.
5. Do not blindly `git add .`, force-push, reset or merge an old branch.
6. Commit/push only with user authorization. No commit/push/PR occurred for this handover.

`.env`, `.telegram-session`, runtime logs, local market JSON and `node_modules` are ignored, but some other temporary directories are untracked rather than ignored. An ignore rule is not a secret scan. Research data can contain public identities, target labels, wallet information and sealed evaluation material; treat transfer scope deliberately.

## 22. Prioritized remaining work — not an instruction to execute all of it

| Priority | Work | Acceptance evidence needed |
|---|---|---|
| P0 | Preserve current uncommitted state and identify production revision | Reviewed backup/commit; no secrets; remote/local SHA and required-new-file verification |
| P0 | Review/harden origin static-file exposure and operational endpoints | Public asset allowlist, synthetic secret-denial tests and scoped auth/media/CORS checks; do not retrieve real secrets |
| P0 | Fix edge static CSS packaging before any frontend deployment | Loaded local/edge asset manifest parity and rendered verification |
| P0 | Resolve D1 budget/root scans before resuming Gift sales cleanup | Indexed bounded query plans, measured 1h/12h account reads, safe cleanup canary |
| P0 | Distinguish live versus fixture pricing during any acceptance | Mode/header/cache check; real provider/read-model evidence, not UI screenshots alone |
| P1 | Establish new rebuild execution scope | User-confirmed new path/repo, intended platform and backend reuse/replacement boundary |
| P1 | Complete current-app nested visual audit only if continuing that app | All families/states in ledger; responsive/touch/keyboard/back/context checks |
| P1 | Reconcile actual production workers and ownership of account consumers | Authenticated read-only Railway/Cloudflare inventory; no assumed resumptions |
| P1 | Validate pricing freshness/coverage and event-time FX on representative assets | Exact-ID canaries and provenance; no one-item generalization |
| P2 | Username premium/current-market research, if separately requested | Preserved holdouts, representative temporal evaluation, coverage/abstention/range metrics |
| P2 | Consolidate legacy CSS/large modules when scoped | Behavior-preserving tests and actual visual acceptance, not global override patches |

## 23. Exact next-session resume procedure

1. Read AGENTS, this handover and backend guide; inspect current Git state again rather than trusting today's counts.
2. Ask which task is active if the next user message is only “resume”: current-app maintenance, production pricing/quota recovery, or the separately discussed fresh rebuild are different scopes.
3. For username work, start with its dedicated checkpoint and revised-goal/verification boundaries; do not reopen completed research automatically.
4. For DNS work, read both canonical DNS records before any edit.
5. For gift pricing, inspect fixture mode and D1/worker state before diagnosing a visual page as a pricing algorithm failure.
6. For UI brief work, use the latest free-to-design dot-matrix/gradient/selective-glass direction, not the historical mandatory screen list.
7. For running the existing app, preserve wallet state, use only the active directory, verify served markers and test a representative flow.
8. State the scoped edit before making it; verify focused behavior and update the relevant checkpoint. Preserve explicit limitations.

## 24. Primary reading map

| Topic | Read |
|---|---|
| Working rules | `AGENTS.md` |
| Modern storage/worker contracts | `docs/PRODUCTION_DATA_ARCHITECTURE.md`, `RAILWAY-DEPLOYMENT.md` |
| Quota incident and fixtures | `docs/D1_ROW_READ_CHECKPOINT.md` |
| Import crash/recovery | `docs/WALLET_IMPORT_RECOVERY_CHECKPOINT.md` |
| Username continuation | `docs/USERNAME_REBUILD_CHECKPOINT.md`, `USERNAME_IMPLEMENTATION_VERIFICATION.md`, `TELEGRAM_USERNAME_ESTIMATOR_SOURCE_OF_TRUTH.md` |
| Username limitations/holdouts | `docs/USERNAME_ESTIMATOR_QUALIFICATION.md`, `USERNAME_ESTIMATOR_REVISED_GOAL.md`, `USERNAME_MARKET_SOURCE_POLICY.md`, research README and saved protocols |
| DNS contract | `docs/TON_DNS_VALUATION_SOURCE_OF_TRUTH.md`, `TON_DNS_ESTIMATOR_IMPLEMENTATION_PLAN.md` |
| Existing UI continuation | `docs/REFERENCE_UI_CHECKPOINT.md`, `REFERENCE_UI_RECONSTRUCTION_PLAN.md`, atlas |
| Historical Fomo research | observation log, design direction, checkpoint and coverage ledger |
| Old history only | `PROJECT_HANDOVER.md`, `CODEX_HANDOFF.md`, README, early design/product notes |
| Code/API/schema/env/module detail | Companion backend guide and generated inventory |

The inventory indexes additional wallet-idea/contest/competitor reports. Those are research artifacts, not implemented TonTrack features or permission to add them. Existing `xgift-*.js`, probes and external reverse-engineering reports are not canonical first-party architecture and should not be copied into a rebuild as proprietary implementation.

## 25. Handover completion record

This task created documentation and its evidence generator only. No application/backend behavior was intentionally modified, no market data was collected for valuation research, no sealed outcomes opened, and no production resource changed. The backend guide and inventory supplement this document rather than replace the feature source-of-truth records. Any limitations discovered here remain open until separately fixed and verified.

## 26. Local tooling and skills (not production dependencies)

The repository has a Graphify skill at `.codex/skills/graphify/SKILL.md` and UI guidance at `.agents/skills/userinterface-wiki/SKILL.md`. Follow AGENTS for queries and code-graph refreshes. The installed Graphify command was available through `C:/Users/vishu/AppData/Local/Programs/Python/Python311/python.exe -m graphify`, not reliably as a bare PATH command. The pre-handover graph contained 7,360 nodes and includes archived `.tmp` source copies; source paths and freshness must be checked. Optional SQL parsing is absent, so the handover separately inventories SQL definitions from source.

Personal skills live in `C:/Users/vishu/.codex/skills` and `C:/Users/vishu/.agents/skills`; plugin skills come from the Codex plugin cache. Design tools discussed include app-designer, frontend-design, UI/UX guidance and glassmorphism; other local skills include testing/planning/debugging workflows, Scrapling, Hypit and Postiz. Their installation does not make them TonTrack runtime dependencies or authorize using external accounts. These personal folders are not guaranteed to accompany a fresh clone. Reinstall/review only the tools needed for the next scoped task rather than copying all personal configuration, caches or credentials.

The auxiliary `.codex/visualizations/...` workspace from the app is not another active TonTrack repository. Historical scrcpy/ADB access was for observed Fomo product behavior, not permission to decompile or extract proprietary assets. A new designer can use the saved observations without assuming an Android device is still connected.

The handover's AST-only graph refresh completed at 7,990 nodes / 15,938 edges / 481 communities. It warned about absent SQL parser support and changed community labels. It does not semantically index these new handover documents; the explicit links and schema inventory are the continuation source for them.

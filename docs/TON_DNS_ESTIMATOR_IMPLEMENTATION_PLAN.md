# TonTrack TON DNS Estimator: Implementation Plan

Status: Runtime implementation complete; production data backfill and release-gate execution required before broad portfolio enablement

Implementation inventory (2026-08-13):

- `dns-worker/`: verified public TON-lake catalog and market ingestion with durable discovery, leases, dependency watermarks, and poison handling.
- `lib/dns-structural.js`: deterministic all-domain classifier.
- `lib/dns-estimator.js`: robust comparable estimator with ranges and confidence.
- `dns-semantic-worker/`: deterministic enrichment, optional BGE-M3 retrieval records, and selective Qwen3-8B enrichment without price authority.
- `scripts/dns-pipeline-worker.js`: global feature/semantic/valuation orchestration and cached materialized valuations.
- `scripts/dns-rate-worker.js`: observed historical GRAM/USD cache and immutable event-time USD attribution.
- `scripts/dns-backtest.js`: leakage-safe temporal release gate.
- `lib/dns-runtime.js`, `server.js`, and `app.js`: wallet/API/UI hot path.
- `docs/TON_DNS_DEPLOYMENT_RUNBOOK.md`: production service layout and release procedure.

Last reviewed: 2026-08-13

Companion decision record: `docs/TON_DNS_VALUATION_SOURCE_OF_TRUTH.md`

This document translates the TON DNS valuation direction into TonTrack's current Node.js, Railway, PostgreSQL, TonAPI, and wallet-import architecture. It is the implementation checklist for the estimator. Read both documents before changing TON DNS pricing.

## 1. Product Outcome

When a user imports a wallet, every valid TON DNS asset should appear with one of these honest states:

1. `Estimated`: a market-supported estimate, low/high range, and confidence are ready.
2. `Listed`: the current ask is available as separate market evidence alongside the estimate.
3. `Processing`: the domain is valid but its precomputed valuation is not ready yet.
4. `Unavailable`: the NFT is invalid, released, expired beyond the product's ownership rules, or the market ledger cannot support a defensible estimate.

The target experience is:

- DNS ownership arrives through the existing wallet import.
- Pricing is returned from one indexed PostgreSQL batch query.
- No LLM, embedding generation, comparable search, or market-source fetch runs in the user's request.
- A new or stale domain is queued for background work without blocking the portfolio.
- The same domain receives the same valuation in every wallet and on every device for the same estimator version and `asOf` time.

The estimator must not treat an asking price as fair value. It must produce:

```text
estimated GRAM midpoint
+ plausible GRAM range
+ confidence
+ evidence freshness
+ current USD conversion
+ separately labeled current listing, when present
```

## 2. Current TonTrack Baseline

The active implementation already does the following correctly:

- `server.js::identityNftType()` recognizes TON DNS by the verified collection address.
- `server.js::walletNftsByType()` merges TonAPI direct and indirect ownership and deduplicates NFT addresses.
- `server.js::verifiedTonListing()` accepts only a native-currency listing and recognizes the compatibility aliases `GRAM`, `TON`, and `Toncoin`.
- `server.js::identityAssetFields()` attaches the domain name and Getgems link.
- `server.js::getCollectibles()` caches the wallet collectible response for five minutes.
- `server.js::walletImport()` returns DNS under `assets.dns`.
- `app.js::normalizeIdentityAsset()` and `identityAssetValue()` currently count only an exact active listing.
- PostgreSQL access through `pg` and `DATABASE_URL` already exists.
- Railway already separates the app server and long-running gift workers through `scripts/railway-start.js`.

The current gap is precise:

```text
verified active ask -> displayed portfolio value
no ask              -> unavailable
```

That code is a safe listing reader, not a valuation engine. It must remain available as an input signal, but it will stop being the estimator.

## 3. Scope And Coverage

The estimator must route every valid name into a deterministic primary class. Secondary semantic labels may overlap.

| Primary route | Examples | Dominant evidence |
| --- | --- | --- |
| Numeric | `7`, `88`, `1662`, `8888` | Digit count, pattern, cultural signal, numeric sales |
| Short letters | `ai`, `gm`, `ton` | Character scarcity, acronym meaning, short-name sales |
| Alphanumeric | `web3`, `g7`, `ton2026` | Structure plus semantic tokens |
| Dictionary word | `wallet`, `cloud`, `market` | Language, commercial intent, word comparables |
| Compound phrase | `gramdiary`, `tonmarket` | Token meanings, compound quality, category comparables |
| Acronym or abbreviation | `defi`, `nft`, `dao` | Expansion confidence, industry relevance, short-name scarcity |
| Named entity | Person, place, company, product | Entity match plus market evidence |
| Crypto/TON/Telegram term | `wagmi`, `gram`, `jetton` | Ecosystem relevance and category sales |
| Invented/brandable | Pronounceable new word | Brandability, phonetics, similar invented-name sales |
| Multilingual/non-Latin | Cyrillic, Arabic, CJK, mixed scripts | BGE-M3 semantics plus script-specific structure |
| Pattern name | Palindrome, sequence, repeats, keyboard shape | Deterministic pattern scarcity |
| Emoji/symbol or unusual valid label | Valid non-standard labels | Unicode structure and same-script evidence |
| Long/random residual | Weak or ambiguous meaning | Broad length/script baseline with low confidence |

Type routing rules:

- Numeric and short-letter scarcity always outrank semantic similarity.
- A domain can have semantic labels such as `finance`, `gaming`, or `TON` without leaving its structural primary route.
- Unicode normalization, mixed-script detection, and confusable-character flags are mandatory.
- Trademark or celebrity recognition is contextual metadata, not an automatic premium.
- Renewal status and time to release are risk signals, not name-quality signals.
- No route is allowed to fall back to an LLM-generated price.

## 4. Source Trust Hierarchy

### 4.1 Canonical collection and lifecycle

Use the verified TON DNS collection contract and on-chain NFT address as identity. Use official TON Center/TonAPI data for current NFT metadata, ownership, DNS records, and lifecycle checks.

### 4.2 Historical market ledger

Primary backfill source:

- TonAPI's verified collection-item catalog for ownership and canonical DNS identity, plus authenticated Getgems collection history for finalized DNS secondary sales.

The normalized NFT event dataset already distinguishes:

- sale
- auction
- bid
- put on sale
- cancel sale
- transfer
- mint

It also carries NFT address, transaction hash, marketplace, sale contract, GRAM price, timestamp, and ownership fields. This is a stronger foundation than inferring sales from frontend activity.

Validation source:

- Getgems' official public contract repository and supported sale/auction code hashes.

Incremental source:

- Backfill a bounded authenticated Getgems collection-history window, then poll the newest finalized-sale page after the watermark.
- TonAPI event actions may support display and cross-checking, but must not be the sole pricing ledger because its official documentation warns that action structure can change.

### 4.3 Current market evidence

- Current native-GRAM listing from the existing TonAPI NFT item response.
- Verified active Getgems sale/auction contract state when available.
- Verified bids from supported auction contracts.

### 4.4 Exchange rates

- Store native GRAM as the canonical amount.
- Historical event USD uses the GRAM/USD rate at the event time.
- Current estimate USD is calculated from the current GRAM/USD rate at response time.
- Historical USD must never be recomputed with today's rate.

## 5. Service Architecture

```text
TON data lake / chain / TonAPI
             |
             v
  dns-market-worker ----------------------+
             |                            |
             v                            v
  normalized market ledger       current catalog/lifecycle
             |                            |
             +-------------+--------------+
                           v
             deterministic feature worker
                           |
              +------------+-------------+
              |                          |
              v                          v
       BGE-M3 embedding worker     selective Qwen3-8B worker
              |                          |
              +------------+-------------+
                           v
                   DNS valuation worker
                           |
                           v
             precomputed dns_valuations table
                           |
                    one indexed batch query
                           |
                           v
                 existing /api/wallet response
```

Non-negotiable boundary:

```text
User request path = TonAPI ownership + compact D1 valuation lookup + response merge
```

The request path must never call Qwen3-8B, BGE-M3, market-history APIs, Getgems contract scanners, or a full comparable search.

## 6. PostgreSQL Data Model

Use a DNS-specific PostgreSQL database/service. Do not put these records in the gift D1 databases.

### 6.1 `dns_domains`

One row per NFT/domain:

- `nft_address` primary key
- `collection_address`
- `domain_raw`
- `domain_normalized`
- `label_normalized`
- `owner_address` nullable snapshot
- `nft_index`
- `registered_at`
- `last_renewed_at`
- `expires_at`
- `lifecycle_status`
- `metadata_json`
- `first_seen_at`
- `last_seen_at`

Indexes:

- unique normalized domain
- lifecycle status and expiry
- collection and NFT index

### 6.2 `dns_market_events`

Immutable normalized evidence:

- `event_id` primary key
- `nft_address`
- `domain_normalized`
- `event_type`
- `event_time`
- `tx_hash`
- `trace_id`
- `logical_time`
- `marketplace_address`
- `marketplace_name`
- `sale_contract`
- `seller_address`
- `buyer_or_bidder_address`
- `price_nano_gram`
- `price_gram`
- `historical_usd_rate`
- `historical_usd_value`
- `payment_asset`
- `is_complete`
- `is_cancelled`
- `source`
- `source_partition`
- `quality_flags_json`
- `raw_hash`

Uniqueness:

- Prefer `(source, tx_hash, event_type, nft_address, logical_time)`.
- Use `raw_hash` only as a defensive duplicate check.

### 6.3 `dns_current_market`

Latest market state per NFT:

- listing GRAM
- highest verified bid GRAM
- sale/auction contract and code hash
- marketplace
- observed time
- stale time
- validity flags

### 6.4 `dns_structural_features`

- normalized label
- primary route
- character length
- byte length
- script and language hints
- numeric/letter class
- repetition signature
- unique-character count
- sequence, palindrome, run, and substring flags
- token count
- pronounceability features
- mixed-script/confusable flags
- feature JSON
- classifier version

### 6.5 `dns_semantic_profiles`

- language
- semantic categories
- entity type and canonical entity
- dictionary meanings
- abbreviation expansions
- TON/Telegram/crypto relevance
- memorability
- brandability
- commercial intent
- invented-word probability
- semantic confidence
- provenance
- Qwen model/schema version
- human override fields

### 6.6 `dns_embeddings`

Use a dedicated Railway pgvector PostgreSQL service rather than the standard Postgres image. Store:

- `nft_address`
- `embedding_model`
- `embedding_version`
- BGE-M3 vector
- generated time

Build an HNSW cosine index after the initial bulk load. Keep vectors outside the operational market database if memory or backups become excessive.

### 6.7 `dns_valuations`

The app-facing materialized result:

- `nft_address` primary key
- `domain_normalized`
- `estimate_gram`
- `range_low_gram`
- `range_high_gram`
- `confidence_score`
- `confidence_band`
- `valuation_status`
- `evidence_count`
- `effective_comp_count`
- `own_sale_count`
- `current_listing_gram`
- `current_bid_gram`
- `market_regime_id`
- `feature_version`
- `semantic_version`
- `estimator_version`
- `calibration_version`
- `valued_at`
- `stale_at`
- `explanation_json`

### 6.8 `dns_valuation_comparables`

Keep the audit trail for the top selected comparables:

- target NFT
- comparable NFT
- source event
- structural similarity
- semantic similarity
- recency weight
- liquidity/quality weight
- final weight
- comparable GRAM price
- rank

### 6.9 Work coordination

Use durable tables rather than local files:

- `dns_jobs`
- `dns_worker_checkpoints`
- `dns_source_watermarks`
- `dns_engine_versions`
- `dns_meaning_dictionary`

Workers claim rows with `FOR UPDATE SKIP LOCKED`, process bounded batches, write checkpoints transactionally, and retry with a maximum attempt count. This avoids another single scanner that loops for days and loses progress on restart.

## 7. Feature And Comparable Pipeline

### 7.1 Stage A: deterministic structure

Run for every domain. This stage guarantees coverage even if AI infrastructure is offline.

Output a structural signature such as:

```text
1662.ton -> numeric | 4N | ABBC | 3 unique digits | repeated 6
ai.ton   -> letters | 2L | acronym candidate | no separator
```

### 7.2 Stage B: dictionary and entity enrichment

Before using Qwen:

- multilingual dictionaries
- abbreviation database
- place/person/company/entity lists
- TON, Telegram, crypto, and community vocabulary
- reusable `dns_meaning_dictionary`

### 7.3 Stage C: BGE-M3 embeddings

Generate one embedding per normalized label and useful tokenized representation. BGE-M3 is used only to retrieve semantic candidates, not to calculate price.

### 7.4 Stage D: selective Qwen3-8B enrichment

Queue a domain only when one of these is true:

- dictionary/entity signals conflict
- language or tokenization is uncertain
- invented/compound meaning could materially change comparables
- the domain is high-value or high-impact but semantic confidence is low
- a human review or bad backtest flags the profile

Qwen returns a versioned JSON schema. It never returns a price.

### 7.5 Stage E: candidate retrieval

Retrieve candidates in parallel pools:

1. Exact domain history.
2. Exact structural bucket.
3. Neighboring structural buckets allowed by route-specific rules.
4. BGE-M3 semantic neighbors.
5. Same semantic category and similar scarcity.
6. Broad route/length/script baseline for residual coverage.

Candidate rules by route:

- Numeric: structure first; semantic/cultural signal can adjust ranking but cannot replace the numeric pool.
- Short letters: exact length first, then acronym/category meaning.
- Dictionary/entity/compound: semantics and structural scarcity are both required.
- Multilingual: same language/script evidence gets priority; cross-language semantic matches require stronger confidence.
- Long/random residual: use a broad liquid baseline and widen the range.

### 7.6 Stage F: evidence quality filter

Reject or down-weight:

- incomplete, reverted, or cancelled sale records
- non-native currency without a verified historical conversion
- duplicate transaction/event rows
- self-sales and repeated buyer/seller loops
- unsupported sale-contract code hashes
- very stale asks
- asks unsupported by bids or sales
- extreme outliers with no neighboring evidence
- materially different market regimes

## 8. Valuation Calculation

The final formula will be calibrated by backtests, but the implementation shape is fixed.

### 8.1 Comparable weight

For each completed sale comparable:

```text
weight =
  route_compatibility
  * structural_similarity
  * semantic_similarity
  * recency_decay
  * event_quality
  * liquidity_weight
  * market_regime_adjustment
```

Route-specific code determines how much structural versus semantic similarity matters. Do not use one universal weighting scheme for `8888.ton` and `supernova.ton`.

### 8.2 Robust midpoint

Work in log-GRAM space and use a weighted median or calibrated robust quantile estimator. Do not use a simple arithmetic mean.

### 8.3 Direct evidence blend

- Recent exact-domain sales receive the strongest weight when they pass quality checks.
- An exact-domain bid is a lower-bound signal.
- A current ask is an upper-market signal, capped by comparable dispersion.
- Multiple consistent asks may influence the current range.
- A single extreme ask must not move the midpoint materially.

### 8.4 Range

Start from weighted comparable quantiles and widen based on:

- low effective comparable count
- high dispersion
- old evidence
- weak semantic confidence
- cross-route fallback
- low liquidity
- renewal/expiry risk

### 8.5 Confidence

Confidence is calibrated from:

- effective comparable count
- average structural and semantic similarity
- evidence recency
- price dispersion
- exact-domain history
- sale/bid/ask agreement
- market-source completeness
- semantic-profile confidence
- lifecycle certainty

Initial UI bands:

- High: backtested, liquid, close comparable set.
- Medium: usable evidence with moderate uncertainty.
- Low: broad fallback or sparse evidence.

The numeric thresholds are not chosen by intuition. They are fitted against historical holdout sales.

## 9. Coverage Fallback Ladder

Every valid active domain is processed through this ladder:

1. Exact recent domain sales plus close comparables.
2. Close structural and semantic completed sales.
3. Exact structural class and category sales.
4. Same primary route, similar length/script, and current market regime.
5. Broad route baseline with a wide range and low confidence.

If step 5 still has no verified completed sale evidence, return `Processing` during backfill or `Unavailable` after the ledger is complete. Do not invent a collection floor.

Portfolio totals:

- Phase 1: include only High and Medium estimates.
- Show Low estimates on the DNS screen but exclude them from the portfolio total until backtests establish a safe inclusion policy.
- Current asks appear separately and never silently replace the estimate.

## 10. Fast Wallet-Import Path

### 10.1 Server flow

Change `server.js::walletNftsByType()` only to classify and normalize DNS ownership. Do not calculate price there.

Add:

```text
dnsValuationsForNfts(nftAddresses, currentGramUsdRate)
```

It performs one parameterized query:

```sql
SELECT ...
FROM dns_valuations
WHERE nft_address = ANY($1)
```

Then `getCollectibles()` merges the valuation rows into `classified.dns` before caching the wallet response.

### 10.2 Latency budget

Targets after a warm connection:

- valuation batch query: p95 under 100 ms
- merge/serialization: under 20 ms
- no extra per-domain network calls
- the dominant latency remains the existing TonAPI ownership fetch

### 10.3 Cache behavior

- Keep the existing wallet-scoped five-minute cache.
- Add a small in-process valuation cache keyed by `nft_address:estimator_version`.
- PostgreSQL remains the canonical cache; Redis is not required for V1.
- Serve the last good valuation while a refresh is queued.
- Never replace a good cached value with a temporary source failure.
- Missing and stale rows are enqueued in one bulk operation after the response data is assembled.

### 10.4 App response contract

Extend each DNS asset without removing current fields:

```json
{
  "floorStatus": "priced",
  "valuationKind": "dns-estimate",
  "estimatedGram": 730,
  "rangeLowGram": 610,
  "rangeHighGram": 860,
  "confidenceScore": 0.72,
  "confidenceBand": "medium",
  "evidenceCount": 8,
  "valuedAt": "...",
  "estimatorVersion": "dns-v1",
  "listed": true,
  "listingGram": 1200,
  "marketPlatform": "Getgems"
}
```

For compatibility, set `floorTon` and `floorUsd` to the accepted estimator midpoint only when its confidence passes the portfolio inclusion gate. Keep the raw estimate fields even when Low confidence is excluded from totals.

## 11. Frontend Behavior

Update `app.js::normalizeIdentityAsset()` to understand `dns-estimate` without changing Anonymous Number logic accidentally.

DNS list row:

- domain name
- estimated USD and GRAM
- `Estimated` pill
- confidence band
- current listing indicator only when present

DNS detail page:

- estimate midpoint
- current USD equivalent
- low/high range
- confidence
- number of comparable sales
- valuation freshness
- current ask and verified bid in a separate market section
- lifecycle/renewal status when verified
- concise reason such as `4N repeated pattern` or `Dictionary word + 11 comparable sales`

Do not expose raw model jargon, embedding distance, or a long AI explanation in the default view. An audit drawer can show comparables later.

## 12. Railway Deployment Shape

Do not add DNS work to `gallant-charisma`, the gift workers, or the app server loop.

Recommended services:

1. `tontrack-app`: existing API/UI, read-only DNS valuation access.
2. `dns-market-worker`: source backfill and incremental market events.
3. `dns-feature-worker`: structural features and dictionary enrichment.
4. `dns-semantic-worker`: BGE-M3 and selective Qwen jobs.
5. `dns-valuation-worker`: comparable selection, materialized valuations, and refresh.
6. `dns-postgres`: operational DNS tables.
7. `dns-vector-postgres`: Railway pgvector template, if the extension cannot be added to the existing Postgres image.

Implementation may combine workers 2, 3, and 5 into one codebase with separate Railway role flags, but they remain separate processes and queues.

Add mutually exclusive role flags to `scripts/railway-start.js`, following the existing worker isolation rule. Each worker must:

- process bounded batches
- heartbeat to PostgreSQL
- checkpoint before moving on
- back off on source throttling
- resume from durable state
- stop retrying poison jobs indefinitely
- expose lag, processed, failed, and pending counts

## 13. AI Runtime And Cost Control

Railway's normal compute is CPU-based. Do not keep Qwen3-8B running inside the app service.

V1 strategy:

- Run the initial BGE-M3 and Qwen batch on a temporary GPU service or controlled local/GPU job.
- Upload versioned results to PostgreSQL/pgvector.
- Process only new or uncertain domains incrementally afterward.
- Turn off the temporary GPU when the queue is empty.
- Keep deterministic valuation working even when semantic inference is unavailable.

Approximate embedding storage planning for about 175K domains:

- BGE-M3 at 1024 float32 dimensions is about 700 MB of raw vectors.
- HNSW indexes and PostgreSQL overhead can push the vector service into the 1.5-3 GB range.
- Measure actual size before enabling backups and choosing the Railway volume tier.

Qwen3-8B is one-time enrichment, not a per-view cost. Cache its JSON profile by normalized domain and model/schema version.

## 14. Backtesting And Release Gates

### 14.1 Time-aware test

For each held-out sale:

1. Remove that sale and every later event.
2. Build comparables using only prior evidence.
3. Predict midpoint, range, and confidence.
4. Compare with the actual completed sale.

### 14.2 Required segmentation

- numeric by digit count/pattern
- short letters
- dictionary
- acronym
- entity
- compound
- invented/brandable
- multilingual
- alphanumeric
- long/random residual
- price and liquidity tier

### 14.3 Metrics

- median absolute log error
- percentage within 1.5x and 2x of actual sale
- percentage of actual sales inside the predicted range
- range width
- confidence calibration
- severe overvaluation rate
- stale valuation rate
- coverage rate by route

### 14.4 Shipping gates

Before estimates enter portfolio totals:

- no future leakage in backtests
- no unsupported sale contracts treated as completed sales
- no single ask can set the estimate
- High and Medium confidence bands are measurably calibrated
- at least 70% of holdout sales land inside their predicted ranges overall
- route-level severe misses are reviewed
- wallet-import p95 does not materially regress
- every displayed valuation preserves comparable IDs and estimator version

The 70% range target is a release floor, not a claim of current accuracy.

## 15. Rollout Plan

### Phase 0: source proof and sample ledger (2-3 days)

- Query authenticated Getgems collection history for the verified DNS collection, retaining only finalized native-GRAM sales.
- Reconstruct a small set of known Getgems fixed sales, auctions, bids, and cancellations.
- Verify prices, timestamps, NFT addresses, and contract hashes against explorers.
- Prove lifecycle/renewal extraction.

Stop if completed sales cannot be reconstructed reliably.

### Phase 1: market ledger and deterministic V0 (5-8 days)

- Create DNS PostgreSQL schema and migrations.
- Backfill catalog, metadata, market events, and historical GRAM/USD.
- Build structural classifier and route tests.
- Build route baselines, robust comparable pricing, ranges, and confidence.
- Add time-aware backtest harness.

This phase already provides broad low/medium-confidence coverage without AI.

### Phase 2: semantic V1 (5-8 days plus batch runtime)

- Deploy pgvector.
- Generate BGE-M3 embeddings in batches.
- Build semantic candidate retrieval.
- Add meaning dictionary.
- Add selective Qwen3-8B enrichment.
- Recalibrate route weights and confidence.

### Phase 3: TonTrack integration (3-4 days)

- Add batch valuation lookup to `getCollectibles()`.
- Extend the API contract.
- Update DNS list/detail UI.
- Preserve strict current-listing evidence separately.
- Add missing/stale background enqueue.
- Add focused server and frontend tests.

### Phase 4: shadow and staged release (5-7 days)

- Compute estimates without affecting portfolio totals.
- Compare against new completed sales.
- Test selected wallets and all route classes.
- Enable Medium/High estimates in DNS totals.
- Enable portfolio inclusion only after release gates pass.

Expected end-to-end engineering time: approximately 3-5 weeks, depending mainly on source reconstruction and embedding batch capacity. A listing-only or structural prototype can appear sooner, but calling it the final estimator would be misleading.

## 16. Test Plan

### Unit tests

- collection-address classification
- native-GRAM alias validation
- Unicode normalization and confusables
- numeric/letter/pattern signatures
- route selection
- event deduplication
- unsupported contract rejection
- robust midpoint and range behavior
- single extreme ask resistance
- confidence monotonicity
- expiry/renewal handling

### Integration tests

- Getgems history item to normalized market event
- fixed sale, auction, bid, and cancellation reconstruction
- batch valuation lookup for multiple wallet DNS assets
- stale-while-revalidate behavior
- missing valuation enqueue without blocking response
- current GRAM/USD display conversion
- historical USD immutability

### Regression fixtures

Keep representative fixtures for:

- `1662.ton`
- `8888.ton`
- a two-letter acronym
- a dictionary word
- a compound TON term
- an invented brandable word
- a multilingual name
- an alphanumeric name
- a long/random name
- an expired/released domain
- an absurd single active ask

## 17. Observability And Operations

Dashboard metrics:

- catalog coverage
- domains missing structural features
- domains missing embeddings
- domains waiting for Qwen
- valuation coverage by confidence and route
- market-ledger source lag
- queue age and poison-job count
- valuation age
- wallet batch-query p50/p95/p99
- estimate versus next completed sale error
- database and vector-index size

Alerts:

- source watermark stops advancing
- worker heartbeat missing
- duplicate-event rate spikes
- unsupported contract rate spikes
- wallet DNS lookup exceeds latency budget
- stale valuation share exceeds threshold
- extreme estimate movement without new verified evidence

## 18. First Implementation Sprint

Do these tasks next, in this exact order:

1. Build a read-only Getgems-history proof script for one month of DNS finalized sales.
2. Validate ten known domains across sale, auction, bid, cancellation, transfer, and active listing.
3. Write SQL migrations for `dns_domains`, `dns_market_events`, `dns_current_market`, `dns_structural_features`, `dns_valuations`, and job/checkpoint tables.
4. Build the deterministic structural classifier with route fixtures.
5. Build a market-ledger importer with idempotency and watermarks.
6. Build structural-only comparable V0 and time-aware backtests.
7. Review accuracy before provisioning pgvector or Qwen infrastructure.

This order prevents paying for AI or designing UI around an estimator whose market ledger has not been proven.

## 19. Decisions Locked By This Plan

- The app will not price DNS from one active listing.
- AI classifies meaning; it never outputs the price.
- Every valid DNS type has a deterministic route and fallback ladder.
- Verified completed market evidence is the numeric authority.
- Qwen3-8B and BGE-M3 run outside the wallet request path.
- Valuations are precomputed and fetched in one PostgreSQL batch query.
- DNS storage is separate from gift D1.
- Current asks and bids are shown separately from fair-value estimates.
- Low-confidence estimates are not included in portfolio totals at first.
- Workers are checkpointed, bounded, resumable, and isolated Railway services.
- Backtesting, not intuition, chooses weights and confidence thresholds.

## 20. Final Zero-Wait First Import Route

The first wallet import must never start the expensive valuation pipeline. It only identifies the wallet's DNS assets, derives deterministic features, and reads precomputed market intelligence.

### Work completed before any wallet connects

1. Continuously ingest verified DNS auctions, marketplace resales, bids, listings, cancellations, transfers, renewals, and expiry events.
2. Keep acquisition events distinct:
   - initial auction settlement is a paid acquisition anchor;
   - completed marketplace resale is a verified sale;
   - a transfer without payment is not a sale;
   - renewal is not a sale.
3. Normalize every supported `.ton` name and precompute its structural feature vector.
4. Maintain compact archetype indices for length, script, numeric and letter patterns, dictionary strength, crypto relevance, brandability, and semantic cluster.
5. Precompute comparable sets, robust price bands, confidence, and evidence timestamps.
6. Load the compact indices into the API process at startup and refresh them with stale-while-revalidate semantics.

### Work performed on first wallet import

1. Discover the wallet's DNS NFTs and validate collection contracts.
2. Normalize all names and classify their deterministic structure in one batch.
3. Perform one batch lookup against the in-memory valuation snapshot or indexed database view. Never issue one query per domain.
4. Select the strongest available route for each name:
   - its own verified paid acquisition or resale history;
   - close completed-sale comparables;
   - its precomputed archetype price band;
   - a broad verified DNS market baseline.
5. Return the first valuation response immediately.
6. Queue semantic enrichment and fresher market reconciliation after the response. Those jobs may improve confidence later but must not block the first screen.

### Display contract

- `Direct evidence`: the domain has its own verified paid history.
- `Comparable estimate`: supported by sufficiently close verified sales.
- `Indicative estimate`: supported by the broad archetype or market baseline.
- `Unavailable`: reserved for an invalid, unsupported, expired, or unverifiable asset, not merely a newly imported one.
- Exact acquisition and resale events appear separately on the detail page; a transfer without payment never appears as a sale.
- Historical USD uses the TON/USD or GRAM/USD rate at the event timestamp. Current conversion is never applied retroactively.
- High- and medium-confidence values may enter the portfolio total. Indicative values remain visible but excluded until backtesting approves their inclusion.

### Performance target

- Keep discovery network time separate from estimator time.
- After NFT discovery, classify and value 100 domains in one batch with a p95 target below 750 ms.
- Load snapshots at process start, use indexed batch reads, and prohibit synchronous LLM calls in wallet requests.

### Ship gate

The estimator is ready only when fixtures cover every route, first-import valuation has no avoidable unavailable states, stale data remains explicitly timestamped, and backtests prove that adding semantic enrichment improves completed-sale error over structural comparables alone.

### Implemented first-import boundary

- `dns_archetype_baselines` stores versioned archetype, route-length, route, and global snapshots generated only from trusted completed sales.
- The DNS pipeline refreshes these snapshots independently of wallet requests.
- The API preloads the compact snapshot at startup and caches it for five minutes.
- A first import performs one batched persisted-valuation lookup and, when needed, one compact snapshot read. It never aggregates `dns_market_events` in the request path.
- One hundred newly discovered domains use the same two-query bound as one domain.
- Archetype and global fallback values are always marked `indicative`, remain low confidence, and are excluded from portfolio totals.
- Secondary sales require explicit completion and a verified Getgems market identity. Registration-auction settlements remain trusted acquisition evidence.
- Active asks and bids expire after six hours and cannot alter an estimate after their stale timestamp.
- The shared `dns-market-v3` key invalidates old valuation and queue records consistently.

### Calibration v3: textual-name safety boundary

- Numeric and short-letter labels can use structural comparables because their
  scarcity is principally structural.
- For textual DNS labels, route, length, and spelling overlap are candidate
  discovery signals only. They cannot set a portfolio estimate.
- A textual label receives an estimate only from repeated finalized sales of
  that exact name, or a separately verified semantic relationship. Otherwise
  the prepared archetype baseline is visible as `indicative`, low confidence,
  and excluded from the portfolio total.
- One finalized exact sale remains visible as evidence but is always low
  confidence and excluded from portfolio totals. Two or more finalized exact
  sales are required before the read model can publish a portfolio-eligible
  value.
- The calibration is tested against the compact D1 sale ledger. The current
  strict backtest intentionally abstains when evidence is insufficient rather
  than trading accuracy for broad coverage.

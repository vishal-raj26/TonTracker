# Telegram Username Valuation Production Architecture

## Objective and service levels

The system precomputes Telegram username and TON DNS valuations so wallet import does no research or
model training. Initial targets:

- wallet NFT identification: under 500 ms at p95;
- valuation batch lookup: under 250 ms at p95;
- app receives existing valuations: under 1 second end to end at p95;
- completed Fragment sale reflected after the next 15-minute poll and valuation cycle;
- high-value or actively traded valuation refreshed: under 10 minutes;
- long-tail valuation refreshed daily;
- zero cross-wallet cache leakage.

## Architecture decision

Use Fragment's completed-sale market and per-username ownership history as the production price
ledger. Fragment is the venue where collectible Telegram Usernames settle and exposes the native
price and exact completion time needed by the estimator. Verify every item against Telegram's
official collection identity. A future chain indexer can audit settlement and ownership, but is not
required on the wallet-import path.

Recommended components:

| Layer | Recommended technology | Responsibility |
|---|---|---|
| Historical source | Fragment prefix-partitioned sold search plus ownership history | Complete marketplace sale ledger |
| Live source | Fragment latest completed-sales poll | New settled Username sales |
| Raw storage | S3 or Cloudflare R2, Parquet | Immutable bronze events and model training snapshots |
| Canonical store | PostgreSQL | Items, normalized events, ownership, current market state |
| Analytics store | ClickHouse when volume requires it | Feature windows, backtests, graph aggregates |
| Hot cache | Redis | Latest valuation by NFT address and batch wallet responses |
| Comparable index | pgvector initially; OpenSearch at scale | Semantic/phonetic nearest candidates |
| Feature/model jobs | Python, Polars/PyArrow, LightGBM/CatBoost, PyTorch | Offline features, training, scoring |
| Serving API | Existing Node service or a small internal Python service | Batch exact-address valuation reads |
| Edge cache | Existing D1 only for compact output snapshots if useful | Never raw history or training ledger |

This can be introduced alongside the existing application. The frontend data contract does not need
to change until the new service is ready.

## Canonical identity and collections

Assets are classified only by normalized collection address:

- Telegram collectible usernames raw collection:
  `0:80d78a35f955a14b679faa887ff4cd5bfc0f43b4a4eea2a7e6927f3701b273c2`
- TON DNS raw collection:
  `0:b774d95eb20543f186c06b371ab88ad704f7e256130caf96189368a7d0cb6ccf`

Names, symbols, marketplace labels, and metadata text are not identity keys.

## Data model

### `identity_assets`

One row per NFT item:

```text
nft_address PK, collection_address, asset_type, normalized_name, display_name,
minted_at, current_owner, item_state, metadata_hash, first_seen_at, updated_at
```

### `market_events`

Append-only normalized events:

```text
event_id PK, event_type, nft_address, event_at, block_seqno, tx_hash, trace_id,
seller, buyer, bidder, marketplace, sale_contract, payment_asset,
price_native, native_usd_at_event, price_usd_at_event, market_stage,
reliability_score, reliability_flags, raw_object_uri
```

Use `(tx_hash, trace_id, nft_address, event_type)` or a proven chain-event identifier for idempotency.
Store both native and historical USD. Never rewrite historical USD with the current exchange rate.

### `market_state`

Current bid/listing state:

```text
nft_address PK, lowest_ask_native, ask_started_at, ask_changes,
highest_bid_native, highest_bidder, distinct_bidders, bid_depth_json,
last_reliable_sale_at, last_reliable_sale_usd, liquidity_features_json, updated_at
```

### `static_name_features`

Versioned features computed once per name/model release:

```text
nft_address, feature_version, structural_json, language_json, semantic_json,
phonetic_json, risk_json, embedding, computed_at
```

### `valuation_snapshots`

```text
nft_address, asset_type, model_version, effective_at,
p10_usd, p50_usd, p90_usd, quick_sale_30d_usd,
confidence, evidence_tier, evidence_age_seconds,
explanation_codes, warning_codes, feature_snapshot_uri,
PRIMARY KEY (nft_address, model_version, effective_at)
```

A separate `latest_valuations` table or materialized view points to the current row. History is kept
for model auditing but compacted according to retention policy.

## Ingestion pipeline

1. Fetch Fragment's newest completed sales immediately.
2. Recursively partition sold search by username prefix until no 500-row result remains truncated.
3. Fetch ownership history once per discovered username and ignore transfer-only rows.
4. Accept only the verified Telegram Username collection identity and finalized native settlement.
5. Join the bounded historical GRAM/USD observation at the event timestamp.
6. Deduplicate by stable username, sale time, and native amount, then persist the normalized event.
7. Queue static features and affected valuations.
8. Persist the backfill cursor; after completion switch to the lightweight latest-sale poll.

At-least-once delivery plus idempotent writes is preferred over a fragile exactly-once pipeline.

## Historical USD service

Maintain a versioned `native_usd_rates` table at minute or finest reliable resolution:

```text
asset, observed_at, usd_rate, source, source_priority, ingested_at
```

For each market event:

1. choose the nearest observation at or before the event within a bounded tolerance;
2. fall back to a second independent source when the primary is missing;
3. store the chosen source and temporal gap;
4. mark the USD label unavailable when no defensible rate exists;
5. never use a default/static rate.

Current market valuation uses the current rate, but historical training labels remain immutable.

## Feature computation

### Static lane

Triggered for every newly discovered name and on feature-version upgrades. Language identification,
tokenization, corpus frequencies, embeddings, phonetics, semantic categories, and risk labels are
cached. LLMs may help offline with structured semantic/entity/risk extraction, but their outputs must
be versioned, validated, and never accepted as prices.

### Dynamic lane

Triggered by sale, bid, ask, cancellation, transfer, or market-index movement. It updates evidence,
liquidity, reliability, comparable windows, and the valuation queue.

### Periodic lane

- active/high-value items: score hourly or when affected;
- other items: score daily in partitions;
- segment market indices: update hourly/daily;
- graph reliability features: incremental daily plus weekly full reconciliation;
- full model retraining: monthly or on drift alarm;
- semantic feature refresh: only when model/taxonomy changes.

## Model scoring flow

For each asset, load a point-in-time feature bundle and run all eligible experts. The gate receives:

- direct evidence age/count/reliability;
- bid and listing execution features;
- comparable count and distance;
- expert disagreement;
- liquidity and out-of-distribution score;
- market regime.

The gate emits p10/p50/p90 and quick-sale value. A conformal calibrator adjusts intervals by evidence
tier and segment. Every result stores the full model and feature version.

## Wallet-import hot path

```text
wallet address
  -> fetch owned NFTs
  -> normalize collection addresses
  -> filter username and DNS items
  -> batch GET latest valuations by nft_address
  -> return assets and prepared values
```

No crawler, external search, embedding model, or LLM is called in this path. Redis stores hot values;
PostgreSQL is the fallback. The cache key includes NFT address and model version, never only a name or
wallet. A wallet change clears all client wallet-specific state.

For a newly minted item missing from the snapshot table, the API immediately returns a hierarchical
cold-start estimate from precomputed segment parameters, marks confidence low, and enqueues complete
feature generation. It does not block wallet import.

## Comparable retrieval

Maintain two indexes:

1. static candidate index containing structure, language, phonetics, semantics, and embedding;
2. point-in-time sale index containing only reliable sales available before each scoring timestamp.

Retrieval first applies hard constraints, then learned ranking. This prevents a semantically close but
structurally incomparable name from dominating. Training and backtests must use historical versions of
the index to avoid future leakage.

## Reliability graph

Build an incremental wallet graph from sale ownership paths and funding/transfer relations. Persist:

- wallet clusters;
- reciprocal pairs and cycles;
- NFT return-to-owner windows;
- common funders;
- repeated-pair concentration;
- venue and sale-contract anomaly scores.

The estimator consumes a continuous reliability weight. Raw events remain in object storage for
audit and for future detector improvements.

## Storage control

Do not repeat the D1 failure mode by retaining high-volume raw events in an edge database.

- Parquet raw events: partition by event date, asset type, and event type; compact small files.
- PostgreSQL: current state, dimensions, and recent normalized events needed operationally.
- ClickHouse: long analytical event history only if query volume justifies it.
- Redis: latest snapshots only, TTL plus model-version invalidation.
- D1: optional compact latest-value edge cache, not seven-day raw scans or sale ledgers.
- Retain immutable raw history cheaply in object storage; roll detailed model snapshots into daily,
  weekly, then monthly checkpoints after the audit window.

## Backfill and launch plan

### Phase 1: canonical ledger

- self-host/consume the TON historical dataset;
- reproduce event counts against Dune aggregates;
- verify sample transactions across explorers and contract payloads;
- populate complete inventory and historical USD labels.

### Phase 2: baseline service

- train repeat-sale, structural quantile, comparable, and liquidity baselines;
- generate full-market snapshots;
- expose internal batch API;
- shadow the existing app with no user-visible switch.

### Phase 3: semantic and reliability models

- add multilingual embeddings and semantic residual model;
- add wallet graph and manipulation weights;
- calibrate intervals by evidence tier;
- run walk-forward and shadow evaluations.

### Phase 4: controlled production

- enable username category for internal wallets;
- monitor latency, missing rate, interval coverage, and drift;
- roll out by wallet cohort;
- retain instant rollback to the previous model version.

### Phase 5: DNS transfer

- train a separate DNS model;
- add username-derived cross-market features only after matched-pair validation;
- never serve DNS through the username model or a fixed discount.

## Release gates

- 99.9% verified collection-address classification;
- no current-rate conversion of historical sales;
- point-in-time feature and comparable correctness tests;
- p90 interval coverage within calibration tolerance by evidence tier;
- latency and cache-miss targets met;
- zero wallet cache crossover in integration tests;
- reproducible model artifact and data lineage;
- rollback tested;
- unavailable/low-confidence behavior reviewed on out-of-distribution cases.

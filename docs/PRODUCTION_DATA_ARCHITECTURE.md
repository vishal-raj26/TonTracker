# TonTrack Production Data Architecture

## Non-Negotiable Gift Contract

- A Gift market identity is `collection + model + backdrop`. Symbols are media and rarity metadata only; they never select a price or history series.
- A verified live floor is displayed only when an exact identity has more than one active, uniquely identified Thermos listing.
- An identity with zero or one active listing uses the Gift estimator. A sale never becomes a current floor.
- Recent sales are evidence only. They retain the TON/USD rate observed at the sale timestamp.
- A missing verified floor and missing estimate remains unavailable. The product must not manufacture a live value.

## Serving Path

`wallet import -> server resolver -> materialized registry -> UI`

The request path never crawls a marketplace. It reads the materialized registry and returns the exact live floor, the existing estimate, recent sales, and cached collection/model statistics together. This keeps first import deterministic and protects the marketplace sources.

Gift rendering is also one shared resolver for wallet and Telegram ownership: static media remains the fallback, local Lottie model media is optional, symbol is local PNG metadata, and backdrop is local palette metadata.

## Gift Floor Pipeline

1. The combo scanner reads Thermos aggregate listings.
2. It groups only by `collection + model + backdrop`, carries stable listing IDs where the source provides them, and records the lowest verified listing plus the unique active listing count.
3. A complete collection snapshot is committed to the registry. Partial scans never replace a complete collection snapshot.
4. Registry history records compact price/count samples by collection, day, and bucket. New records are bucket-local rather than a whole collection JSON document.
5. The registry retains at least seven complete UTC days of history. A floor change is recorded immediately; an unchanged floor receives one daily sample.
6. If a full scan no longer contains a combination, the active registry entry is removed. The historical series ends rather than carrying a stale price forward.

## Storage Roles

| Store | Responsibility | Must not contain |
| --- | --- | --- |
| Cloudflare D1 registry | current Gift materialization, seven-day compact Gift history, compact sales and DNS/Username valuation evidence | raw listing payloads or duplicate source snapshots |
| R2 | optional raw scanner audit payloads with short retention | request-time serving data |
| Retired PostgreSQL volume | rollback-only during verified migration; delete after parity | new writes or portfolio request reads |
| Railway service memory | bounded request caches and job coordination only | durable truth |

Raw payload retention is short. Materialized values are compact, keyed records. This prevents storage growth from scaling with scanner page count.

## Worker Model

Workers have one responsibility each and are independently deployable:

- `gift-combo`: Thermos complete collection snapshots and history samples.
- `gift-sales`: GiftSatellite sales ingestion and historical TON/USD enrichment.
- `gift-stats`: Dune collection/model aggregates, prewarmed outside detail-page requests.
- `identity-market`: DNS and Username market ingestion into the compact D1 ledger.
- `identity-valuation`: deterministic DNS and Username recomputation from compact finalized sales.

The web service never starts long scans. Each worker has a lease/checkpoint, exponential source backoff, and explicit `complete`, `partial`, and `failed` states. A worker may publish only complete source snapshots; a later scan cannot overwrite newer data.

Gift marketplaces do not provide a stable scheduler-friendly bulk API. Therefore
the two long, rate-limited Gift scans are deliberately continuous singleton
services: `gift-combo` walks complete Thermos collection snapshots and skips
fresh D1 materializations after a restart; `gift-sales` advances a durable
GiftSatellite collection checkpoint under provider backoff. They never run in
the web service and no second worker may own either source. Short D1 identity
jobs remain bounded cron invocations because each job has a small, resumable
unit of work.

### Consolidated Worker Entry Point

All production jobs run through one bounded command:

```powershell
npm run worker:run -- --role <role>
```

Each invocation performs one short job and exits. Railway Cron (or an equivalent scheduler) owns the cadence for these bounded roles. The long Gift floor and sales scans above are the explicit exception: their rate limits make a complete run exceed a cron window, so they retain one continuously running singleton each. Supported bounded roles are:

| Role | Cadence | Work |
| --- | --- | --- |
| `gift-floor` | manual/canary only | one complete Thermos floor scan; production uses the continuous singleton below |
| `gift-estimate-history` | every 6 hours | refresh due estimate-history points only |
| `gift-sales` | manual/canary only | one bounded GiftSatellite sales batch; production uses the continuous singleton below |
| `username-market` | every 6 hours after bootstrap | ingest one bounded Fragment market page into D1 |
| `identity-baselines` | hourly | rebuild DNS and Username baselines/valuations from compact finalized sales |

### Active Compact Production Jobs

The migration reuses existing Railway services to avoid adding idle compute.
The obsolete PostgreSQL DNS worker services have been deleted. Their dispatcher
roles are rejected so they cannot be accidentally restarted.

| Railway service | Bootstrap cadence | Command | Durable store |
| --- | --- | --- | --- |
| `overflowing-enjoyment` | continuous singleton | `snapshot-gift-combos --continuous` | D1 current floor materialization and history |
| `gallant-charisma` | continuous singleton | `snapshot-gift-sales --continuous` | D1 sales checkpoints and compact sales evidence |
| `dns-d1-ingest-cron` | every 5 minutes | `python -m dns_worker direct-d1-cycle --page-size 25` | D1 identity ledger |
| `username-market-cron` | every 5 minutes | bounded `username-market` role | D1 identity ledger |
| `identity-baseline-cron` | hourly at minute 7 | bounded `identity-baselines` role | D1 valuation/baseline projection |

Every bounded Railway role has a four-minute hard runtime limit by default
(`TONTRACK_BOUNDED_TIMEOUT_MS`). A stalled marketplace or historical-rate
request therefore cannot occupy later cron slots indefinitely.

The DNS cron is a separate Python/Docker deployment, not a Node worker role.
Deploy it from the repository root with:

```powershell
railway up dns-worker --path-as-root --service dns-d1-ingest-cron --environment production --detach
```

Do not deploy that service from the repository root without `dns-worker
--path-as-root`: that would replace its Python cron command with the web
server. `DNS_DIRECT_MAX_PAGE_SIZE=12` keeps each direct-D1 invocation below
the cron window while its D1 cursor preserves progress.

After verified TonAPI DNS membership and the initial Fragment prefix sweep
reach parity, ingestion cadence becomes hourly. Railway owns scheduling and
skips an overlapping invocation; every command exits after one bounded unit of
work.

The DNS scheduler finishes the verified membership seed first so every
subsequent sale event uses the same complete asset universe. It then backfills
a bounded, recent TON Center transfer window; ownership transfers become sales
only after their old-owner sale contract is verified as complete. The public TON Lake archive
available to this project ends in 2022 and is manual reconciliation data only,
never a live valuation source.

Before those generic streams start, the DNS cron seeds the verified collection
membership from TonAPI's collection-items endpoint. It validates every returned
item's collection address, verification flag, canonical NFT address, and
normalized `.ton` metadata before writing the idempotent D1 asset row. The
unauthenticated source is paced at 4.2 seconds per request and handles up to
24 pages of 1,000 items per cron invocation. This gives the authenticated
on-chain sale stream a complete membership set in minutes rather than after an
archival catalog walk.
Membership checkpoints are monotonic: an overlapping or older invocation may
repeat idempotent asset writes, but it is not allowed to move the shared cursor
backward.

The web service is deployed separately. A role failure returns a non-zero exit code so the scheduler can retry according to its own policy; jobs do not spawn an internal restart loop.

## Sales Pipeline

GiftSatellite remains the sales source. Each sale stores its source ID, exact Gift identity, marketplace, sale timestamp, TON amount, and the TON/USD rate closest to that timestamp. The compact read model keeps bounded recent events per exact identity while the backfill checkpoint covers the previous 365 days. All qualifying events contribute to compact estimator aggregates before redundant raw events are pruned; storage compaction must never reduce an aggregate evidence count.

Sales are displayed by exact `collection + model + backdrop` when available, then explicitly labelled broader collection evidence. They never participate in live-floor selection.

## DNS And Username Migration

DNS and Username pricing use the same request/serve pattern as Gifts:

`ownership discovery -> precomputed market/valuation store -> request-time lookup`

Wallet import only identifies the asset and fetches its prepared valuation. It may enqueue a low-priority refresh, but a user never waits for crawling or modelling.

- Usernames use Fragment sales/listings and deterministic lexical/market comparables.
- DNS remains separately valued and may use username evidence as a discounted comparable signal only. It must never inherit a Username price through a fixed multiplier.
- Every valuation stores model version, source timestamps, comparable evidence, confidence, and an explicit unavailable state.

### Compact Identity Ledger And Valuation Read Model

`tontrack-valuation-read-model` is the D1 projection used by portfolio imports.
It contains current DNS and Username valuations plus the normalized evidence
needed to rebuild them: one asset row, one current-market row, deduplicated
finalized sales with historical USD attribution, and compact archetype
baselines. It excludes raw source payloads, repeated snapshots, embeddings,
and completed job bodies.

The D1 binding is bootstrapped through
`cloudflare/valuation-read-model-migrations/0002_valuation_read_model_bootstrap.sql`.
Deployments must apply this migration before enabling an identity worker or
app server; the standalone schema file is documentation, not a deploy step.

The registry worker serves `POST /valuations/read` and
`POST /identity/baselines/read`. The app checks these D1 projections before any
legacy lookup, so first import never waits for a crawl. Production web serving
has no PostgreSQL connection string: D1 misses use the prepared compact baseline
within a three-second read deadline, while low-confidence evidence remains
visible but excluded from portfolio totals.

```powershell
npm run valuation:export
```

`npm run valuation:username-ledger` performs one resumable Fragment page and
`npm run valuation:baselines -- --username` refreshes prepared baselines and
exact-name valuations. Both use D1 checkpoints and bounded 500-row writes.

TON DNS uses the same ledger without PostgreSQL. The `dns-worker`
`direct-d1-cycle` command advances bounded verified TonAPI membership pages,
then backfills and refreshes completed TON Center sale-contract evidence.
It writes only normalized assets, finalized native-GRAM sales with event-time
USD, and current market state. Baselines are rebuilt in Node with the canonical
production DNS classifier, so Python ingestion cannot silently create a second
category taxonomy.

`direct-d1-cycle` enforces this dependency order automatically during bootstrap
and subsequently polls newest on-chain sale evidence. Its cursors live in D1,
so a Railway restart never restarts historical discovery from the beginning.

The hard storage contract is enforced in D1: 1M assets, 2M unique sales, and
1M current valuations by default, with a 75% warning watermark and a 90%
nonessential-write stop. Current market rows and valuations overwrite by key;
sales use immutable source IDs; expired market state is pruned; counters are
reconciled daily. The complete unique sale corpus remains available to the
estimator while only 20 comparable explanations are retained per output.
Compactness therefore reduces duplicated storage and response payload size,
not the number of observations used by the estimator.

## Rollout Order And Gates

1. **Gift floor/history:** enforce exact identity, complete snapshots, reliable listing counts, compact seven-day history, and stale-entry removal.
2. **Worker consolidation:** move each scan to one bounded role with durable checkpoints; disable superseded sources only after parity checks.
3. **Sales correction:** finish historical TON/USD enrichment, compact existing rows, and validate exact identity matching.
4. **DNS/Username migration:** publish the precomputed projection to D1, shadow-compare it with the source store, then serve it as the request-time value source.

Every rollout needs: syntax/tests, a small canary collection, row-count comparison, price-policy assertions, storage-size measurement, and rollback through the previous materialized snapshot. No migration may change the Gift `listedCount <= 1` estimator rule.

PostgreSQL may be deleted only when DNS assets, finalized sales, prepared
valuations, current-market rows, and first-import responses pass parity against
the old store. Until then it is rollback-only: no production worker may write
to it and the request path must prefer D1.

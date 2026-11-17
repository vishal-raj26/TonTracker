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
| Cloudflare D1 registry | current Gift materialization, seven-day compact Gift history and compact sales | raw listing payloads or duplicate source snapshots |
| R2 | optional raw scanner audit payloads with short retention | request-time serving data |
| Retired PostgreSQL volume | rollback-only during verified migration; delete after parity | new writes or portfolio request reads |
| Railway service memory | bounded request caches and job coordination only | durable truth |

Raw payload retention is short. Materialized values are compact, keyed records. This prevents storage growth from scaling with scanner page count.

## Worker Model

Workers have one responsibility each and are independently deployable:

- `gift-combo`: Thermos complete collection snapshots and history samples.
- `gift-sales`: GiftSatellite sales ingestion and historical TON/USD enrichment.
- `gift-stats`: Dune collection/model aggregates, prewarmed outside detail-page requests.

The web service never starts long scans. Each worker has a lease/checkpoint, exponential source backoff, and explicit `complete`, `partial`, and `failed` states. A worker may publish only complete source snapshots; a later scan cannot overwrite newer data.

Gift marketplaces do not provide a stable scheduler-friendly bulk API. Therefore
the two long, rate-limited Gift scans are deliberately continuous singleton
services: `gift-combo` walks complete Thermos collection snapshots and skips
fresh D1 materializations after a restart; `gift-sales` advances a durable
GiftSatellite collection checkpoint under provider backoff. They never run in
the web service and no second worker may own either source.

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

### Active Compact Production Jobs

The migration reuses existing Railway services to avoid adding idle compute.
The obsolete PostgreSQL DNS worker services have been deleted. Their dispatcher
roles are rejected so they cannot be accidentally restarted.

| Railway service | Bootstrap cadence | Command | Durable store |
| --- | --- | --- | --- |
| `overflowing-enjoyment` | continuous singleton | `snapshot-gift-combos --continuous` | D1 current floor materialization and history |
| `gallant-charisma` | continuous singleton | `snapshot-gift-sales --continuous` | D1 sales checkpoints and compact sales evidence |

Every bounded Railway role has a four-minute hard runtime limit by default
(`TONTRACK_BOUNDED_TIMEOUT_MS`). A stalled marketplace or historical-rate
request therefore cannot occupy later cron slots indefinitely.

The web service is deployed separately. A role failure returns a non-zero exit code so the scheduler can retry according to its own policy; jobs do not spawn an internal restart loop.

## Sales Pipeline

GiftSatellite remains the sales source. Each sale stores its source ID, exact Gift identity, marketplace, sale timestamp, TON amount, and the TON/USD rate closest to that timestamp. The compact read model keeps bounded recent events per exact identity while the backfill checkpoint covers the previous 365 days. All qualifying events contribute to compact estimator aggregates before redundant raw events are pruned; storage compaction must never reduce an aggregate evidence count.

Sales are displayed by exact `collection + model + backdrop` when available, then explicitly labelled broader collection evidence. They never participate in live-floor selection.

## Out Of Scope: TON DNS, Usernames, Anonymous Numbers

TonTrack does not track TON DNS domains, Telegram usernames or anonymous
numbers. Their collections are excluded at wallet discovery
(`isExcludedIdentityNft` in `server.js`), so they are never priced, cached,
stored in D1, counted in totals or shown. The former identity ledger
(`tontrack-valuation-read-model` D1), its workers and estimators were removed
on 2026-11-17; the code remains in git history.

## Rollout Order And Gates

1. **Gift floor/history:** enforce exact identity, complete snapshots, reliable listing counts, compact seven-day history, and stale-entry removal.
2. **Worker consolidation:** move each scan to one bounded role with durable checkpoints; disable superseded sources only after parity checks.
3. **Sales correction:** finish historical TON/USD enrichment, compact existing rows, and validate exact identity matching.

Every rollout needs: syntax/tests, a small canary collection, row-count comparison, price-policy assertions, storage-size measurement, and rollback through the previous materialized snapshot. No migration may change the Gift `listedCount <= 1` estimator rule.

The retired PostgreSQL volume is rollback-only: no production worker may write
to it and the request path must prefer D1.

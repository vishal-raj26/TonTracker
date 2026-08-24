# TonTrack TON DNS Lake Worker

Production sidecar for building the complete verified TON DNS catalog and its
market ledger from the public TON lake. It is isolated from the application and
gift workers and writes only to the shared PostgreSQL contract in
`../sql/ton-dns-estimator.sql` plus its own source-coordination tables.

## Source pipeline

The worker discovers extensionless Parquet objects through paginated anonymous
S3 `ListObjectsV2` calls and processes these streams in dependency order:

1. `v1.1/ton/nft_items/`: exact collection-address pushdown bootstraps every
   initialized NFT in the verified TON DNS collection.
2. `v1.1/ton/nft_metadata/`: resolves domain metadata using a DuckDB disk-backed
   semi-join against the canonical NFT membership snapshot.
3. `v1.1/ton/nft_events/`: incrementally ingests collection-filtered chain
   events.
4. `v1.1/ton/nft_sales/`: incrementally ingests sale-contract state and bids
   through the same membership semi-join.

Verified collection:
`0:b774d95eb20543f186c06b371ab88ad704f7e256130caf96189368a7d0cb6ccf`.

DuckDB reads projected columns in bounded `fetchmany` batches. Metadata and
sales objects are never loaded wholesale into Python memory, including the
roughly 140 MB metadata partitions.

## Data guarantees

- Every address is canonicalized before querying or writing as lower-case raw
  `workchain:hex`; valid friendly `EQ`/`UQ` inputs resolve to the same identity.
- Native value is stored canonically as GRAM. Source aliases such as `TON` are
  accepted only as explicit native-payment aliases. No USD rate is invented or
  defaulted by this worker.
- Registration auctions remain distinct from verified Getgems secondary-market
  evidence; unknown marketplaces remain explicitly unverified.
- Asks, bids, completed sales, cancellations, transfers, and mints are
  normalized with deterministic IDs. Shared `dns_market_events` remains
  append-only and duplicate ingestion is harmless.
- Every catalog domain gets one `dns-feature` job using the runtime-compatible
  `:dns-structural-v1` key. Newly inserted market evidence queues a
  `dns-valuation` refresh using `:dns-market-v1`.
- An event or sale object with unresolved domain identity is rolled back and
  marked `blocked_metadata`. Its object checkpoint and source watermark do not
  advance. A later metadata commit requeues blocked objects.
- Market claims also wait until every catalog member is resolved or carries an
  explicit operator skip record; unresolved coverage can never disappear behind
  a completed discovery cursor.
- Source objects use PostgreSQL leases, bounded batches, retry/backoff, expired
  lease recovery, and poison-file state. Dependency streams do not run while a
  prerequisite object remains incomplete.
- Per-partition watermarks advance only through a contiguous prefix of completed
  source objects.

## Schema setup

Apply the root shared schema first with your PostgreSQL migration process:

```text
sql/ton-dns-estimator.sql
```

Then apply the sidecar-owned coordination migration and verify compatibility:

```powershell
cd dns-worker
python -m dns_worker migrate
python -m dns_worker schema-check
```

`migrate` creates only `dns_source_objects`, `dns_catalog_members`, and the
sidecar migration ledger. It never redefines a shared estimator table. All
normal ingest commands also run the live schema check before doing work.

## Local setup

```powershell
cd dns-worker
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-dev.txt
Copy-Item .env.example .env
```

Set `DNS_DATABASE_URL` to the estimator PostgreSQL database. This worker cannot
use either gift D1 database.

## Compact direct-to-D1 ingestion

The opt-in direct path bypasses PostgreSQL and writes only normalized identity
assets, verified finalized sales, current market state, and its durable cursor
to the existing valuation D1 API. It never sends source rows or raw payloads.
Each invocation requests one S3 discovery page, capped at 25 objects, and moves
the D1 checkpoint only after all D1 writes succeed.

Set `D1_REGISTRY_URL` and `D1_INGEST_SECRET`. Production first seeds verified
membership from TonAPI, then the dependency-safe cycle rotates the TON Lake
streams against that complete membership set:

```powershell
python -m dns_worker direct-d1-once --stream nft_items --page-size 4
python -m dns_worker direct-d1-once --stream nft_metadata --page-size 4
python -m dns_worker direct-d1-once --stream nft_events --page-size 4
python -m dns_worker direct-d1-once --stream nft_sales --page-size 4
```

Completed sales require an event-time GRAM/USD rate interpolated from
bracketing historical DeFiLlama observations. Missing coverage fails the
invocation before the checkpoint moves; there is no current-price, static-rate,
or guessed-rate fallback. `nft_metadata` and `nft_sales` use a bounded,
paginated membership export from D1 for their DuckDB semi-join. Equivalent
sales from `nft_events` and `nft_sales` use the same deterministic identity.

## Bootstrap and continuous operation

Initial production bootstrap:

```powershell
python -m dns_worker schema-check
python -m dns_worker migrate
python -m dns_worker discover --full-reconcile
python -m dns_worker ingest-once
python -m dns_worker status
python -m dns_worker run --poll-seconds 15 --discover-every-seconds 900
```

The legacy PostgreSQL discovery flow writes all four stream queues first.
Direct-to-D1 production uses the TonAPI membership seed and durable D1 cursors
instead. Restarts resume the direct cursors without replaying raw payloads.

## Source proof and dry run

Events require no database or membership file:

```powershell
python -m dns_worker source-proof --stream nft_events `
  --object-key "v1.1/ton/nft_events/date=2026-08-13/<key>"
```

Items can be proved directly:

```powershell
python -m dns_worker dry-run --stream nft_items `
  --object-key "v1.1/ton/nft_items/date=2026-08-13/<key>"
```

Metadata and sales proofs need an ASCII one-address-per-line membership file,
which is the same shape exported from `dns_catalog_members` in production:

```powershell
python -m dns_worker source-proof --stream nft_metadata `
  --membership-file .\dns-membership.csv `
  --object-key "v1.1/ton/nft_metadata/date=2026-08-13/<key>"
```

These commands download one object, use the production DuckDB filters, print a
small normalized sample, and make no database writes.

## Failure recovery

Inspect `python -m dns_worker status` and JSON logs for `retry`, `poison`, and
`blocked_metadata` objects. Fix the source/schema issue before resetting only
the affected row to `pending`, `attempts = 0`, and `next_attempt_at = now()`.
Do not manually mark unresolved objects complete. A changed S3 ETag requeues its
object automatically.

If the source provably has no usable domain metadata for one NFT, record the
exception rather than weakening the global checkpoint rule:

```powershell
python -m dns_worker skip-domain --nft-address "0:<64-hex>" `
  --reason "verified source metadata absent; incident DNS-123"
```

The command canonicalizes the address, stores the audit reason, and requeues
blocked metadata objects. It does not create a feature or valuation for an
unknown domain.

Poisoned prerequisite item or metadata objects intentionally stop dependent
market ingestion; this protects full-catalog coverage. Resolve or explicitly
waive them operationally rather than silently advancing an unsafe checkpoint.

## Railway service

Create a dedicated service rooted at `dns-worker/` and use its `Dockerfile`.
The image defaults to `python -m dns_worker run`. Set at minimum:

- `DNS_DATABASE_URL`
- `DNS_SOURCE_START_DATE`
- `DNS_INGEST_BATCH_SIZE`
- `DNS_MAX_ATTEMPTS`
- `DNS_DUCKDB_MEMORY_LIMIT`

Run `migrate` as an explicit release/setup command after the root schema exists.
Do not attach this command to the application or gift-sales services.

## Checks

The suite is offline and needs neither a live source nor PostgreSQL:

```powershell
python -m pytest -q
python -m pytest tests/test_schema_compatibility.py -q
python -m ruff check dns_worker tests
python -m compileall -q dns_worker tests
```

`test_schema_compatibility.py` verifies every shared ledger insert against the
root SQL and ensures the sidecar migration owns only coordination objects. The
runtime `schema-check` command validates the installed PostgreSQL columns before
ingestion.

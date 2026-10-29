# Bounded D1 maintenance — local implementation, not deployed

The Gift cleanup pause remains `GIFT_SALES_CLEANUP_PAUSED=1`. No migration,
deployment, counter bootstrap or cleanup resume was executed for this change.
Production account quota recovery is **unverified**. The parent investigation
reported Cloudflare authentication error 10000 / missing D1 scope; refresh the
operator credentials before any rollout or Insights measurement.

## Explicit schema rollout

Apply only after backup, local verification and an operator-approved rollout:

| Database | SQL |
| --- | --- |
| `tontrack-valuation-read-model` | `cloudflare/valuation-read-model-migrations/0003_bounded_maintenance.sql`, via that binding's migration directory |
| Each historical-USD compact sales shard, including reserves | `cloudflare/gift-sales-bounded-maintenance.sql` |
| Each legacy database actually containing `gift_sales` | `cloudflare/gift-sales-legacy-bounded-maintenance.sql` |

Do not apply compact SQL to a legacy database or vice versa. The worker never
creates schema in a request. Readiness markers are installed last; a missing
marker returns `migration-required` and performs no fallback full scan. A failed
partial migration is a rollout failure, not authorization to bypass the marker.
Indexes/triggers must be confirmed before marking a shard ready. Install the
schema before deploying worker imports and keep the cleanup pause through canary
and budget verification.

## Counter bootstrap is a separate bounded operation

Daily scheduling alone is deliberately insufficient for the initial corpus.
The authenticated `POST /maintenance/counters/bootstrap` endpoint accepts
`{"scope":"identity","steps":4}` or
`{"scope":"compact","shard":"2025","steps":4}`. Compact shard names are the
worker's exact configured names (`2025`, `2026-b`, `reserve-1`, `reserve-2`).
Each request advances at most four 500-key pages per table. It never deletes a
Gift sale. Responses expose `partial`/`complete`, each table's durable cursor,
count and readiness, plus the conservative source-row budget. Identity policy
counts are replaced only after that table's full traversal completes. Triggers
account for inserts/deletes behind a partial cursor and all mutations after
completion. Partial counts never replace complete stored policy counts.

An operator can resume without waiting years for a daily job, using explicitly
provided environment credentials and a per-invocation source-row ceiling:

```powershell
# These commands WRITE counter checkpoints. They have NOT been executed remotely.
# Supply D1_REGISTRY_URL and D1_INGEST_SECRET through the operator environment.
node scripts/bootstrap-d1-maintenance.js --scope identity --steps 4 --requests 100 --row-budget 250000 --execute
node scripts/bootstrap-d1-maintenance.js --scope compact --shard 2025 --steps 4 --requests 100 --row-budget 250000 --execute
```

Choose the budget from observed **account-wide** daily headroom; the example
250,000 ceiling is not an inferred allowance. Repeating the command resumes D1
checkpoints. Do not run multiple operators or multiply budgets across services
without accounting for the same daily account total. The CLI conservatively
charges three source-page traversals per counter update, plus a fixed request
count ceiling; it does not claim to meter Cloudflare's billed rows or all other
services. Endpoint work is also hard-capped if another authenticated client
bypasses this CLI. Missing schema stops the operation. Leases prevent overlapping
maintenance owners; a lost lease cannot advance an old cleanup checkpoint.

At 400k events the counter requires 800 full pages and a final empty seek.
At the configured 2m identity-sale maximum it requires 4,000 pages and a final
empty seek. Complete bootstrap before expecting compact pruning or complete
statistics. Once ready, mutation triggers maintain counts without another full
daily reconciliation scan.

## Read and cleanup bounds

- Counter reconciliation: at most three indexed traversals of 500 source keys
  per table per step; no unbounded table count.
- Identity expiry: at most 500 market rows and 500 alias rows per invocation,
  selected by leading expiry indexes before deletion.
- Compact cap: inspect at most 500 oldest cursor-ordered candidates; indexed
  newer-peer probes remove duplicates before any complete-cycle singleton
  fallback. Delete at most 500 events, respecting the exact tracked cap.
- Orphans: first select at most 500 combo IDs by primary key, then probe event
  existence. A LIMIT after a broad anti-join is not used.
- Legacy retention: inspect at most 500 old cursor-ordered candidates; keep ten
  observations per exact collection/model/backdrop. Separate timestamp and
  sale-ID seeks avoid scanning equal-timestamp prefixes. Candidate SQL chunks
  use at most 90 IDs, staying below D1's bind limit.
- Touched-combo ingestion: process at most 25 touched identities, remove at most
  500 redundant events per identity after an indexed offset of at most 20.
  Excess compaction is deferred to later touches/global traversal. Legacy
  symbol-split combo rows are conservatively retained; verify/consolidate such
  historical rows before claiming exact storage parity. Symbols select no price.
- Automatic `/stats` uses complete compact counters and indexed one-row time
  bounds. Partial/missing counts are `null` with an explicit status. Legacy sale
  totals/distinct counts are not materialized and remain explicitly unknown in
  the default response. Expensive forensic `?includeLegacy=1` requires auth.

## Full-corpus baseline preparation

Each source API call advances one indexed raw page of at most 500 sales. The
baseline refresh caller makes at most eight such calls (4,000 source rows) per
invocation. Counts, exact sorted-price quantiles, and the existing chronological
stride plus high-value training selection are separate durable phases. All
frozen sale observations contribute; training is the existing bounded training
selection, not a replacement sample for cohort distributions or denominators.

A generation freezes the highest source rowid and indexed time/price bounds.
Raw pages are limited **before** filtering newer rowids; their raw cursor always
advances. This prevents a watermark predicate from scanning unlimited fresh rows
to find 500 older members. Appends above the boundary do not restart work.
Material updates/deletes/reinserts of frozen members invalidate and restart it;
identical upserts do not. Training semantics are captured at publication under a
separate revision guard. No second full evidence corpus is stored.

Only a complete generation is published. Its prepared time, source cutoff,
source revision, semantic revision and 24-hour freshness deadline are explicit.
Preparation older than 24 hours restarts. Prior published data stays durable
during partial/failed work; expired source data is not returned as complete.
The refresh script preserves source freshness timestamps rather than extending
them on repeated cache reads. Size guards reject checkpoint/publication JSON
above 1.5MB. Leases and compare-and-set publication prevent overlapping or
invalidated work from publishing partial cohorts or training.

The baseline CLI preserves its existing no-argument contract: it rebuilds
baselines **and exact per-name valuations** from the complete sale ledger.
`--full-rebuild` remains an explicit alias for that behavior. This path remains
expensive; `npm run valuation:baselines` and the dispatcher role with no arguments
must NOT be described or enabled as a quota-safe cron. They no longer invoke
identity maintenance after every refresh, but their full-ledger work still needs
an independently approved budget/cadence.

Prepared aggregate-only work requires `--prepared`; the existing edge refresh
caller already opts into `aggregateSource:true` and preserves its partial state.
Prepared aggregate publication does not replace the exact per-name valuation
producer. A bounded exact-valuation producer/cadence and caller cutover are still
production gates. Do not switch an existing exact-valuation schedule to prepared
aggregates without supplying and verifying that producer.

### Scale and cadence gates remain incomplete

At an existing five-minute refresh cadence, eight steps allow at most 1.152m
source-row examinations per day for the kind currently being prepared, before
metadata/index/semantic reads and all other account workloads. A static ~194k
Username corpus needs approximately three passes (~582k source observations),
so it can finish within 24 hours only if invocation completion, mutation rate
and total account headroom support that schedule. DNS needs two passes.

A 2m Username corpus needs about 6m source observations for three exact passes,
already exceeding the account's 5m free daily read cap before overhead. Therefore
the configured storage maximum is **not** evidence that exact daily preparation
fits the account plan. Do not enable an unachievable cadence, silently sample
the cohort corpus, extend staleness policy, or resume cleanup to hide this.
Measure actual corpus sizes, billed D1 query reads, generation duration/restarts,
write/storage overhead, source freshness and account-wide totals. Adjust the
approved schedule/plan before rollout if the 24-hour generation gate cannot pass.

## Local evidence and remaining production gates

`test/d1-bounded-maintenance.test.js` executes the actual emitted worker SQL on
SQLite. `scripts/measure-d1-bounded-queries.py` replays it on 10,000 and 200,000
row fixtures with VM-instruction progress counters and EXPLAIN plans. Detailed
local results are in `docs/d1-bounded-sql-metrics.json`; these are SQLite VM work,
not claimed Cloudflare billed rows. The regression check rejects statements
above 100k VM steps or material growth with a 20x corpus increase.

The measurement exposed a real correlated equal-timestamp prefix scan (459,200
VM instructions for 90 candidates). The indexed split-range replacement used
17,800 instructions at both corpus sizes. Source pages and count checkpoints
also stayed independent of corpus size. Behavioral tests cover partial counters,
delete/reinsert behind a counter cursor, evidence-preserving cap/retention,
complete exact quantiles/training, concurrent new sales, material/no-op updates,
held leases, missing schema, empty evidence, stats unknown states and operator
bootstrap guards.

Still required before a production completion claim: authenticated schema and
corpus audit, explicit migration approval/execution, budgeted counter bootstrap,
full baseline preparation/caller canary, cold oversized combo canary, source
freshness and exact-projection producer checks, and one-hour/twelve-hour/daily D1
Insights comparison across every consumer. Keep the Gift cleanup pause enabled
until these gates pass. No live Gift price recovery or account quota recovery is
claimed by local syntax/tests alone.

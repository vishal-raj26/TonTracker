# TON DNS Estimator Deployment Runbook

## Production Contract

TON DNS uses the compact identity D1 ledger. It does not use either Gift D1
database, does not make request-time market calls, and must not run inside
`gallant-charisma`.

```text
TonAPI ownership -> prepared D1 valuation -> portfolio response
```

An unprepared or low-confidence value remains unavailable; the app must never
invent a price or wait while a marketplace is crawled.

## Services

| Service | Cadence | Responsibility |
| --- | --- | --- |
| `dns-d1-ingest-cron` | every 5 minutes | verified TonAPI membership, then completed on-chain DNS sales from TON Center |
| `identity-baseline-cron` | hourly | recompute compact DNS and Username baselines and valuations |
| `tontrack-app` | request time | read prepared D1 values only |

The retired PostgreSQL DNS workers are rollback artifacts only. No production
worker writes to them and no portfolio request reads them.

## Required Variables

Configure these on `dns-d1-ingest-cron`:

```text
D1_REGISTRY_URL=<identity registry worker URL>
D1_INGEST_SECRET=<registry ingest secret>
TONCENTER_API_BASE_URL=https://toncenter.com/api/v3
TONCENTER_API_KEY=<optional; unauthenticated reads are paced at 1 RPS>
DNS_TONCENTER_HISTORY_DAYS=730
DNS_DIRECT_MAX_PAGE_SIZE=12
```

No marketplace key is required for live secondary-sale ingestion. The default
path reads TON Center's public indexed chain data at its unauthenticated rate
limit. A `TONCENTER_API_KEY` is optional only when we later need higher
throughput. `GETGEMS_API_KEY`, if provided, remains an optional faster source,
never a deployment prerequisite.

## Deploy

Deploy the Python cron with its own root. Deploying this service from the
repository root would replace the Python command with the Node web server.

```powershell
railway up dns-worker --path-as-root --service dns-d1-ingest-cron --environment production --detach
```

## Runtime Behaviour

1. TonAPI pages the verified TON DNS collection and writes idempotent,
   canonical `.ton` asset rows.
2. After membership completes, TON Center pages DNS ownership transfers over
   the bounded window. A transfer becomes market evidence only when its old
   owner is a recognized NFT sale contract and that contract is complete. Only
   native-GRAM completed sales with canonical asset identity are stored.
3. Each sale stores the GRAM/USD rate at its exact sale time. Current prices
   never rewrite historical USD values.
4. When the history cursor completes, the worker polls the newest TON Center
   transfer page. Cursor state lives in D1, so restarts never replay the full
   scan.
5. The baseline cron derives valuation and confidence from compact finalized
   evidence ahead of wallet imports.

The public TON Lake archive available to this project ends in 2022. It is a
manual reconciliation source only and cannot be used as live DNS market input.

## Release Gate

Before including DNS estimates in portfolio totals, verify:

- TonAPI membership is complete or has an explicit checkpoint and count.
- TON Center history has a moving cursor and completed native-GRAM sale
  contracts with event-time USD attribution.
- The baseline worker has emitted a prepared D1 valuation or an explicit
  unavailable state for each owned DNS asset.
- Wallet imports complete through D1 within the read deadline and invoke no
  market crawler.
- D1 counts, storage watermark, and sample prices pass the parity check against
  the retired store before PostgreSQL is deleted.

## Recovery And Cost Controls

- D1 checkpoints and deterministic sale IDs make retries idempotent.
- Bounded page sizes keep cron executions below their window.
- Historical rate failures retain the native-GRAM sale and leave USD pending;
  they never apply a live or default rate.
- Current valuations overwrite by identity; raw payloads and repeated listing
  snapshots are never retained in D1.
- Stop nonessential writes at the configured storage watermark. Preserve
  assets, finalized sales, and prepared valuation evidence first.

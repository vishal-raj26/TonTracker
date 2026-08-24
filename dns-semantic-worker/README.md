# TonTrack TON DNS Semantic Worker

This sidecar enriches TON DNS names for comparable retrieval. It never reads or writes a valuation price. The pricing engine remains deterministic and market-led.

## Processing order

1. Claim bounded `dns-semantic` jobs using `FOR UPDATE SKIP LOCKED` and a renewable lease.
2. Load exact reusable concepts from `dns_meaning_dictionary`.
3. Resolve NFT and domain identity from canonical `dns_domains`; payload fields only locate that row.
4. Build and immediately persist a deterministic profile for every valid domain.
5. Reuse or generate one versioned BGE-M3 embedding in a batch.
6. Call Qwen3-8B only for ambiguous, explicitly reviewed, bad-backtest, or high-impact/low-confidence names.
7. Strictly validate Qwen JSON. Extra keys, including any price key, are rejected.
8. Atomically enqueue a `dns-valuation` refresh only when the material profile or embedding reference changes.
9. Complete the job with `enrichment_state=deferred` when optional inference is absent or unavailable. Valuation jobs are not blocked.

There is no per-wallet or per-request model inference.
The sidecar never writes `dns_valuations` or portfolio values; it only queues the existing valuation worker.

## Prerequisites

- Apply `../sql/ton-dns-estimator.sql` to operational PostgreSQL.
- The feature worker must enqueue `dns-semantic` with `payload_json.nftAddress` and `payload_json.domain`.
- For direct vector storage, provision Railway PostgreSQL from a pgvector image and apply `sql/pgvector.sql`.

## Railway deployment

Create a separate service whose root directory is `dns-semantic-worker` and Dockerfile is `Dockerfile`. Do not attach this command to the app or gift workers.

Minimum deterministic deployment:

```text
DNS_DATABASE_URL=${{dns-postgres.DATABASE_URL}}
DNS_EMBEDDING_PROVIDER=disabled
DNS_SEMANTIC_RUN_ONCE=0
```

Full semantic deployment:

```text
DNS_DATABASE_URL=${{dns-postgres.DATABASE_URL}}
DNS_EMBEDDING_PROVIDER=http
DNS_EMBEDDING_ENDPOINT=https://provider/v1/embeddings
DNS_EMBEDDING_API_KEY=...
DNS_VECTOR_DATABASE_URL=${{dns-vector-postgres.DATABASE_URL}}
DNS_QWEN_ENDPOINT=https://provider/v1/chat/completions
DNS_QWEN_API_KEY=...
```

Railway CPU should use the default image and hosted inference. `Dockerfile.local` is an explicit, heavier BGE-M3 image for a measured GPU/local runtime; Qwen is intentionally HTTP-only.

## Local run

```powershell
python -m venv .venv
.venv\Scripts\pip install -r requirements-dev.txt
$env:DNS_DATABASE_URL = "postgresql://..."
$env:DNS_SEMANTIC_RUN_ONCE = "1"
.venv\Scripts\python -m dns_semantic_worker.main
```

Run tests:

```powershell
.venv\Scripts\pytest -q
```

## Operations

Queue health:

```sql
SELECT status, count(*)
FROM dns_jobs
WHERE job_type = 'dns-semantic'
GROUP BY status;
```

Deferred enrichment:

```sql
SELECT nft_address, semantic_confidence, provenance_json
FROM dns_semantic_profiles
WHERE provenance_json->>'embedding' LIKE 'deferred:%'
   OR provenance_json->>'qwen' LIKE 'deferred:%'
ORDER BY updated_at DESC;
```

Requeue after enabling a model service:

```sql
INSERT INTO dns_jobs (job_type, dedupe_key, priority, payload_json)
SELECT 'dns-semantic', nft_address || ':dns-semantic-v1', 40,
       jsonb_build_object('nftAddress', nft_address, 'domain', domain_normalized)
FROM dns_domains
ON CONFLICT (job_type, dedupe_key)
  WHERE status IN ('queued', 'running', 'retry')
DO UPDATE SET priority = GREATEST(dns_jobs.priority, EXCLUDED.priority),
              run_after = LEAST(dns_jobs.run_after, NOW()), updated_at = NOW();
```

## Failure policy

- Database and schema errors retry with exponential backoff and eventually become `failed`.
- Jobs whose payload cannot resolve an NFT in canonical `dns_domains` retry instead of creating a payload-derived identity.
- BGE/Qwen/vector failures do not retry the whole job. A deterministic profile is saved with deferred provenance.
- Content hashes and unique database keys make retries idempotent.
- Material signatures suppress duplicate profile writes and valuation refreshes while allowing a newer semantic state to queue behind an already-running valuation.
- A configured model response that violates schema is ignored and marked deferred; it cannot affect market prices.

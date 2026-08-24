BEGIN;

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS dns_embeddings (
  record_id TEXT PRIMARY KEY,
  nft_address TEXT NOT NULL,
  domain_normalized TEXT NOT NULL,
  model_name TEXT NOT NULL,
  model_version TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  embedding vector(1024) NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (nft_address, model_name, model_version)
);

CREATE INDEX IF NOT EXISTS dns_embeddings_domain_idx
  ON dns_embeddings (domain_normalized);

-- Build this only after the initial batch to avoid slowing bulk ingestion.
-- CREATE INDEX CONCURRENTLY dns_embeddings_hnsw_cosine_idx
--   ON dns_embeddings USING hnsw (embedding vector_cosine_ops)
--   WITH (m = 16, ef_construction = 128);

COMMIT;

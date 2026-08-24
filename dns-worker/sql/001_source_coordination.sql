SELECT pg_advisory_xact_lock(hashtext('tontrack-dns-worker-source-v1'));

CREATE TABLE IF NOT EXISTS dns_worker_schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dns_source_objects (
  source TEXT NOT NULL,
  stream TEXT NOT NULL,
  object_key TEXT NOT NULL,
  partition_key TEXT NOT NULL,
  etag TEXT,
  size_bytes BIGINT,
  source_last_modified TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lease_owner TEXT,
  lease_expires_at TIMESTAMPTZ,
  source_rows BIGINT,
  normalized_rows BIGINT,
  inserted_rows BIGINT,
  rejected_rows BIGINT,
  unresolved_rows BIGINT NOT NULL DEFAULT 0,
  event_time_max TIMESTAMPTZ,
  last_error TEXT,
  discovered_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  poison_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source, stream, object_key),
  CHECK (status IN (
    'pending', 'processing', 'retry', 'complete', 'poison', 'blocked_metadata'
  )),
  CHECK (attempts >= 0),
  CHECK (size_bytes IS NULL OR size_bytes >= 0)
);

CREATE INDEX IF NOT EXISTS dns_source_objects_claim_idx
  ON dns_source_objects (source, status, stream, partition_key, object_key)
  WHERE status IN ('pending', 'retry');
CREATE INDEX IF NOT EXISTS dns_source_objects_lease_idx
  ON dns_source_objects (lease_expires_at)
  WHERE status = 'processing';

CREATE TABLE IF NOT EXISTS dns_catalog_members (
  nft_address TEXT PRIMARY KEY,
  collection_address TEXT NOT NULL,
  nft_index NUMERIC(78, 0),
  owner_address TEXT,
  domain_raw TEXT,
  domain_normalized TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata_resolved_at TIMESTAMPTZ,
  metadata_skipped_at TIMESTAMPTZ,
  metadata_skip_reason TEXT,
  feature_enqueued_at TIMESTAMPTZ,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  source_object_key TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (nft_address ~ '^-?[0-9]+:[0-9a-f]{64}$'),
  CHECK (collection_address ~ '^-?[0-9]+:[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS dns_catalog_members_domain_idx
  ON dns_catalog_members (domain_normalized);

ALTER TABLE dns_catalog_members
  ADD COLUMN IF NOT EXISTS feature_enqueued_at TIMESTAMPTZ;
ALTER TABLE dns_catalog_members
  ADD COLUMN IF NOT EXISTS metadata_skipped_at TIMESTAMPTZ;
ALTER TABLE dns_catalog_members
  ADD COLUMN IF NOT EXISTS metadata_skip_reason TEXT;

INSERT INTO dns_worker_schema_migrations (version)
VALUES ('001-source-coordination')
ON CONFLICT (version) DO NOTHING;

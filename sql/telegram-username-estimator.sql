BEGIN;

CREATE TABLE IF NOT EXISTS username_schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS username_assets (
  nft_address TEXT PRIMARY KEY,
  collection_address TEXT NOT NULL,
  username_normalized TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  owner_address TEXT,
  nft_index NUMERIC(78, 0),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS username_assets_collection_idx ON username_assets(collection_address, nft_index);
CREATE INDEX IF NOT EXISTS username_assets_name_idx ON username_assets(username_normalized);

CREATE TABLE IF NOT EXISTS username_asset_aliases (
  alias_address TEXT PRIMARY KEY,
  nft_address TEXT NOT NULL REFERENCES username_assets(nft_address) ON DELETE CASCADE,
  source TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS username_asset_aliases_canonical_idx ON username_asset_aliases(nft_address);

CREATE TABLE IF NOT EXISTS username_market_events (
  event_id TEXT PRIMARY KEY,
  nft_address TEXT NOT NULL REFERENCES username_assets(nft_address) ON DELETE RESTRICT,
  username_normalized TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_time TIMESTAMPTZ NOT NULL,
  tx_hash TEXT,
  trace_id TEXT,
  marketplace TEXT,
  seller_address TEXT,
  buyer_address TEXT,
  price_gram NUMERIC(38, 9),
  historical_usd_rate NUMERIC(30, 12),
  price_usd NUMERIC(38, 10),
  payment_asset TEXT NOT NULL DEFAULT 'GRAM',
  is_finalized BOOLEAN NOT NULL DEFAULT FALSE,
  is_cancelled BOOLEAN NOT NULL DEFAULT FALSE,
  reliability_score NUMERIC(6, 5) NOT NULL DEFAULT 1,
  quality_flags_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT NOT NULL,
  source_event_id TEXT,
  raw_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  inserted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (price_gram IS NULL OR price_gram > 0),
  CHECK (price_usd IS NULL OR price_usd > 0)
);
CREATE INDEX IF NOT EXISTS username_market_events_lookup_idx ON username_market_events(nft_address, event_time DESC);
CREATE INDEX IF NOT EXISTS username_market_events_sale_idx ON username_market_events(is_finalized, is_cancelled, event_time DESC) WHERE price_usd > 0;

CREATE TABLE IF NOT EXISTS username_market_state (
  nft_address TEXT PRIMARY KEY REFERENCES username_assets(nft_address) ON DELETE CASCADE,
  lowest_ask_gram NUMERIC(38, 9),
  highest_bid_gram NUMERIC(38, 9),
  marketplace TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stale_at TIMESTAMPTZ,
  verified BOOLEAN NOT NULL DEFAULT FALSE,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS username_static_features (
  nft_address TEXT NOT NULL REFERENCES username_assets(nft_address) ON DELETE CASCADE,
  feature_version TEXT NOT NULL,
  primary_route TEXT NOT NULL,
  character_length INTEGER NOT NULL,
  script TEXT NOT NULL,
  scarcity_class TEXT NOT NULL,
  feature_json JSONB NOT NULL,
  semantic_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (nft_address, feature_version)
);
CREATE INDEX IF NOT EXISTS username_static_features_route_idx ON username_static_features(primary_route, character_length);

CREATE TABLE IF NOT EXISTS username_valuations (
  nft_address TEXT PRIMARY KEY REFERENCES username_assets(nft_address) ON DELETE CASCADE,
  username_normalized TEXT NOT NULL,
  estimate_usd NUMERIC(38, 10),
  range_low_usd NUMERIC(38, 10),
  range_high_usd NUMERIC(38, 10),
  confidence_score NUMERIC(6, 5) NOT NULL DEFAULT 0,
  confidence_band TEXT NOT NULL DEFAULT 'low',
  valuation_status TEXT NOT NULL,
  portfolio_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  effective_comp_count NUMERIC(12, 4) NOT NULL DEFAULT 0,
  own_sale_count INTEGER NOT NULL DEFAULT 0,
  current_listing_gram NUMERIC(38, 9),
  current_bid_gram NUMERIC(38, 9),
  estimator_version TEXT NOT NULL,
  calibration_version TEXT NOT NULL,
  explanation_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  valued_at TIMESTAMPTZ NOT NULL,
  stale_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS username_valuations_fresh_idx ON username_valuations(stale_at);

CREATE TABLE IF NOT EXISTS username_valuation_comparables (
  valuation_nft_address TEXT NOT NULL REFERENCES username_assets(nft_address) ON DELETE CASCADE,
  estimator_version TEXT NOT NULL,
  rank INTEGER NOT NULL,
  comparable_nft_address TEXT REFERENCES username_assets(nft_address) ON DELETE SET NULL,
  market_event_id TEXT REFERENCES username_market_events(event_id) ON DELETE SET NULL,
  final_weight NUMERIC(18, 10) NOT NULL,
  comparable_price_usd NUMERIC(38, 10) NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (valuation_nft_address, estimator_version, rank)
);

CREATE TABLE IF NOT EXISTS username_archetype_baselines (
  estimator_version TEXT NOT NULL,
  scope TEXT NOT NULL,
  primary_route TEXT NOT NULL DEFAULT '*',
  length_bucket TEXT NOT NULL DEFAULT '*',
  script TEXT NOT NULL DEFAULT '*',
  scarcity_class TEXT NOT NULL DEFAULT '*',
  midpoint_usd NUMERIC(38, 10) NOT NULL,
  range_low_usd NUMERIC(38, 10) NOT NULL,
  range_high_usd NUMERIC(38, 10) NOT NULL,
  evidence_count INTEGER NOT NULL,
  effective_comp_count NUMERIC(12, 4) NOT NULL,
  provenance_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stale_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (estimator_version, scope, primary_route, length_bucket, script, scarcity_class)
);

CREATE TABLE IF NOT EXISTS username_jobs (
  id BIGSERIAL PRIMARY KEY,
  job_type TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 0,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'queued',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  run_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_by TEXT,
  lease_expires_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (job_type, dedupe_key)
);
CREATE INDEX IF NOT EXISTS username_jobs_ready_idx ON username_jobs(status, run_after, priority DESC);

CREATE TABLE IF NOT EXISTS username_worker_checkpoints (
  worker_name TEXT NOT NULL,
  checkpoint_key TEXT NOT NULL,
  cursor_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (worker_name, checkpoint_key)
);

COMMIT;

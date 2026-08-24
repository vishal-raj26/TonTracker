BEGIN;

SELECT pg_advisory_xact_lock(hashtext('tontrack-ton-dns-estimator-v1'));

CREATE TABLE IF NOT EXISTS dns_schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS dns_domains (
  nft_address TEXT PRIMARY KEY,
  collection_address TEXT NOT NULL,
  domain_raw TEXT NOT NULL,
  domain_normalized TEXT NOT NULL UNIQUE,
  label_normalized TEXT NOT NULL,
  owner_address TEXT,
  nft_index NUMERIC(78, 0),
  registered_at TIMESTAMPTZ,
  last_renewed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  lifecycle_status TEXT NOT NULL DEFAULT 'unknown',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  source TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (length(btrim(nft_address)) > 0),
  CHECK (length(btrim(collection_address)) > 0),
  CHECK (length(btrim(domain_normalized)) > 0),
  CHECK (length(btrim(label_normalized)) > 0)
);

CREATE INDEX IF NOT EXISTS dns_domains_lifecycle_expiry_idx
  ON dns_domains (lifecycle_status, expires_at);
CREATE INDEX IF NOT EXISTS dns_domains_collection_index_idx
  ON dns_domains (collection_address, nft_index);
CREATE INDEX IF NOT EXISTS dns_domains_label_idx
  ON dns_domains (label_normalized);

CREATE TABLE IF NOT EXISTS dns_market_events (
  event_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  source_event_id TEXT,
  source_partition TEXT,
  nft_address TEXT NOT NULL REFERENCES dns_domains(nft_address)
    ON DELETE RESTRICT DEFERRABLE INITIALLY DEFERRED,
  domain_normalized TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_time TIMESTAMPTZ NOT NULL,
  tx_hash TEXT,
  trace_id TEXT,
  logical_time NUMERIC(78, 0),
  marketplace_address TEXT,
  marketplace_name TEXT,
  sale_contract TEXT,
  sale_contract_code_hash TEXT,
  seller_address TEXT,
  buyer_or_bidder_address TEXT,
  price_nano_gram NUMERIC(78, 0),
  price_gram NUMERIC(38, 9),
  historical_usd_rate NUMERIC(30, 12),
  historical_usd_value NUMERIC(38, 10),
  rate_observed_at TIMESTAMPTZ,
  payment_asset TEXT NOT NULL DEFAULT 'GRAM',
  is_finalized BOOLEAN NOT NULL DEFAULT FALSE,
  is_cancelled BOOLEAN NOT NULL DEFAULT FALSE,
  quality_flags_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_hash TEXT,
  raw_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (length(btrim(event_id)) > 0),
  CHECK (length(btrim(source)) > 0),
  CHECK (length(btrim(event_type)) > 0),
  CHECK (price_nano_gram IS NULL OR price_nano_gram >= 0),
  CHECK (price_gram IS NULL OR price_gram >= 0),
  CHECK (historical_usd_rate IS NULL OR historical_usd_rate >= 0),
  CHECK (historical_usd_value IS NULL OR historical_usd_value >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS dns_market_events_source_event_uidx
  ON dns_market_events (source, source_event_id)
  WHERE source_event_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dns_market_events_chain_identity_uidx
  ON dns_market_events (
    source,
    tx_hash,
    event_type,
    nft_address,
    COALESCE(logical_time, -1::numeric)
  )
  WHERE tx_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS dns_market_events_raw_hash_uidx
  ON dns_market_events (source, raw_hash)
  WHERE raw_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS dns_market_events_domain_time_idx
  ON dns_market_events (nft_address, event_time DESC);
CREATE INDEX IF NOT EXISTS dns_market_events_route_input_idx
  ON dns_market_events (domain_normalized, event_type, event_time DESC);
CREATE INDEX IF NOT EXISTS dns_market_events_market_time_idx
  ON dns_market_events (marketplace_name, event_time DESC);

CREATE TABLE IF NOT EXISTS dns_exchange_rates (
  pair TEXT NOT NULL DEFAULT 'GRAM/USD',
  observed_at TIMESTAMPTZ NOT NULL,
  rate_usd NUMERIC(30, 12) NOT NULL,
  source TEXT NOT NULL,
  granularity TEXT NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (pair, observed_at, source),
  CHECK (rate_usd > 0)
);

CREATE INDEX IF NOT EXISTS dns_exchange_rates_pair_time_idx
  ON dns_exchange_rates (pair, observed_at DESC);

CREATE TABLE IF NOT EXISTS dns_market_event_usd (
  event_id TEXT PRIMARY KEY REFERENCES dns_market_events(event_id) ON DELETE RESTRICT,
  pair TEXT NOT NULL DEFAULT 'GRAM/USD',
  rate_usd NUMERIC(30, 12) NOT NULL,
  historical_usd_value NUMERIC(38, 10) NOT NULL,
  rate_observed_at TIMESTAMPTZ NOT NULL,
  rate_source TEXT NOT NULL,
  attribution_method TEXT NOT NULL,
  attributed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  CHECK (rate_usd > 0),
  CHECK (historical_usd_value >= 0)
);

CREATE INDEX IF NOT EXISTS dns_market_event_usd_rate_time_idx
  ON dns_market_event_usd (rate_observed_at DESC);

CREATE OR REPLACE FUNCTION dns_reject_market_event_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'dns_market_events is append-only; corrections must be appended as new evidence';
END;
$$;

DROP TRIGGER IF EXISTS dns_market_events_immutable ON dns_market_events;
CREATE TRIGGER dns_market_events_immutable
  BEFORE UPDATE OR DELETE ON dns_market_events
  FOR EACH ROW EXECUTE FUNCTION dns_reject_market_event_mutation();

CREATE TABLE IF NOT EXISTS dns_current_market (
  nft_address TEXT PRIMARY KEY REFERENCES dns_domains(nft_address) ON DELETE CASCADE,
  listing_gram NUMERIC(38, 9),
  highest_bid_gram NUMERIC(38, 9),
  listing_status TEXT NOT NULL DEFAULT 'unknown',
  marketplace_address TEXT,
  marketplace_name TEXT,
  sale_contract TEXT,
  sale_contract_code_hash TEXT,
  source TEXT NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  validity_flags_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  observed_at TIMESTAMPTZ NOT NULL,
  stale_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (listing_gram IS NULL OR listing_gram >= 0),
  CHECK (highest_bid_gram IS NULL OR highest_bid_gram >= 0)
);

CREATE INDEX IF NOT EXISTS dns_current_market_stale_idx
  ON dns_current_market (stale_at, observed_at);

CREATE TABLE IF NOT EXISTS dns_structural_features (
  nft_address TEXT PRIMARY KEY REFERENCES dns_domains(nft_address) ON DELETE CASCADE,
  primary_route TEXT NOT NULL,
  character_length INTEGER NOT NULL,
  byte_length INTEGER NOT NULL,
  script TEXT,
  language_hints TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  character_class TEXT,
  scarcity_class TEXT,
  repetition_signature TEXT,
  unique_character_count INTEGER,
  token_count INTEGER,
  has_sequence BOOLEAN NOT NULL DEFAULT FALSE,
  has_palindrome BOOLEAN NOT NULL DEFAULT FALSE,
  has_repeated_run BOOLEAN NOT NULL DEFAULT FALSE,
  has_repeated_substring BOOLEAN NOT NULL DEFAULT FALSE,
  has_leading_zero BOOLEAN NOT NULL DEFAULT FALSE,
  has_trailing_zero BOOLEAN NOT NULL DEFAULT FALSE,
  has_separator BOOLEAN NOT NULL DEFAULT FALSE,
  is_mixed_script BOOLEAN NOT NULL DEFAULT FALSE,
  has_confusable BOOLEAN NOT NULL DEFAULT FALSE,
  pronounceability_score DOUBLE PRECISION,
  feature_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  classifier_version TEXT NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (character_length >= 0),
  CHECK (byte_length >= 0),
  CHECK (unique_character_count IS NULL OR unique_character_count >= 0),
  CHECK (token_count IS NULL OR token_count >= 0),
  CHECK (pronounceability_score IS NULL OR pronounceability_score BETWEEN 0 AND 1)
);

CREATE INDEX IF NOT EXISTS dns_structural_features_route_idx
  ON dns_structural_features (primary_route, scarcity_class, character_length);
CREATE INDEX IF NOT EXISTS dns_structural_features_signature_idx
  ON dns_structural_features (repetition_signature)
  WHERE repetition_signature IS NOT NULL;

CREATE TABLE IF NOT EXISTS dns_semantic_profiles (
  nft_address TEXT PRIMARY KEY REFERENCES dns_domains(nft_address) ON DELETE CASCADE,
  profile_version TEXT NOT NULL,
  language TEXT,
  script TEXT,
  semantic_categories TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  entity_type TEXT,
  canonical_entity TEXT,
  dictionary_meanings_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  abbreviation_expansions_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  ton_relevance DOUBLE PRECISION,
  telegram_relevance DOUBLE PRECISION,
  crypto_relevance DOUBLE PRECISION,
  memorability_score DOUBLE PRECISION,
  brandability_score DOUBLE PRECISION,
  commercial_intent_score DOUBLE PRECISION,
  invented_word_probability DOUBLE PRECISION,
  semantic_confidence DOUBLE PRECISION,
  provenance_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  model_name TEXT,
  model_version TEXT,
  schema_version TEXT NOT NULL,
  human_override_json JSONB,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ton_relevance IS NULL OR ton_relevance BETWEEN 0 AND 1),
  CHECK (telegram_relevance IS NULL OR telegram_relevance BETWEEN 0 AND 1),
  CHECK (crypto_relevance IS NULL OR crypto_relevance BETWEEN 0 AND 1),
  CHECK (memorability_score IS NULL OR memorability_score BETWEEN 0 AND 1),
  CHECK (brandability_score IS NULL OR brandability_score BETWEEN 0 AND 1),
  CHECK (commercial_intent_score IS NULL OR commercial_intent_score BETWEEN 0 AND 1),
  CHECK (invented_word_probability IS NULL OR invented_word_probability BETWEEN 0 AND 1),
  CHECK (semantic_confidence IS NULL OR semantic_confidence BETWEEN 0 AND 1)
);

CREATE INDEX IF NOT EXISTS dns_semantic_profiles_categories_gin_idx
  ON dns_semantic_profiles USING GIN (semantic_categories);
CREATE INDEX IF NOT EXISTS dns_semantic_profiles_language_idx
  ON dns_semantic_profiles (language, semantic_confidence DESC);

CREATE TABLE IF NOT EXISTS dns_semantic_references (
  id BIGSERIAL PRIMARY KEY,
  nft_address TEXT NOT NULL REFERENCES dns_domains(nft_address) ON DELETE CASCADE,
  reference_type TEXT NOT NULL,
  reference_key TEXT NOT NULL,
  external_store TEXT NOT NULL,
  external_record_id TEXT NOT NULL,
  model_name TEXT NOT NULL,
  model_version TEXT NOT NULL,
  dimensions INTEGER,
  content_hash TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (nft_address, reference_type, reference_key, model_name, model_version),
  CHECK (dimensions IS NULL OR dimensions > 0)
);

CREATE INDEX IF NOT EXISTS dns_semantic_references_external_idx
  ON dns_semantic_references (external_store, external_record_id);

CREATE TABLE IF NOT EXISTS dns_engine_versions (
  engine_name TEXT NOT NULL,
  engine_version TEXT NOT NULL,
  engine_kind TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'candidate',
  config_hash TEXT,
  config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  activated_at TIMESTAMPTZ,
  retired_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (engine_name, engine_version),
  CHECK (status IN ('candidate', 'active', 'retired', 'failed'))
);

CREATE UNIQUE INDEX IF NOT EXISTS dns_engine_versions_one_active_idx
  ON dns_engine_versions (engine_name)
  WHERE status = 'active';

CREATE TABLE IF NOT EXISTS dns_archetype_baselines (
  estimator_version TEXT NOT NULL,
  scope TEXT NOT NULL,
  primary_route TEXT NOT NULL DEFAULT '*',
  length_bucket TEXT NOT NULL DEFAULT '*',
  script TEXT NOT NULL DEFAULT '*',
  scarcity_class TEXT NOT NULL DEFAULT '*',
  midpoint_gram NUMERIC(38, 9) NOT NULL,
  range_low_gram NUMERIC(38, 9) NOT NULL,
  range_high_gram NUMERIC(38, 9) NOT NULL,
  evidence_count INTEGER NOT NULL,
  effective_comp_count DOUBLE PRECISION NOT NULL,
  acquisition_count INTEGER NOT NULL DEFAULT 0,
  resale_count INTEGER NOT NULL DEFAULT 0,
  evidence_max_time TIMESTAMPTZ NOT NULL,
  provenance_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  stale_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (
    estimator_version, scope, primary_route, length_bucket, script, scarcity_class
  ),
  CHECK (scope IN ('archetype', 'route-length', 'route', 'global')),
  CHECK (midpoint_gram > 0),
  CHECK (range_low_gram > 0 AND range_high_gram >= range_low_gram),
  CHECK (evidence_count > 0),
  CHECK (effective_comp_count > 0)
);

CREATE INDEX IF NOT EXISTS dns_archetype_baselines_ready_idx
  ON dns_archetype_baselines (estimator_version, stale_at, scope);

CREATE TABLE IF NOT EXISTS dns_valuations (
  nft_address TEXT PRIMARY KEY REFERENCES dns_domains(nft_address) ON DELETE CASCADE,
  domain_normalized TEXT NOT NULL,
  estimate_gram NUMERIC(38, 9),
  range_low_gram NUMERIC(38, 9),
  range_high_gram NUMERIC(38, 9),
  confidence_score DOUBLE PRECISION,
  confidence_band TEXT,
  valuation_status TEXT NOT NULL,
  portfolio_eligible BOOLEAN NOT NULL DEFAULT FALSE,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  effective_comp_count DOUBLE PRECISION NOT NULL DEFAULT 0,
  own_sale_count INTEGER NOT NULL DEFAULT 0,
  current_listing_gram NUMERIC(38, 9),
  current_bid_gram NUMERIC(38, 9),
  market_regime_id TEXT,
  feature_version TEXT NOT NULL,
  semantic_version TEXT,
  estimator_version TEXT NOT NULL,
  calibration_version TEXT NOT NULL,
  evidence_summary_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  explanation_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  valued_at TIMESTAMPTZ NOT NULL,
  stale_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (estimate_gram IS NULL OR estimate_gram >= 0),
  CHECK (range_low_gram IS NULL OR range_low_gram >= 0),
  CHECK (range_high_gram IS NULL OR range_high_gram >= 0),
  CHECK (range_low_gram IS NULL OR range_high_gram IS NULL OR range_low_gram <= range_high_gram),
  CHECK (estimate_gram IS NULL OR range_low_gram IS NULL OR estimate_gram >= range_low_gram),
  CHECK (estimate_gram IS NULL OR range_high_gram IS NULL OR estimate_gram <= range_high_gram),
  CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0 AND 1),
  CHECK (confidence_band IS NULL OR confidence_band IN ('low', 'medium', 'high')),
  CHECK (evidence_count >= 0),
  CHECK (effective_comp_count >= 0),
  CHECK (own_sale_count >= 0),
  CHECK (current_listing_gram IS NULL OR current_listing_gram >= 0),
  CHECK (current_bid_gram IS NULL OR current_bid_gram >= 0)
);

CREATE INDEX IF NOT EXISTS dns_valuations_status_stale_idx
  ON dns_valuations (valuation_status, stale_at);
CREATE INDEX IF NOT EXISTS dns_valuations_version_idx
  ON dns_valuations (estimator_version, calibration_version, confidence_band);
CREATE INDEX IF NOT EXISTS dns_valuations_domain_idx
  ON dns_valuations (domain_normalized);

CREATE TABLE IF NOT EXISTS dns_valuation_comparables (
  valuation_nft_address TEXT NOT NULL REFERENCES dns_valuations(nft_address) ON DELETE CASCADE,
  estimator_version TEXT NOT NULL,
  rank INTEGER NOT NULL,
  comparable_nft_address TEXT NOT NULL REFERENCES dns_domains(nft_address) ON DELETE RESTRICT,
  market_event_id TEXT REFERENCES dns_market_events(event_id) ON DELETE RESTRICT,
  structural_similarity DOUBLE PRECISION,
  semantic_similarity DOUBLE PRECISION,
  recency_weight DOUBLE PRECISION,
  quality_weight DOUBLE PRECISION,
  liquidity_weight DOUBLE PRECISION,
  market_regime_weight DOUBLE PRECISION,
  final_weight DOUBLE PRECISION NOT NULL,
  comparable_price_gram NUMERIC(38, 9) NOT NULL,
  selected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (valuation_nft_address, estimator_version, rank),
  CHECK (rank > 0),
  CHECK (structural_similarity IS NULL OR structural_similarity BETWEEN 0 AND 1),
  CHECK (semantic_similarity IS NULL OR semantic_similarity BETWEEN 0 AND 1),
  CHECK (final_weight >= 0),
  CHECK (comparable_price_gram >= 0)
);

CREATE INDEX IF NOT EXISTS dns_valuation_comparables_event_idx
  ON dns_valuation_comparables (market_event_id);
CREATE INDEX IF NOT EXISTS dns_valuation_comparables_comp_idx
  ON dns_valuation_comparables (comparable_nft_address);

CREATE TABLE IF NOT EXISTS dns_meaning_dictionary (
  term_normalized TEXT NOT NULL,
  language TEXT NOT NULL DEFAULT 'und',
  meaning_key TEXT NOT NULL,
  meaning_json JSONB NOT NULL,
  semantic_categories TEXT[] NOT NULL DEFAULT ARRAY[]::text[],
  provenance_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence DOUBLE PRECISION NOT NULL,
  model_name TEXT,
  model_version TEXT,
  human_override_json JSONB,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (term_normalized, language, meaning_key),
  CHECK (confidence BETWEEN 0 AND 1)
);

CREATE INDEX IF NOT EXISTS dns_meaning_dictionary_categories_gin_idx
  ON dns_meaning_dictionary USING GIN (semantic_categories);

CREATE TABLE IF NOT EXISTS dns_jobs (
  id BIGSERIAL PRIMARY KEY,
  job_type TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  priority INTEGER NOT NULL DEFAULT 0,
  payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  result_json JSONB,
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  run_after TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_by TEXT,
  locked_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  last_error TEXT,
  error_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (status IN ('queued', 'running', 'retry', 'completed', 'failed', 'cancelled')),
  CHECK (attempts >= 0),
  CHECK (max_attempts > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS dns_jobs_active_dedupe_uidx
  ON dns_jobs (job_type, dedupe_key)
  WHERE status IN ('queued', 'running', 'retry');
CREATE INDEX IF NOT EXISTS dns_jobs_claim_idx
  ON dns_jobs (priority DESC, run_after, id)
  WHERE status IN ('queued', 'running', 'retry');
CREATE INDEX IF NOT EXISTS dns_jobs_lease_idx
  ON dns_jobs (lease_expires_at)
  WHERE status = 'running';

CREATE TABLE IF NOT EXISTS dns_job_checkpoints (
  worker_name TEXT NOT NULL,
  checkpoint_key TEXT NOT NULL,
  cursor_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  checkpoint_version TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (worker_name, checkpoint_key)
);

CREATE TABLE IF NOT EXISTS dns_source_watermarks (
  source TEXT NOT NULL,
  stream TEXT NOT NULL,
  partition_key TEXT NOT NULL DEFAULT 'default',
  cursor_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  event_time TIMESTAMPTZ,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (source, stream, partition_key)
);

INSERT INTO dns_schema_migrations (version)
VALUES ('001-ton-dns-estimator-persistence')
ON CONFLICT (version) DO NOTHING;

INSERT INTO dns_schema_migrations (version)
VALUES ('002-ton-dns-historical-usd-attribution')
ON CONFLICT (version) DO NOTHING;

COMMIT;

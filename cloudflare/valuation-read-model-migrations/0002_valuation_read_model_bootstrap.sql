-- Bootstrap every compact identity-ledger table required by the production
-- DNS and Telegram Username request path. 0001 may already have installed
-- aliases; all statements are deliberately idempotent for existing D1s.

CREATE TABLE IF NOT EXISTS valuation_records (
  asset_kind TEXT NOT NULL CHECK (asset_kind IN ('dns', 'username')),
  asset_key TEXT NOT NULL,
  display_name TEXT NOT NULL,
  estimate_usd REAL,
  range_low_usd REAL,
  range_high_usd REAL,
  confidence_score REAL NOT NULL DEFAULT 0,
  confidence_band TEXT NOT NULL DEFAULT 'low',
  valuation_status TEXT NOT NULL,
  portfolio_eligible INTEGER NOT NULL DEFAULT 0,
  evidence_count INTEGER NOT NULL DEFAULT 0,
  effective_comp_count REAL NOT NULL DEFAULT 0,
  own_sale_count INTEGER NOT NULL DEFAULT 0,
  current_listing_gram REAL,
  current_bid_gram REAL,
  market_platform TEXT,
  estimator_version TEXT NOT NULL,
  calibration_version TEXT NOT NULL,
  valued_at TEXT NOT NULL,
  stale_at TEXT NOT NULL,
  explanation_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (asset_kind, asset_key)
);
CREATE INDEX IF NOT EXISTS valuation_records_lookup_idx ON valuation_records(asset_kind, stale_at);

CREATE TABLE IF NOT EXISTS valuation_projection_state (
  projection_key TEXT PRIMARY KEY,
  cursor_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS identity_assets (
  asset_kind TEXT NOT NULL CHECK (asset_kind IN ('dns', 'username')),
  asset_key TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  display_name TEXT NOT NULL,
  primary_route TEXT NOT NULL DEFAULT 'residual',
  length_bucket TEXT NOT NULL DEFAULT '*',
  script TEXT NOT NULL DEFAULT 'Common',
  scarcity_class TEXT NOT NULL DEFAULT 'standard',
  feature_json TEXT NOT NULL DEFAULT '{}',
  semantic_json TEXT NOT NULL DEFAULT '{}',
  source_updated_at TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (asset_kind, asset_key)
);
CREATE UNIQUE INDEX IF NOT EXISTS identity_assets_name_idx ON identity_assets(asset_kind, normalized_name);
CREATE INDEX IF NOT EXISTS identity_assets_archetype_idx ON identity_assets(asset_kind, primary_route, length_bucket, script, scarcity_class);

CREATE TABLE IF NOT EXISTS identity_asset_aliases (
  asset_kind TEXT NOT NULL CHECK (asset_kind IN ('dns', 'username')),
  alias_key TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  asset_key TEXT,
  source TEXT NOT NULL,
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (asset_kind, alias_key)
);
CREATE INDEX IF NOT EXISTS identity_asset_aliases_name_idx ON identity_asset_aliases(asset_kind, normalized_name);
CREATE INDEX IF NOT EXISTS identity_asset_aliases_asset_idx ON identity_asset_aliases(asset_kind, asset_key);

CREATE TABLE IF NOT EXISTS identity_sales (
  sale_id TEXT PRIMARY KEY,
  asset_kind TEXT NOT NULL CHECK (asset_kind IN ('dns', 'username')),
  asset_key TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  sold_at INTEGER NOT NULL,
  price_gram REAL NOT NULL CHECK (price_gram > 0),
  historical_usd_rate REAL NOT NULL CHECK (historical_usd_rate > 0),
  price_usd REAL NOT NULL CHECK (price_usd > 0),
  marketplace TEXT NOT NULL,
  source TEXT NOT NULL,
  reliability_score REAL NOT NULL DEFAULT 1,
  quality_flags_json TEXT NOT NULL DEFAULT '[]',
  primary_route TEXT NOT NULL DEFAULT 'residual',
  length_bucket TEXT NOT NULL DEFAULT '*',
  script TEXT NOT NULL DEFAULT 'Common',
  scarcity_class TEXT NOT NULL DEFAULT 'standard',
  ingested_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS identity_sales_asset_time_idx ON identity_sales(asset_kind, asset_key, sold_at DESC);
CREATE INDEX IF NOT EXISTS identity_sales_name_time_idx ON identity_sales(asset_kind, normalized_name, sold_at DESC);
CREATE INDEX IF NOT EXISTS identity_sales_comparable_idx ON identity_sales(asset_kind, primary_route, length_bucket, script, scarcity_class, sold_at DESC);

CREATE TABLE IF NOT EXISTS identity_current_market (
  asset_kind TEXT NOT NULL CHECK (asset_kind IN ('dns', 'username')),
  asset_key TEXT NOT NULL,
  lowest_ask_gram REAL,
  highest_bid_gram REAL,
  marketplace TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  observed_at TEXT NOT NULL,
  stale_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (asset_kind, asset_key)
);
CREATE INDEX IF NOT EXISTS identity_current_market_stale_idx ON identity_current_market(asset_kind, stale_at);

CREATE TABLE IF NOT EXISTS identity_archetype_baselines (
  asset_kind TEXT NOT NULL CHECK (asset_kind IN ('dns', 'username')),
  estimator_version TEXT NOT NULL,
  scope TEXT NOT NULL,
  primary_route TEXT NOT NULL DEFAULT '*',
  length_bucket TEXT NOT NULL DEFAULT '*',
  script TEXT NOT NULL DEFAULT '*',
  scarcity_class TEXT NOT NULL DEFAULT '*',
  midpoint_usd REAL NOT NULL,
  range_low_usd REAL NOT NULL,
  range_high_usd REAL NOT NULL,
  evidence_count INTEGER NOT NULL,
  effective_comp_count REAL NOT NULL,
  generated_at TEXT NOT NULL,
  stale_at TEXT NOT NULL,
  provenance_json TEXT NOT NULL DEFAULT '{}',
  PRIMARY KEY (asset_kind, estimator_version, scope, primary_route, length_bucket, script, scarcity_class)
);
CREATE INDEX IF NOT EXISTS identity_archetype_baselines_ready_idx ON identity_archetype_baselines(asset_kind, estimator_version, stale_at);

CREATE TABLE IF NOT EXISTS identity_pipeline_state (
  pipeline_key TEXT PRIMARY KEY,
  cursor_json TEXT NOT NULL DEFAULT '{}',
  metadata_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS identity_storage_policy (
  policy_key TEXT PRIMARY KEY,
  tracked_assets INTEGER NOT NULL DEFAULT 0,
  tracked_sales INTEGER NOT NULL DEFAULT 0,
  tracked_valuations INTEGER NOT NULL DEFAULT 0,
  max_assets INTEGER NOT NULL DEFAULT 1000000,
  max_sales INTEGER NOT NULL DEFAULT 2000000,
  max_valuations INTEGER NOT NULL DEFAULT 1000000,
  warning_ratio REAL NOT NULL DEFAULT 0.75,
  stop_ratio REAL NOT NULL DEFAULT 0.90,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT OR IGNORE INTO identity_storage_policy (policy_key) VALUES ('primary');

CREATE TABLE IF NOT EXISTS gift_floor_collections (
  collection_key TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  gift_id TEXT,
  recent_sales JSONB DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS gift_floor_snapshots (
  id BIGSERIAL PRIMARY KEY,
  collection_key TEXT NOT NULL REFERENCES gift_floor_collections(collection_key) ON DELETE CASCADE,
  sampled_at TIMESTAMPTZ NOT NULL,
  floor_ton NUMERIC(24,9),
  floor_usd NUMERIC(24,6),
  ton_usd_rate NUMERIC(18,8),
  source TEXT,
  listed_count INT,
  total_supply INT,
  opened INT,
  onchain INT,
  holders INT,
  volume_24h_ton NUMERIC(24,9),
  volume_24h_usd NUMERIC(24,6),
  sales_24h INT,
  sales_30d INT,
  change_24h_pct NUMERIC(12,4),
  period_change_pct NUMERIC(12,4),
  ath_floor_usd NUMERIC(24,6),
  market_updated_at TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gift_floor_snapshots_collection_time_idx
  ON gift_floor_snapshots(collection_key, sampled_at DESC);

CREATE TABLE IF NOT EXISTS gift_model_floor_snapshots (
  id BIGSERIAL PRIMARY KEY,
  collection_key TEXT NOT NULL REFERENCES gift_floor_collections(collection_key) ON DELETE CASCADE,
  model_key TEXT NOT NULL,
  model_name TEXT NOT NULL,
  sampled_at TIMESTAMPTZ NOT NULL,
  floor_ton NUMERIC(24,9),
  floor_usd NUMERIC(24,6),
  ton_usd_rate NUMERIC(18,8),
  source TEXT,
  listed_count INT,
  deals_30d INT,
  avg_30d_ton NUMERIC(24,9),
  avg_30d_usd NUMERIC(24,6),
  model_count INT,
  rarity NUMERIC(12,4),
  market_updated_at TEXT,
  icon_url TEXT,
  animation_url TEXT,
  media_type TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gift_model_floor_snapshots_collection_model_time_idx
  ON gift_model_floor_snapshots(collection_key, model_key, sampled_at DESC);

CREATE TABLE IF NOT EXISTS gift_attribute_registry (
  collection_key TEXT NOT NULL REFERENCES gift_floor_collections(collection_key) ON DELETE CASCADE,
  trait_type TEXT NOT NULL,
  value_key TEXT NOT NULL,
  value_name TEXT NOT NULL,
  rarity NUMERIC(12,4),
  item_count INT,
  floor_ton NUMERIC(24,9),
  metrics JSONB DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (collection_key, trait_type, value_key)
);

CREATE INDEX IF NOT EXISTS gift_attribute_registry_collection_type_idx
  ON gift_attribute_registry(collection_key, trait_type);

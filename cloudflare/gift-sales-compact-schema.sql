-- Compact 365-day sale storage. Trait labels are stored once per exact combo;
-- every sale event only stores the fields that actually vary per transaction.
CREATE TABLE IF NOT EXISTS gift_sale_combos (
  combo_id INTEGER PRIMARY KEY,
  collection_key TEXT NOT NULL,
  collection_name TEXT NOT NULL,
  model_key TEXT NOT NULL,
  model_name TEXT NOT NULL,
  backdrop_key TEXT NOT NULL,
  backdrop_name TEXT NOT NULL,
  symbol_key TEXT NOT NULL DEFAULT '',
  symbol_name TEXT NOT NULL DEFAULT '',
  UNIQUE(collection_key, model_key, backdrop_key, symbol_key)
);

CREATE TABLE IF NOT EXISTS gift_sale_events (
  sale_id TEXT PRIMARY KEY,
  combo_id INTEGER NOT NULL,
  marketplace TEXT NOT NULL,
  slug TEXT NOT NULL DEFAULT '',
  gift_id TEXT NOT NULL DEFAULT '',
  gift_number INTEGER NOT NULL DEFAULT 0,
  price_nano INTEGER NOT NULL,
  price_usd_micros INTEGER NOT NULL,
  ton_usd_micros INTEGER NOT NULL,
  rate_at INTEGER NOT NULL,
  sold_at INTEGER NOT NULL,
  ingested_at INTEGER NOT NULL
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS gift_sale_events_combo_time_idx
  ON gift_sale_events(combo_id, sold_at DESC);

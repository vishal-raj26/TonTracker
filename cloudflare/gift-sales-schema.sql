CREATE TABLE IF NOT EXISTS gift_sales (
  sale_id TEXT PRIMARY KEY,
  collection_key TEXT NOT NULL,
  collection_name TEXT NOT NULL,
  model_key TEXT NOT NULL,
  model_name TEXT NOT NULL,
  backdrop_key TEXT NOT NULL,
  backdrop_name TEXT NOT NULL,
  symbol_key TEXT NOT NULL DEFAULT '',
  symbol_name TEXT NOT NULL DEFAULT '',
  marketplace TEXT NOT NULL,
  slug TEXT NOT NULL DEFAULT '',
  gift_id TEXT NOT NULL DEFAULT '',
  gift_number INTEGER NOT NULL DEFAULT 0,
  price_ton REAL NOT NULL,
  original_price TEXT NOT NULL DEFAULT '',
  sold_at TEXT NOT NULL,
  gift_url TEXT NOT NULL DEFAULT '',
  ingested_at TEXT NOT NULL
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS gift_sales_exact_combo_time_idx
  ON gift_sales(collection_key, model_key, backdrop_key, sold_at DESC);

CREATE INDEX IF NOT EXISTS gift_sales_collection_time_idx
  ON gift_sales(collection_key, sold_at DESC);

CREATE TABLE IF NOT EXISTS gift_sales_collection_state (
  collection_key TEXT PRIMARY KEY,
  collection_name TEXT NOT NULL,
  newest_sale_id TEXT NOT NULL DEFAULT '',
  newest_sold_at TEXT NOT NULL DEFAULT '',
  last_scanned_at TEXT NOT NULL,
  pages_scanned INTEGER NOT NULL DEFAULT 0,
  rows_seen INTEGER NOT NULL DEFAULT 0,
  rows_inserted INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL DEFAULT 'gift-satellite'
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS gift_sales_backfill_state (
  collection_key TEXT PRIMARY KEY,
  collection_name TEXT NOT NULL,
  next_page INTEGER NOT NULL DEFAULT 0,
  oldest_sale_id TEXT NOT NULL DEFAULT '',
  oldest_sold_at TEXT NOT NULL DEFAULT '',
  cutoff_at TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT '',
  pages_scanned INTEGER NOT NULL DEFAULT 0,
  rows_seen INTEGER NOT NULL DEFAULT 0,
  rows_inserted INTEGER NOT NULL DEFAULT 0,
  last_scanned_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'gift-satellite',
  coverage_mode TEXT NOT NULL DEFAULT 'chronological'
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS gift_sales_scan_targets (
  target_key TEXT PRIMARY KEY,
  collection_key TEXT NOT NULL,
  collection_name TEXT NOT NULL,
  model_key TEXT NOT NULL,
  model_name TEXT NOT NULL,
  backdrop_key TEXT NOT NULL,
  backdrop_name TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  requested_at TEXT NOT NULL,
  last_scanned_at TEXT NOT NULL DEFAULT '',
  last_sale_at TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS gift_sales_scan_targets_pending_idx
  ON gift_sales_scan_targets(priority DESC, requested_at DESC, last_scanned_at);

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
  source TEXT NOT NULL DEFAULT 'gift-satellite'
) WITHOUT ROWID;

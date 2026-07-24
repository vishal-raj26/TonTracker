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

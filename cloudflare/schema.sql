CREATE TABLE IF NOT EXISTS gift_combo_collections (
  collection_key TEXT PRIMARY KEY,
  collection_name TEXT NOT NULL,
  snapshot_at TEXT NOT NULL,
  listing_count INTEGER NOT NULL DEFAULT 0,
  combination_count INTEGER NOT NULL DEFAULT 0,
  bucket_count INTEGER NOT NULL DEFAULT 32,
  source TEXT NOT NULL DEFAULT 'thermos'
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS gift_combo_buckets (
  collection_key TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  snapshot_at TEXT NOT NULL,
  combinations_json TEXT NOT NULL,
  PRIMARY KEY (collection_key, bucket)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS gift_combo_history_buckets (
  collection_key TEXT NOT NULL,
  sampled_at TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  changes_json TEXT NOT NULL,
  PRIMARY KEY (collection_key, sampled_at, bucket)
) WITHOUT ROWID;

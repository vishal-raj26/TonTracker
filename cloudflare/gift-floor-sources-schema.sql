CREATE TABLE IF NOT EXISTS gift_combo_source_buckets (
  collection_key TEXT NOT NULL,
  source TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  snapshot_at TEXT NOT NULL,
  combinations_json TEXT NOT NULL,
  PRIMARY KEY (collection_key, source, bucket)
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS gift_combo_source_buckets_source_snapshot_idx
  ON gift_combo_source_buckets(source, snapshot_at);

CREATE TABLE IF NOT EXISTS gift_combo_history_buckets (
  collection_key TEXT NOT NULL,
  sampled_at TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  changes_json TEXT NOT NULL,
  PRIMARY KEY (collection_key, sampled_at, bucket)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS gift_combo_history_segments (
  collection_key TEXT NOT NULL,
  day_start TEXT NOT NULL,
  bucket INTEGER NOT NULL,
  points_json TEXT NOT NULL,
  PRIMARY KEY (collection_key, day_start, bucket)
) WITHOUT ROWID;

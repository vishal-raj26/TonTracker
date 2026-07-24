CREATE TABLE IF NOT EXISTS gift_estimate_history_targets (
  target_key TEXT PRIMARY KEY,
  collection_key TEXT NOT NULL,
  collection_name TEXT NOT NULL,
  model_key TEXT NOT NULL,
  model_name TEXT NOT NULL,
  backdrop_key TEXT NOT NULL,
  backdrop_name TEXT NOT NULL,
  symbol_key TEXT NOT NULL DEFAULT '',
  symbol_name TEXT NOT NULL DEFAULT '',
  requested_at TEXT NOT NULL,
  last_evaluated_at TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
) WITHOUT ROWID;

CREATE INDEX IF NOT EXISTS gift_estimate_history_targets_due_idx
  ON gift_estimate_history_targets(last_evaluated_at, requested_at);

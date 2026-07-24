ALTER TABLE gift_estimate_history_targets ADD COLUMN symbol_key TEXT NOT NULL DEFAULT '';
ALTER TABLE gift_estimate_history_targets ADD COLUMN symbol_name TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS gift_estimate_history_targets_exact_due_idx
  ON gift_estimate_history_targets(collection_key, model_key, backdrop_key, symbol_key, last_evaluated_at);

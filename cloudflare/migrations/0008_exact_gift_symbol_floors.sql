-- New floor data is keyed by the full immutable gift identity.
ALTER TABLE telegram_floor_scan_targets ADD COLUMN symbol_key TEXT NOT NULL DEFAULT '';
ALTER TABLE telegram_floor_scan_targets ADD COLUMN symbol_name TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS telegram_floor_scan_targets_exact_pending_idx
  ON telegram_floor_scan_targets(collection_key, model_key, backdrop_key, symbol_key, priority DESC, requested_at DESC);

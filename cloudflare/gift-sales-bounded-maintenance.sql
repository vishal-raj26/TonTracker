-- Apply explicitly to EACH COMPACT sales shard, not the legacy gift_sales DB.
CREATE TABLE IF NOT EXISTS bounded_maintenance_state (
 job_key TEXT PRIMARY KEY, cursor TEXT NOT NULL DEFAULT '',
 total INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'partial',
 data_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 lease_until INTEGER NOT NULL DEFAULT 0, lease_token TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS gift_sale_events_time_bounded_idx ON gift_sale_events(sold_at,sale_id);
CREATE INDEX IF NOT EXISTS gift_sale_events_combo_bounded_idx ON gift_sale_events(combo_id,sold_at,sale_id);
CREATE INDEX IF NOT EXISTS gift_sale_events_ingested_bounded_idx ON gift_sale_events(ingested_at);
CREATE INDEX IF NOT EXISTS gift_sale_combos_identity_bounded_idx ON gift_sale_combos(collection_key,model_key,backdrop_key,combo_id);
INSERT OR IGNORE INTO bounded_maintenance_state(job_key) VALUES ('count:gift_sale_events');
CREATE TRIGGER IF NOT EXISTS bounded_gift_sale_events_insert AFTER INSERT ON gift_sale_events BEGIN
 UPDATE bounded_maintenance_state SET total=total+1 WHERE job_key='count:gift_sale_events' AND (status='complete' OR NEW.sale_id<=cursor);
END;
CREATE TRIGGER IF NOT EXISTS bounded_gift_sale_events_delete AFTER DELETE ON gift_sale_events BEGIN
 UPDATE bounded_maintenance_state SET total=total-1 WHERE job_key='count:gift_sale_events' AND (status='complete' OR OLD.sale_id<=cursor);
END;
INSERT OR IGNORE INTO bounded_maintenance_state(job_key) VALUES ('count:gift_sale_combos');
CREATE TRIGGER IF NOT EXISTS bounded_gift_sale_combos_insert AFTER INSERT ON gift_sale_combos BEGIN
 UPDATE bounded_maintenance_state SET total=total+1 WHERE job_key='count:gift_sale_combos' AND (status='complete' OR NEW.combo_id<=CAST(cursor AS INTEGER));
END;
CREATE TRIGGER IF NOT EXISTS bounded_gift_sale_combos_delete AFTER DELETE ON gift_sale_combos BEGIN
 UPDATE bounded_maintenance_state SET total=total-1 WHERE job_key='count:gift_sale_combos' AND (status='complete' OR OLD.combo_id<=CAST(cursor AS INTEGER));
END;
INSERT OR REPLACE INTO bounded_maintenance_state(job_key,status) VALUES ('schema:compact:v1','complete');

-- Apply explicitly to EACH LEGACY gift_sales DB only.
CREATE TABLE IF NOT EXISTS bounded_maintenance_state (
 job_key TEXT PRIMARY KEY, cursor TEXT NOT NULL DEFAULT '',
 total INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'partial',
 data_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 lease_until INTEGER NOT NULL DEFAULT 0, lease_token TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS gift_sales_time_bounded_idx ON gift_sales(sold_at,sale_id);
CREATE INDEX IF NOT EXISTS gift_sales_exact_bounded_idx ON gift_sales(collection_key,model_key,backdrop_key,sold_at,sale_id);
INSERT OR REPLACE INTO bounded_maintenance_state(job_key,status) VALUES ('schema:legacy:v1','complete');

-- Apply to tontrack-valuation-read-model only; never run automatically in request paths.
CREATE TABLE IF NOT EXISTS bounded_maintenance_state (
 job_key TEXT PRIMARY KEY, cursor INTEGER NOT NULL DEFAULT 0,
 total INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'partial',
 data_json TEXT NOT NULL DEFAULT '{}', updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 lease_until INTEGER NOT NULL DEFAULT 0, lease_token TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS identity_current_market_expiry_bounded_idx ON identity_current_market(stale_at,asset_kind,asset_key);
CREATE INDEX IF NOT EXISTS identity_aliases_expiry_bounded_idx ON identity_asset_aliases(last_seen_at,asset_kind,alias_key);
CREATE INDEX IF NOT EXISTS identity_sales_kind_time_bounded_idx ON identity_sales(asset_kind,sold_at,sale_id);
CREATE INDEX IF NOT EXISTS identity_sales_kind_price_bounded_idx ON identity_sales(asset_kind,price_usd,sale_id);
INSERT OR IGNORE INTO bounded_maintenance_state(job_key) VALUES ('count:identity_assets');
CREATE TRIGGER IF NOT EXISTS bounded_identity_assets_insert AFTER INSERT ON identity_assets BEGIN
 UPDATE bounded_maintenance_state SET total=total+1 WHERE job_key='count:identity_assets' AND (status='complete' OR NEW.rowid<=cursor);
END;
CREATE TRIGGER IF NOT EXISTS bounded_identity_assets_delete AFTER DELETE ON identity_assets BEGIN
 UPDATE bounded_maintenance_state SET total=total-1 WHERE job_key='count:identity_assets' AND (status='complete' OR OLD.rowid<=cursor);
END;
INSERT OR IGNORE INTO bounded_maintenance_state(job_key) VALUES ('count:identity_sales');
CREATE TRIGGER IF NOT EXISTS bounded_identity_sales_insert AFTER INSERT ON identity_sales BEGIN
 UPDATE bounded_maintenance_state SET total=total+1 WHERE job_key='count:identity_sales' AND (status='complete' OR NEW.rowid<=cursor);
END;
CREATE TRIGGER IF NOT EXISTS bounded_identity_sales_delete AFTER DELETE ON identity_sales BEGIN
 UPDATE bounded_maintenance_state SET total=total-1 WHERE job_key='count:identity_sales' AND (status='complete' OR OLD.rowid<=cursor);
END;
INSERT OR IGNORE INTO bounded_maintenance_state(job_key) VALUES ('count:valuation_records');
CREATE TRIGGER IF NOT EXISTS bounded_valuation_records_insert AFTER INSERT ON valuation_records BEGIN
 UPDATE bounded_maintenance_state SET total=total+1 WHERE job_key='count:valuation_records' AND (status='complete' OR NEW.rowid<=cursor);
END;
CREATE TRIGGER IF NOT EXISTS bounded_valuation_records_delete AFTER DELETE ON valuation_records BEGIN
 UPDATE bounded_maintenance_state SET total=total-1 WHERE job_key='count:valuation_records' AND (status='complete' OR OLD.rowid<=cursor);
END;
CREATE TABLE IF NOT EXISTS identity_source_revision (asset_kind TEXT PRIMARY KEY, revision INTEGER NOT NULL DEFAULT 0);
INSERT OR IGNORE INTO identity_source_revision VALUES ('dns',0),('username',0);
CREATE TABLE IF NOT EXISTS identity_baseline_preparation (
 asset_kind TEXT PRIMARY KEY, state_json TEXT NOT NULL DEFAULT '{}',
 published_json TEXT, published_at INTEGER NOT NULL DEFAULT 0,
 lease_until INTEGER NOT NULL DEFAULT 0, lease_token TEXT NOT NULL DEFAULT '',
 source_highwater INTEGER NOT NULL DEFAULT 0
);
-- Freeze a rowid boundary, not another evidence corpus. Ordinary append-only
-- ingestion above that boundary cannot restart a baseline generation. Mutations
-- to its frozen members invalidate it before any partial result is published.
CREATE TRIGGER IF NOT EXISTS identity_source_insert AFTER INSERT ON identity_sales
 WHEN EXISTS(SELECT 1 FROM identity_baseline_preparation WHERE asset_kind=NEW.asset_kind AND NEW.rowid<=source_highwater) BEGIN
 UPDATE identity_source_revision SET revision=revision+1 WHERE asset_kind=NEW.asset_kind;
END;
CREATE TRIGGER IF NOT EXISTS identity_source_update AFTER UPDATE ON identity_sales
 WHEN (OLD.asset_kind IS NOT NEW.asset_kind OR OLD.sale_id IS NOT NEW.sale_id OR OLD.normalized_name IS NOT NEW.normalized_name
   OR OLD.sold_at IS NOT NEW.sold_at OR OLD.price_usd IS NOT NEW.price_usd OR OLD.reliability_score IS NOT NEW.reliability_score
   OR OLD.primary_route IS NOT NEW.primary_route OR OLD.length_bucket IS NOT NEW.length_bucket OR OLD.script IS NOT NEW.script OR OLD.scarcity_class IS NOT NEW.scarcity_class)
 BEGIN
 UPDATE identity_source_revision SET revision=revision+1 WHERE asset_kind IN (OLD.asset_kind,NEW.asset_kind)
   AND EXISTS(SELECT 1 FROM identity_baseline_preparation WHERE identity_baseline_preparation.asset_kind=identity_source_revision.asset_kind
     AND (OLD.rowid<=source_highwater OR NEW.rowid<=source_highwater));
END;
CREATE TRIGGER IF NOT EXISTS identity_source_delete AFTER DELETE ON identity_sales BEGIN
 UPDATE identity_source_revision SET revision=revision+1 WHERE asset_kind=OLD.asset_kind
   AND EXISTS(SELECT 1 FROM identity_baseline_preparation WHERE asset_kind=OLD.asset_kind AND OLD.rowid<=source_highwater);
END;
CREATE TABLE IF NOT EXISTS identity_semantic_revision (asset_kind TEXT PRIMARY KEY,revision INTEGER NOT NULL DEFAULT 0);
INSERT OR IGNORE INTO identity_semantic_revision VALUES ('dns',0),('username',0);
CREATE TRIGGER IF NOT EXISTS identity_semantic_insert AFTER INSERT ON identity_assets BEGIN
 UPDATE identity_semantic_revision SET revision=revision+1 WHERE asset_kind=NEW.asset_kind;
END;
CREATE TRIGGER IF NOT EXISTS identity_semantic_update AFTER UPDATE ON identity_assets
 WHEN OLD.semantic_json IS NOT NEW.semantic_json OR OLD.normalized_name IS NOT NEW.normalized_name OR OLD.asset_kind IS NOT NEW.asset_kind BEGIN
 UPDATE identity_semantic_revision SET revision=revision+1 WHERE asset_kind IN (OLD.asset_kind,NEW.asset_kind);
END;
CREATE TRIGGER IF NOT EXISTS identity_semantic_delete AFTER DELETE ON identity_assets BEGIN
 UPDATE identity_semantic_revision SET revision=revision+1 WHERE asset_kind=OLD.asset_kind;
END;
-- Readiness marker last: partial schema installation must not enable maintenance.
INSERT OR REPLACE INTO bounded_maintenance_state(job_key,status) VALUES ('schema:identity:v1','complete');

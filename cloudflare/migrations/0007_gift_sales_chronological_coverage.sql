-- The live database already received this column through the initial schema
-- rollout. Keep a harmless marker so the migration ledger can advance without
-- attempting a duplicate ALTER TABLE.
CREATE TABLE IF NOT EXISTS gift_sales_migration_markers (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT ''
) WITHOUT ROWID;

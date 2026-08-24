-- Compact aliases connect a wallet's real collectible item address to the
-- catalog identity without copying source responses or sales history.
CREATE TABLE IF NOT EXISTS identity_asset_aliases (
  asset_kind TEXT NOT NULL CHECK (asset_kind IN ('dns', 'username')),
  alias_key TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  asset_key TEXT,
  source TEXT NOT NULL,
  first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (asset_kind, alias_key)
);
CREATE INDEX IF NOT EXISTS identity_asset_aliases_name_idx
  ON identity_asset_aliases(asset_kind, normalized_name);
CREATE INDEX IF NOT EXISTS identity_asset_aliases_asset_idx
  ON identity_asset_aliases(asset_kind, asset_key);

from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SHARED_SCHEMA = ROOT / "sql" / "ton-dns-estimator.sql"
STORE = ROOT / "dns-worker" / "dns_worker" / "store.py"
SIDECAR_SCHEMA = ROOT / "dns-worker" / "sql" / "001_source_coordination.sql"


def columns(sql: str, table: str) -> set[str]:
    match = re.search(
        rf"CREATE TABLE IF NOT EXISTS {table}\s*\((.*?)\n\);",
        sql,
        flags=re.IGNORECASE | re.DOTALL,
    )
    assert match, f"missing shared table {table}"
    result = set()
    for line in match.group(1).splitlines():
        token = line.strip().split(None, 1)[0].rstrip(",") if line.strip() else ""
        if token and token.upper() not in {"CHECK", "PRIMARY", "UNIQUE", "FOREIGN"}:
            result.add(token)
    return result


def insert_columns(store: str, table: str) -> list[set[str]]:
    matches = re.findall(
        rf"INSERT INTO {table}\s*\((.*?)\)\s*VALUES",
        store,
        flags=re.IGNORECASE | re.DOTALL,
    )
    return [{part.strip() for part in match.replace("\n", " ").split(",")} for match in matches]


def test_shared_ledger_inserts_only_reference_root_schema_columns():
    shared = SHARED_SCHEMA.read_text(encoding="utf-8")
    store = STORE.read_text(encoding="utf-8")
    for table in (
        "dns_domains", "dns_market_events", "dns_current_market", "dns_jobs",
        "dns_job_checkpoints", "dns_source_watermarks",
    ):
        allowed = columns(shared, table)
        writes = insert_columns(store, table)
        assert writes, f"worker does not exercise shared table {table}"
        assert all(write <= allowed for write in writes), (table, writes, allowed)


def test_removed_incompatible_contract_names_cannot_return():
    store = STORE.read_text(encoding="utf-8")
    forbidden = {
        "dns_worker_checkpoints", "watermark_partition", "watermark_object_key",
        "event_time_max, updated_at)\n                VALUES", "listing_price_gram",
        "listing_active", "source_event_id,\n                    validity_flags_json",
        "owner_address,\n                price_nano_gram", "raw_json",
    }
    assert not [name for name in forbidden if name in store]


def test_sidecar_migration_does_not_redefine_shared_ledger():
    sidecar = SIDECAR_SCHEMA.read_text(encoding="utf-8")
    assert "CREATE TABLE IF NOT EXISTS dns_source_objects" in sidecar
    assert "CREATE TABLE IF NOT EXISTS dns_catalog_members" in sidecar
    assert not re.search(
        r"CREATE TABLE IF NOT EXISTS dns_(domains|market_events|current_market|jobs|job_checkpoints|source_watermarks)",
        sidecar,
    )


def test_live_schema_check_declares_every_shared_column_it_requires():
    shared = SHARED_SCHEMA.read_text(encoding="utf-8")
    store = STORE.read_text(encoding="utf-8")
    block = re.search(
        r"def verify_shared_schema\(self\).*?\n    def heartbeat",
        store,
        flags=re.DOTALL,
    )
    assert block
    for table in (
        "dns_domains", "dns_market_events", "dns_current_market", "dns_jobs",
        "dns_job_checkpoints", "dns_source_watermarks",
    ):
        assert table in block.group(0)
        assert columns(shared, table)


def test_sidecar_contract_has_canonical_address_checks_and_feature_marker():
    sidecar = SIDECAR_SCHEMA.read_text(encoding="utf-8")
    assert "feature_enqueued_at TIMESTAMPTZ" in sidecar
    assert "metadata_skipped_at TIMESTAMPTZ" in sidecar
    assert "metadata_skip_reason TEXT" in sidecar
    assert "[0-9a-f]{64}" in sidecar

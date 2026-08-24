"""PostgreSQL coordination plus writes to the shared TON DNS ledger contract."""

from __future__ import annotations

import json
from contextlib import contextmanager
from dataclasses import replace
from datetime import datetime
from pathlib import Path
from typing import Any, Iterator, Sequence

from .addressing import AddressError, canonical_raw_address, optional_raw_address
from .constants import SOURCE_NAME
from .models import (
    CatalogItem,
    ClaimedJob,
    IngestStats,
    MetadataRecord,
    NormalizedEvent,
    ObjectPayload,
    SourceObject,
)


class StoreError(RuntimeError):
    """Raised when durable state cannot be safely updated."""


class UnresolvedDomainError(StoreError):
    """Prevents a market object checkpoint from advancing without domain identity."""

    def __init__(self, addresses: Sequence[str]) -> None:
        self.addresses = tuple(sorted(set(addresses)))
        super().__init__(f"domain metadata unresolved for {len(self.addresses)} NFT(s)")


class PostgresStore:
    def __init__(self, database_url: str, connect: Any | None = None) -> None:
        self.database_url = database_url
        self._connect_override = connect

    def _connect(self) -> Any:
        if self._connect_override:
            return self._connect_override(self.database_url)
        try:
            import psycopg
        except ImportError as exc:  # pragma: no cover
            raise StoreError("psycopg is required for PostgreSQL ingestion") from exc
        return psycopg.connect(self.database_url)

    @contextmanager
    def transaction(self) -> Iterator[Any]:
        connection = self._connect()
        try:
            with connection.transaction():
                yield connection
        except Exception:
            connection.rollback()
            raise
        finally:
            connection.close()

    def apply_sidecar_migrations(self, directory: Path) -> list[str]:
        applied: list[str] = []
        with self.transaction() as connection:
            for path in sorted(directory.glob("*.sql")):
                connection.execute(path.read_text(encoding="utf-8"))
                applied.append(path.name)
        return applied

    def verify_shared_schema(self) -> None:
        """Fail before ingestion when the root SQL contract is not installed."""

        required = {
            "dns_domains": {
                "nft_address", "collection_address", "domain_raw",
                "domain_normalized", "label_normalized", "owner_address",
                "nft_index", "registered_at", "metadata_json", "source",
                "first_seen_at", "last_seen_at",
            },
            "dns_market_events": {
                "event_id", "source", "source_event_id", "source_partition",
                "nft_address", "domain_normalized", "event_type", "event_time",
                "tx_hash", "trace_id", "logical_time", "marketplace_address",
                "marketplace_name", "sale_contract", "sale_contract_code_hash",
                "seller_address", "buyer_or_bidder_address", "price_nano_gram",
                "price_gram", "historical_usd_rate", "historical_usd_value",
                "rate_observed_at", "payment_asset", "is_finalized",
                "is_cancelled", "quality_flags_json", "raw_hash",
                "raw_payload_json",
            },
            "dns_current_market": {
                "nft_address", "listing_gram", "highest_bid_gram",
                "listing_status", "marketplace_address", "marketplace_name",
                "sale_contract", "sale_contract_code_hash", "source",
                "is_verified", "validity_flags_json", "raw_payload_json",
                "observed_at", "stale_at",
            },
            "dns_jobs": {
                "job_type", "dedupe_key", "status", "priority", "payload_json",
                "max_attempts", "run_after",
            },
            "dns_job_checkpoints": {
                "worker_name", "checkpoint_key", "cursor_json", "metadata_json",
                "checkpoint_version", "updated_at",
            },
            "dns_source_watermarks": {
                "source", "stream", "partition_key", "cursor_json", "event_time",
                "metadata_json", "updated_at",
            },
        }
        with self.transaction() as connection:
            rows = connection.execute(
                """
                SELECT table_name, column_name
                FROM information_schema.columns
                WHERE table_schema = current_schema()
                  AND table_name = ANY(%s)
                """,
                (list(required),),
            ).fetchall()
        actual: dict[str, set[str]] = {table: set() for table in required}
        for table, column in rows:
            actual.setdefault(str(table), set()).add(str(column))
        missing = {
            table: sorted(columns - actual.get(table, set()))
            for table, columns in required.items()
            if columns - actual.get(table, set())
        }
        if missing:
            raise StoreError(
                "shared sql/ton-dns-estimator.sql contract is missing columns: "
                + _json(missing)
            )

    def heartbeat(self, worker_id: str, details: dict[str, Any] | None = None) -> None:
        payload = {"worker_id": worker_id, **(details or {})}
        with self.transaction() as connection:
            connection.execute(
                """
                INSERT INTO dns_job_checkpoints (
                    worker_name, checkpoint_key, cursor_json, metadata_json,
                    checkpoint_version, updated_at
                ) VALUES ('dns-market-worker', 'heartbeat', '{}'::jsonb, %s::jsonb,
                          'dns-worker-v1', now())
                ON CONFLICT (worker_name, checkpoint_key) DO UPDATE SET
                    metadata_json = EXCLUDED.metadata_json,
                    checkpoint_version = EXCLUDED.checkpoint_version,
                    updated_at = now()
                """,
                (_json(payload),),
            )

    def enqueue_objects(self, stream: str, objects: Sequence[SourceObject]) -> int:
        if not objects:
            return 0
        rows = [
            (SOURCE_NAME, stream, item.key, item.partition, item.etag,
             item.size_bytes, item.last_modified)
            for item in objects
        ]
        with self.transaction() as connection:
            with connection.cursor() as cursor:
                cursor.executemany(
                    """
                    INSERT INTO dns_source_objects (
                        source, stream, object_key, partition_key, etag, size_bytes,
                        source_last_modified, status, next_attempt_at,
                        discovered_at, updated_at
                    ) VALUES (%s, %s, %s, %s, %s, %s, %s, 'pending', now(), now(), now())
                    ON CONFLICT (source, stream, object_key) DO UPDATE SET
                        partition_key = EXCLUDED.partition_key,
                        size_bytes = EXCLUDED.size_bytes,
                        source_last_modified = EXCLUDED.source_last_modified,
                        status = CASE WHEN dns_source_objects.etag IS DISTINCT FROM EXCLUDED.etag
                                      THEN 'pending' ELSE dns_source_objects.status END,
                        attempts = CASE WHEN dns_source_objects.etag IS DISTINCT FROM EXCLUDED.etag
                                        THEN 0 ELSE dns_source_objects.attempts END,
                        poison_at = CASE WHEN dns_source_objects.etag IS DISTINCT FROM EXCLUDED.etag
                                         THEN NULL ELSE dns_source_objects.poison_at END,
                        next_attempt_at = CASE
                            WHEN dns_source_objects.etag IS DISTINCT FROM EXCLUDED.etag THEN now()
                            ELSE dns_source_objects.next_attempt_at END,
                        etag = EXCLUDED.etag,
                        updated_at = now()
                    """,
                    rows,
                )
                return max(0, cursor.rowcount)

    def discovery_state(self, stream: str) -> tuple[str | None, bool]:
        with self.transaction() as connection:
            row = connection.execute(
                """
                SELECT cursor_json->>'object_key',
                       coalesce((cursor_json->>'scan_complete')::boolean, false)
                FROM dns_job_checkpoints
                WHERE worker_name = 'dns-market-worker'
                  AND checkpoint_key = %s
                """,
                (f"s3-discovery:{stream}",),
            ).fetchone()
        return (str(row[0]) if row and row[0] else None, bool(row[1]) if row else False)

    def save_discovery_cursor(
        self, stream: str, object_key: str | None, scan_complete: bool = False
    ) -> None:
        with self.transaction() as connection:
            connection.execute(
                """
                INSERT INTO dns_job_checkpoints (
                    worker_name, checkpoint_key, cursor_json, metadata_json,
                    checkpoint_version, updated_at
                ) VALUES ('dns-market-worker', %s, %s::jsonb, '{}'::jsonb,
                          'dns-worker-v1', now())
                ON CONFLICT (worker_name, checkpoint_key) DO UPDATE SET
                    cursor_json = EXCLUDED.cursor_json,
                    checkpoint_version = EXCLUDED.checkpoint_version,
                    updated_at = now()
                """,
                (
                    f"s3-discovery:{stream}",
                    _json({"object_key": object_key, "scan_complete": scan_complete}),
                ),
            )

    def claim_jobs(self, worker_id: str, limit: int, lease_seconds: int) -> list[ClaimedJob]:
        with self.transaction() as connection:
            rows = connection.execute(
                """
                WITH candidates AS (
                    SELECT target.source, target.stream, target.object_key
                    FROM dns_source_objects AS target
                    WHERE target.source = %s
                      AND target.status IN ('pending', 'retry')
                      AND target.next_attempt_at <= now()
                      AND NOT EXISTS (
                          SELECT 1 FROM dns_source_objects AS blocker
                          WHERE blocker.source = target.source
                            AND blocker.status <> 'complete'
                            AND blocker.partition_key <= target.partition_key
                            AND CASE target.stream
                              WHEN 'nft_metadata' THEN blocker.stream = 'nft_items'
                              WHEN 'nft_events' THEN blocker.stream IN ('nft_items', 'nft_metadata')
                              WHEN 'nft_sales' THEN blocker.stream IN ('nft_items', 'nft_metadata')
                              ELSE false END
                      )
                      AND CASE target.stream
                        WHEN 'nft_metadata' THEN EXISTS (
                          SELECT 1 FROM dns_job_checkpoints AS checkpoint
                          WHERE checkpoint.worker_name = 'dns-market-worker'
                            AND checkpoint.checkpoint_key = 's3-discovery:nft_items'
                            AND coalesce(
                              (checkpoint.cursor_json->>'scan_complete')::boolean, false
                            )
                        )
                        WHEN 'nft_events' THEN NOT EXISTS (
                          SELECT required.stream
                          FROM (VALUES ('nft_items'), ('nft_metadata')) AS required(stream)
                          WHERE NOT EXISTS (
                            SELECT 1 FROM dns_job_checkpoints AS checkpoint
                            WHERE checkpoint.worker_name = 'dns-market-worker'
                              AND checkpoint.checkpoint_key =
                                  's3-discovery:' || required.stream
                              AND coalesce(
                                (checkpoint.cursor_json->>'scan_complete')::boolean, false
                              )
                          )
                        )
                        WHEN 'nft_sales' THEN NOT EXISTS (
                          SELECT required.stream
                          FROM (VALUES ('nft_items'), ('nft_metadata')) AS required(stream)
                          WHERE NOT EXISTS (
                            SELECT 1 FROM dns_job_checkpoints AS checkpoint
                            WHERE checkpoint.worker_name = 'dns-market-worker'
                              AND checkpoint.checkpoint_key =
                                  's3-discovery:' || required.stream
                              AND coalesce(
                                (checkpoint.cursor_json->>'scan_complete')::boolean, false
                              )
                          )
                        )
                        ELSE true
                      END
                    ORDER BY target.partition_key,
                             CASE target.stream
                               WHEN 'nft_items' THEN 1 WHEN 'nft_metadata' THEN 2
                               WHEN 'nft_events' THEN 3 ELSE 4 END,
                             target.object_key
                    FOR UPDATE SKIP LOCKED
                    LIMIT %s
                )
                UPDATE dns_source_objects AS target SET
                    status = 'processing', lease_owner = %s,
                    lease_expires_at = now() + make_interval(secs => %s),
                    attempts = target.attempts + 1, updated_at = now()
                FROM candidates
                WHERE target.source = candidates.source
                  AND target.stream = candidates.stream
                  AND target.object_key = candidates.object_key
                RETURNING target.stream, target.object_key, target.partition_key,
                          target.attempts, target.etag, target.size_bytes,
                          target.source_last_modified
                """,
                (SOURCE_NAME, limit, worker_id, lease_seconds),
            ).fetchall()
        return [
            ClaimedJob(
                stream=str(row[0]), object_key=str(row[1]), partition_key=str(row[2]),
                attempts=int(row[3]), etag=str(row[4]) if row[4] else None,
                size_bytes=int(row[5]) if row[5] is not None else None,
                last_modified=row[6],
            )
            for row in rows
        ]

    def recover_expired_leases(self) -> int:
        with self.transaction() as connection:
            result = connection.execute(
                """
                UPDATE dns_source_objects SET status = 'retry', lease_owner = NULL,
                    lease_expires_at = NULL, next_attempt_at = now(),
                    last_error = coalesce(last_error, 'worker lease expired'), updated_at = now()
                WHERE source = %s AND status = 'processing' AND lease_expires_at < now()
                """,
                (SOURCE_NAME,),
            )
            return result.rowcount

    def export_membership_snapshot(self, destination: Path) -> int:
        count = 0
        with self.transaction() as connection, destination.open("w", encoding="ascii") as output:
            cursor = connection.cursor(name="dns_membership_export")
            cursor.execute("SELECT nft_address FROM dns_catalog_members ORDER BY nft_address")
            while rows := cursor.fetchmany(10_000):
                for row in rows:
                    output.write(f"{row[0]}\n")
                    count += 1
            cursor.close()
        return count

    def complete_job(self, job: ClaimedJob, payload: ObjectPayload) -> IngestStats:
        payload = _canonical_payload(payload)
        with self.transaction() as connection:
            changed_domains: dict[str, str] = {}
            if payload.catalog_items:
                self._upsert_catalog_members(connection, payload.catalog_items)
                changed_domains.update(self._upsert_item_domains(connection, payload.catalog_items))
            if payload.metadata_records:
                self._upsert_catalog_metadata(connection, payload.metadata_records)
                changed_domains.update(
                    self._upsert_metadata_domains(connection, payload.metadata_records)
                )
                self._assert_metadata_resolved(connection, payload.metadata_records)

            events = self._resolve_event_domains(connection, payload.events)
            inserted_events = self._insert_events(connection, events)
            self._refresh_current_market(connection, inserted_events)
            feature_domains = self._feature_jobs_due(
                connection,
                {
                    item.nft_address for item in payload.catalog_items
                    if item.domain_normalized
                } | {
                    item.nft_address for item in payload.metadata_records
                    if item.domain_normalized
                },
            )
            feature_domains.update(changed_domains)
            self._enqueue_feature_jobs(connection, feature_domains)
            self._enqueue_domain_valuation_jobs(connection, feature_domains)
            self._enqueue_valuation_jobs(connection, inserted_events)
            if changed_domains:
                connection.execute(
                    """
                    UPDATE dns_source_objects SET status = 'retry', next_attempt_at = now(),
                        last_error = NULL, updated_at = now()
                    WHERE source = %s AND status = 'blocked_metadata'
                    """,
                    (SOURCE_NAME,),
                )

            event_time = max(
                [event.event_time for event in events]
                + [item.observed_at for item in payload.catalog_items]
                + [item.observed_at for item in payload.metadata_records],
                default=None,
            )
            connection.execute(
                """
                    UPDATE dns_source_objects SET status = 'complete', lease_owner = NULL,
                    lease_expires_at = NULL, completed_at = now(), source_rows = %s,
                    normalized_rows = %s, inserted_rows = %s, rejected_rows = %s,
                    unresolved_rows = %s, event_time_max = %s, last_error = NULL,
                    updated_at = now()
                WHERE source = %s AND stream = %s AND object_key = %s
                """,
                (
                    payload.stats.source_rows, payload.stats.normalized_rows,
                    len(inserted_events), payload.stats.rejected_rows,
                    payload.stats.unresolved_rows, event_time,
                    SOURCE_NAME, job.stream, job.object_key,
                ),
            )
            self._advance_safe_watermark(connection, job.stream, job.partition_key)

        return replace(
            payload.stats,
            inserted_rows=len(inserted_events),
            updated_domains=len(changed_domains),
        )

    def block_job(self, job: ClaimedJob, error: UnresolvedDomainError) -> str:
        with self.transaction() as connection:
            connection.execute(
                """
                UPDATE dns_source_objects SET status = 'blocked_metadata',
                    lease_owner = NULL, lease_expires_at = NULL,
                    unresolved_rows = %s, last_error = left(%s, 4000), updated_at = now()
                WHERE source = %s AND stream = %s AND object_key = %s
                """,
                (len(error.addresses), str(error), SOURCE_NAME, job.stream, job.object_key),
            )
        return "blocked_metadata"

    def fail_job(
        self, job: ClaimedJob, error: str, max_attempts: int, delay_seconds: float
    ) -> str:
        status = "poison" if job.attempts >= max_attempts else "retry"
        with self.transaction() as connection:
            connection.execute(
                """
                UPDATE dns_source_objects SET status = %s, lease_owner = NULL,
                    lease_expires_at = NULL,
                    next_attempt_at = CASE WHEN %s = 'retry'
                        THEN now() + make_interval(secs => %s) ELSE next_attempt_at END,
                    last_error = left(%s, 4000),
                    poison_at = CASE WHEN %s = 'poison' THEN now() ELSE poison_at END,
                    updated_at = now()
                WHERE source = %s AND stream = %s AND object_key = %s
                """,
                (
                    status, status, int(max(1, delay_seconds)), error, status,
                    SOURCE_NAME, job.stream, job.object_key,
                ),
            )
        return status

    def status(self) -> dict[str, Any]:
        with self.transaction() as connection:
            rows = connection.execute(
                """
                SELECT stream, status, count(*) FROM dns_source_objects
                WHERE source = %s GROUP BY stream, status ORDER BY stream, status
                """,
                (SOURCE_NAME,),
            ).fetchall()
            watermarks = connection.execute(
                """
                SELECT stream, partition_key, cursor_json, event_time, metadata_json,
                       updated_at FROM dns_source_watermarks
                WHERE source = %s ORDER BY stream, partition_key
                """,
                (SOURCE_NAME,),
            ).fetchall()
            catalog = connection.execute(
                """
                SELECT count(*) AS total,
                       count(*) FILTER (WHERE domain_normalized IS NOT NULL) AS resolved,
                       count(*) FILTER (WHERE metadata_skipped_at IS NOT NULL) AS skipped,
                       count(*) FILTER (
                         WHERE domain_normalized IS NULL AND metadata_skipped_at IS NULL
                       ) AS unresolved
                FROM dns_catalog_members
                """
            ).fetchone()
        jobs: dict[str, dict[str, int]] = {}
        for stream, status, count in rows:
            jobs.setdefault(str(stream), {})[str(status)] = int(count)
        return {
            "source": SOURCE_NAME,
            "catalog": {
                "total": int(catalog[0]), "resolved": int(catalog[1]),
                "skipped": int(catalog[2]), "unresolved": int(catalog[3]),
            },
            "objects": jobs,
            "watermarks": [
                {
                    "stream": row[0], "partition": row[1], "cursor": row[2],
                    "event_time": _iso(row[3]), "metadata": row[4],
                    "updated_at": _iso(row[5]),
                }
                for row in watermarks
            ],
        }

    def skip_domain(self, nft_address: str, reason: str) -> dict[str, Any]:
        address = _required_raw(nft_address)
        cleaned_reason = str(reason or "").strip()
        if not cleaned_reason:
            raise StoreError("an explicit non-empty skip reason is required")
        with self.transaction() as connection:
            result = connection.execute(
                """
                UPDATE dns_catalog_members
                SET metadata_skipped_at = now(), metadata_skip_reason = left(%s, 1000),
                    updated_at = now()
                WHERE nft_address = %s AND domain_normalized IS NULL
                """,
                (cleaned_reason, address),
            )
            if result.rowcount != 1:
                raise StoreError(
                    "catalog member was not found or already has resolved metadata"
                )
            requeued = connection.execute(
                """
                UPDATE dns_source_objects
                SET status = 'retry', next_attempt_at = now(), last_error = NULL,
                    updated_at = now()
                WHERE source = %s AND status = 'blocked_metadata'
                """,
                (SOURCE_NAME,),
            ).rowcount
        return {"nft_address": address, "skipped": True, "requeued": requeued}

    @staticmethod
    def _upsert_catalog_members(connection: Any, items: Sequence[CatalogItem]) -> None:
        query = """
            INSERT INTO dns_catalog_members (
                nft_address, collection_address, nft_index, owner_address,
                domain_raw, domain_normalized, metadata_json, first_seen_at,
                last_seen_at, source_object_key, updated_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s, now())
            ON CONFLICT (nft_address) DO UPDATE SET
                owner_address = coalesce(EXCLUDED.owner_address, dns_catalog_members.owner_address),
                nft_index = coalesce(EXCLUDED.nft_index, dns_catalog_members.nft_index),
                domain_raw = coalesce(EXCLUDED.domain_raw, dns_catalog_members.domain_raw),
                domain_normalized = coalesce(EXCLUDED.domain_normalized,
                                             dns_catalog_members.domain_normalized),
                metadata_json = dns_catalog_members.metadata_json || EXCLUDED.metadata_json,
                first_seen_at = least(dns_catalog_members.first_seen_at, EXCLUDED.first_seen_at),
                last_seen_at = greatest(dns_catalog_members.last_seen_at, EXCLUDED.last_seen_at),
                source_object_key = EXCLUDED.source_object_key, updated_at = now()
        """
        with connection.cursor() as cursor:
            for item in items:
                cursor.execute(
                    query,
                    (
                        item.nft_address, item.collection_address, item.nft_index,
                        item.owner_address, item.domain_raw, item.domain_normalized,
                        _json(item.metadata_json), item.observed_at, item.observed_at,
                        item.source_object_key,
                    ),
                )

    @staticmethod
    def _upsert_catalog_metadata(connection: Any, rows: Sequence[MetadataRecord]) -> None:
        with connection.cursor() as cursor:
            for row in rows:
                cursor.execute(
                    """
                    UPDATE dns_catalog_members SET
                        domain_raw = coalesce(%s, domain_raw),
                        domain_normalized = coalesce(%s, domain_normalized),
                        metadata_json = metadata_json || %s::jsonb,
                        metadata_resolved_at = CASE WHEN %s IS NOT NULL THEN %s
                                                    ELSE metadata_resolved_at END,
                        last_seen_at = greatest(last_seen_at, %s),
                        source_object_key = %s, updated_at = now()
                    WHERE nft_address = %s
                    """,
                    (
                        row.domain_raw, row.domain_normalized, _json(row.metadata_json),
                        row.domain_normalized, row.observed_at, row.observed_at,
                        row.source_object_key, row.nft_address,
                    ),
                )

    @classmethod
    def _upsert_item_domains(
        cls, connection: Any, items: Sequence[CatalogItem]
    ) -> dict[str, str]:
        changed: dict[str, str] = {}
        for item in items:
            if not item.domain_normalized or not item.domain_raw:
                continue
            if cls._upsert_domain(
                connection, item.nft_address, item.collection_address, item.nft_index,
                item.owner_address, item.domain_raw, item.domain_normalized,
                item.metadata_json, item.observed_at,
            ):
                changed[item.nft_address] = item.domain_normalized
        return changed

    @classmethod
    def _upsert_metadata_domains(
        cls, connection: Any, rows: Sequence[MetadataRecord]
    ) -> dict[str, str]:
        changed: dict[str, str] = {}
        for row in rows:
            if not row.domain_normalized or not row.domain_raw:
                continue
            member = connection.execute(
                """
                SELECT collection_address, nft_index, owner_address, metadata_json,
                       first_seen_at FROM dns_catalog_members WHERE nft_address = %s
                """,
                (row.nft_address,),
            ).fetchone()
            if not member:
                continue
            metadata = {**(member[3] or {}), **row.metadata_json}
            if cls._upsert_domain(
                connection, row.nft_address, str(member[0]), member[1], member[2],
                row.domain_raw, row.domain_normalized, metadata,
                max(member[4], row.observed_at),
            ):
                changed[row.nft_address] = row.domain_normalized
        return changed

    @staticmethod
    def _upsert_domain(
        connection: Any, nft_address: str, collection_address: str,
        nft_index: int | None, owner_address: str | None, domain_raw: str,
        domain_normalized: str, metadata: dict[str, Any], observed_at: datetime,
    ) -> bool:
        nft_address = _required_raw(nft_address)
        collection_address = _required_raw(collection_address)
        owner_address = _optional_raw(owner_address)
        previous = connection.execute(
            "SELECT domain_normalized FROM dns_domains WHERE nft_address = %s",
            (nft_address,),
        ).fetchone()
        changed = previous is None or previous[0] != domain_normalized
        connection.execute(
            """
            INSERT INTO dns_domains (
                nft_address, collection_address, domain_raw, domain_normalized,
                label_normalized, owner_address, nft_index, registered_at,
                metadata_json, source, first_seen_at, last_seen_at, updated_at
            ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s, %s, now())
            ON CONFLICT (nft_address) DO UPDATE SET
                collection_address = EXCLUDED.collection_address,
                domain_raw = EXCLUDED.domain_raw,
                domain_normalized = EXCLUDED.domain_normalized,
                label_normalized = EXCLUDED.label_normalized,
                owner_address = coalesce(EXCLUDED.owner_address, dns_domains.owner_address),
                nft_index = coalesce(EXCLUDED.nft_index, dns_domains.nft_index),
                registered_at = coalesce(dns_domains.registered_at, EXCLUDED.registered_at),
                metadata_json = dns_domains.metadata_json || EXCLUDED.metadata_json,
                source = EXCLUDED.source,
                first_seen_at = least(dns_domains.first_seen_at, EXCLUDED.first_seen_at),
                last_seen_at = greatest(dns_domains.last_seen_at, EXCLUDED.last_seen_at),
                updated_at = now()
            """,
            (
                nft_address, collection_address, domain_raw, domain_normalized,
                domain_normalized[:-4], owner_address, nft_index, observed_at,
                _json(metadata), SOURCE_NAME, observed_at, observed_at,
            ),
        )
        return changed

    @staticmethod
    def _feature_jobs_due(
        connection: Any, nft_addresses: set[str]
    ) -> dict[str, str]:
        if not nft_addresses:
            return {}
        rows = connection.execute(
            """
            SELECT nft_address, domain_normalized
            FROM dns_catalog_members
            WHERE nft_address = ANY(%s)
              AND domain_normalized IS NOT NULL
              AND feature_enqueued_at IS NULL
            """,
            (sorted(nft_addresses),),
        ).fetchall()
        return {str(row[0]): str(row[1]) for row in rows}

    @staticmethod
    def _assert_metadata_resolved(
        connection: Any, rows: Sequence[MetadataRecord]
    ) -> None:
        addresses = sorted({row.nft_address for row in rows})
        if not addresses:
            return
        resolved = {
            str(row[0])
            for row in connection.execute(
                """
                SELECT nft_address
                FROM dns_catalog_members
                WHERE nft_address = ANY(%s)
                  AND (domain_normalized IS NOT NULL OR metadata_skipped_at IS NOT NULL)
                """,
                (addresses,),
            ).fetchall()
        }
        missing = [address for address in addresses if address not in resolved]
        if missing:
            raise UnresolvedDomainError(missing)

    @classmethod
    def _resolve_event_domains(
        cls, connection: Any, events: Sequence[NormalizedEvent]
    ) -> tuple[NormalizedEvent, ...]:
        resolved: list[NormalizedEvent] = []
        missing: list[str] = []
        for event in events:
            domain = event.domain_normalized
            raw = event.domain_raw
            if not domain:
                row = connection.execute(
                    "SELECT domain_raw, domain_normalized FROM dns_domains WHERE nft_address = %s",
                    (event.nft_address,),
                ).fetchone()
                if row:
                    raw, domain = row[0], row[1]
            if not domain or not raw:
                missing.append(event.nft_address)
                continue
            cls._upsert_domain(
                connection, event.nft_address, event.collection_address, event.nft_index,
                event.owner_address, raw, domain, event.metadata_json, event.event_time,
            )
            resolved.append(replace(event, domain_raw=raw, domain_normalized=domain))
        if missing:
            raise UnresolvedDomainError(missing)
        return tuple(resolved)

    @staticmethod
    def _insert_events(
        connection: Any, events: Sequence[NormalizedEvent]
    ) -> tuple[NormalizedEvent, ...]:
        query = """
            INSERT INTO dns_market_events (
                event_id, source, source_event_id, source_partition, nft_address,
                domain_normalized, event_type, event_time, tx_hash, trace_id,
                logical_time, marketplace_address, marketplace_name, sale_contract,
                sale_contract_code_hash, seller_address, buyer_or_bidder_address,
                price_nano_gram, price_gram, historical_usd_rate, historical_usd_value,
                rate_observed_at, payment_asset, is_finalized, is_cancelled,
                quality_flags_json, raw_hash, raw_payload_json
            ) VALUES (
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s, %s::jsonb
            ) ON CONFLICT DO NOTHING RETURNING event_id
        """
        inserted: list[NormalizedEvent] = []
        with connection.cursor() as cursor:
            for event in events:
                cursor.execute(query, _event_params(event))
                if cursor.fetchone():
                    inserted.append(event)
        return tuple(inserted)

    @staticmethod
    def _refresh_current_market(
        connection: Any, events: Sequence[NormalizedEvent]
    ) -> None:
        for event in events:
            if event.event_type not in {"put_on_sale", "cancel_sale", "sale", "bid"}:
                continue
            listing = event.price_gram if event.event_type == "put_on_sale" else None
            bid = event.price_gram if event.event_type == "bid" else None
            status = {
                "put_on_sale": "active", "cancel_sale": "cancelled",
                "sale": "sold", "bid": "bid_only",
            }[event.event_type]
            verified = (
                event.payment_asset == "GRAM"
                and event.market_kind in {"registration_auction", "secondary_getgems"}
            )
            flags = {
                "flags": list(event.quality_flags),
                "market_kind": event.market_kind,
                "source_event_id": event.source_event_id,
            }
            connection.execute(
                """
                INSERT INTO dns_current_market (
                    nft_address, listing_gram, highest_bid_gram, listing_status,
                    marketplace_address, marketplace_name, sale_contract,
                    sale_contract_code_hash, source, is_verified,
                    validity_flags_json, raw_payload_json, observed_at, stale_at,
                    updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s,
                          %s::jsonb, %s::jsonb, %s, %s + interval '6 hours', now())
                ON CONFLICT (nft_address) DO UPDATE SET
                    listing_gram = CASE
                        WHEN EXCLUDED.listing_status = 'active' THEN EXCLUDED.listing_gram
                        WHEN EXCLUDED.listing_status IN ('sold', 'cancelled') THEN NULL
                        ELSE dns_current_market.listing_gram END,
                    highest_bid_gram = coalesce(EXCLUDED.highest_bid_gram,
                        CASE WHEN EXCLUDED.listing_status IN ('sold', 'cancelled')
                             THEN NULL ELSE dns_current_market.highest_bid_gram END),
                    listing_status = CASE
                        WHEN EXCLUDED.listing_status = 'bid_only'
                         AND dns_current_market.listing_status IN ('active', 'sold', 'cancelled')
                        THEN dns_current_market.listing_status
                        ELSE EXCLUDED.listing_status END,
                    marketplace_address = EXCLUDED.marketplace_address,
                    marketplace_name = EXCLUDED.marketplace_name,
                    sale_contract = EXCLUDED.sale_contract,
                    sale_contract_code_hash = EXCLUDED.sale_contract_code_hash,
                    source = EXCLUDED.source, is_verified = EXCLUDED.is_verified,
                    validity_flags_json = EXCLUDED.validity_flags_json,
                    raw_payload_json = EXCLUDED.raw_payload_json,
                    observed_at = EXCLUDED.observed_at, stale_at = EXCLUDED.stale_at,
                    updated_at = now()
                WHERE EXCLUDED.observed_at >= dns_current_market.observed_at
                """,
                (
                    event.nft_address, listing, bid, status, event.marketplace_address,
                    event.marketplace_name, event.sale_contract,
                    event.sale_contract_code_hash, event.source, verified,
                    _json(flags), _json(event.raw_payload_json), event.event_time,
                    event.event_time,
                ),
            )

    @staticmethod
    def _enqueue_feature_jobs(connection: Any, domains: dict[str, str]) -> None:
        for nft_address, domain in domains.items():
            _enqueue_job(
                connection, "dns-feature", f"{nft_address}:dns-structural-v1", 70,
                {"nftAddress": nft_address, "domain": domain},
            )
            connection.execute(
                """
                UPDATE dns_catalog_members
                SET feature_enqueued_at = coalesce(feature_enqueued_at, now()),
                    updated_at = now()
                WHERE nft_address = %s
                """,
                (nft_address,),
            )

    @staticmethod
    def _enqueue_valuation_jobs(
        connection: Any, events: Sequence[NormalizedEvent]
    ) -> None:
        evidence = {
            event.nft_address: event.domain_normalized
            for event in events
            if event.event_type in {"put_on_sale", "cancel_sale", "sale", "bid"}
        }
        for nft_address, domain in evidence.items():
            _enqueue_job(
                connection, "dns-valuation", f"{nft_address}:dns-market-v3", 80,
                {"nftAddress": nft_address, "domain": domain, "reason": "market_evidence"},
            )

    @staticmethod
    def _enqueue_domain_valuation_jobs(
        connection: Any, domains: dict[str, str]
    ) -> None:
        for nft_address, domain in domains.items():
            _enqueue_job(
                connection, "dns-valuation", f"{nft_address}:dns-market-v3", 60,
                {"nftAddress": nft_address, "domain": domain,
                 "reason": "domain_discovered"},
            )

    @staticmethod
    def _advance_safe_watermark(connection: Any, stream: str, partition: str) -> None:
        candidate = connection.execute(
            """
            SELECT completed.object_key, completed.event_time_max
            FROM dns_source_objects AS completed
            WHERE completed.source = %s AND completed.stream = %s
              AND completed.partition_key = %s AND completed.status = 'complete'
              AND NOT EXISTS (
                SELECT 1 FROM dns_source_objects AS unsafe
                WHERE unsafe.source = completed.source
                  AND unsafe.stream = completed.stream
                  AND unsafe.partition_key = completed.partition_key
                  AND unsafe.object_key <= completed.object_key
                  AND unsafe.status <> 'complete'
              )
            ORDER BY completed.object_key DESC LIMIT 1
            """,
            (SOURCE_NAME, stream, partition),
        ).fetchone()
        if not candidate:
            return
        connection.execute(
            """
            INSERT INTO dns_source_watermarks (
                source, stream, partition_key, cursor_json, event_time,
                metadata_json, updated_at
            ) VALUES (%s, %s, %s, %s::jsonb, %s, %s::jsonb, now())
            ON CONFLICT (source, stream, partition_key) DO UPDATE SET
                cursor_json = EXCLUDED.cursor_json,
                event_time = CASE WHEN dns_source_watermarks.event_time IS NULL
                                  THEN EXCLUDED.event_time
                                  ELSE greatest(dns_source_watermarks.event_time,
                                                EXCLUDED.event_time) END,
                metadata_json = EXCLUDED.metadata_json, updated_at = now()
            """,
            (
                SOURCE_NAME, stream, partition,
                _json({"object_key": candidate[0]}), candidate[1],
                _json({"checkpoint": "contiguous-object-prefix"}),
            ),
        )


def _enqueue_job(
    connection: Any, job_type: str, dedupe_key: str, priority: int,
    payload: dict[str, Any],
) -> None:
    connection.execute(
        """
        INSERT INTO dns_jobs (
            job_type, dedupe_key, priority, payload_json, max_attempts, run_after
        ) VALUES (%s, %s, %s, %s::jsonb, 5, now())
        ON CONFLICT (job_type, dedupe_key)
          WHERE status IN ('queued', 'running', 'retry')
        DO UPDATE SET
            priority = greatest(dns_jobs.priority, EXCLUDED.priority),
            payload_json = CASE WHEN dns_jobs.status = 'running'
                THEN dns_jobs.payload_json ELSE dns_jobs.payload_json || EXCLUDED.payload_json END,
            run_after = CASE WHEN dns_jobs.status = 'running' THEN dns_jobs.run_after
                             ELSE least(dns_jobs.run_after, EXCLUDED.run_after) END,
            updated_at = now()
        """,
        (job_type, dedupe_key, priority, _json(payload)),
    )


def _event_params(event: NormalizedEvent) -> tuple[Any, ...]:
    quality = {
        "flags": list(event.quality_flags),
        "market_kind": event.market_kind,
        "source_object_key": event.source_object_key,
    }
    return (
        event.event_id, event.source, event.source_event_id, event.source_partition,
        event.nft_address, event.domain_normalized, event.event_type, event.event_time,
        event.tx_hash, event.trace_id, event.logical_time, event.marketplace_address,
        event.marketplace_name, event.sale_contract, event.sale_contract_code_hash,
        event.seller_address, event.buyer_or_bidder_address, event.price_nano_gram,
        event.price_gram, event.historical_usd_rate, event.historical_usd_value,
        None, event.payment_asset or "GRAM", event.is_finalized, event.is_cancelled,
        _json(quality), event.raw_hash, _json(event.raw_payload_json),
    )


def _canonical_payload(payload: ObjectPayload) -> ObjectPayload:
    items = tuple(
        replace(
            item,
            nft_address=_required_raw(item.nft_address),
            collection_address=_required_raw(item.collection_address),
            owner_address=_optional_raw(item.owner_address),
        )
        for item in payload.catalog_items
    )
    metadata = tuple(
        replace(item, nft_address=_required_raw(item.nft_address))
        for item in payload.metadata_records
    )
    events = tuple(
        replace(
            event,
            nft_address=_required_raw(event.nft_address),
            collection_address=_required_raw(event.collection_address),
            marketplace_address=_optional_raw(event.marketplace_address),
            sale_contract=_optional_raw(event.sale_contract),
            seller_address=_optional_raw(event.seller_address),
            buyer_or_bidder_address=_optional_raw(event.buyer_or_bidder_address),
            owner_address=_optional_raw(event.owner_address),
        )
        for event in payload.events
    )
    return replace(
        payload, catalog_items=items, metadata_records=metadata, events=events
    )


def _required_raw(value: Any) -> str:
    try:
        return canonical_raw_address(value)
    except AddressError as exc:
        raise StoreError(f"invalid TON address at database boundary: {exc}") from exc


def _optional_raw(value: Any) -> str | None:
    try:
        return optional_raw_address(value)
    except AddressError as exc:
        raise StoreError(f"invalid TON address at database boundary: {exc}") from exc


def _json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def _iso(value: Any) -> str | None:
    return value.isoformat() if isinstance(value, datetime) else (str(value) if value else None)

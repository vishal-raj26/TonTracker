"""Bounded discovery and ingestion orchestration."""

from __future__ import annotations

import hashlib
import logging
import os
import socket
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .config import Settings
from .logging_utils import log_context
from .constants import SOURCE_STREAM_ORDER
from .models import IngestStats, ObjectPayload, SourceObject
from .normalizer import NormalizationError, normalize_row
from .parquet_reader import DnsParquetReader
from .s3_source import S3Source
from .store import PostgresStore, UnresolvedDomainError

LOGGER = logging.getLogger(__name__)


class MarketIngestRunner:
    def __init__(
        self,
        settings: Settings,
        store: PostgresStore,
        source: S3Source | None = None,
        reader: DnsParquetReader | None = None,
    ) -> None:
        self.settings = settings
        self.store = store
        self.source = source
        self.reader = reader or DnsParquetReader()
        if reader is None:
            self.reader = DnsParquetReader(
                memory_limit=settings.duckdb_memory_limit,
                threads=settings.duckdb_threads,
            )
        self.worker_id = settings.worker_id or default_worker_id()

    def _source(self, stream: str) -> S3Source:
        if self.source is not None:
            return self.source
        return S3Source(
            self.settings.bucket_url,
            self.settings.source_prefixes[stream],
            timeout_seconds=self.settings.http_timeout_seconds,
            backoff_seconds=self.settings.backoff_seconds,
        )

    def discover(
        self, full_reconcile: bool = False, max_pages: int | None = None,
        streams: tuple[str, ...] = SOURCE_STREAM_ORDER,
    ) -> int:
        discovered = 0
        pages = 0
        for stream in streams:
            prefix = self.settings.source_prefixes[stream]
            cursor, previous_scan_complete = self.store.discovery_state(stream)
            if full_reconcile:
                start_after = _start_of_date_partition(prefix, self.settings.start_date)
            elif cursor and previous_scan_complete:
                start_after = _start_of_object_partition(cursor)
            elif cursor:
                start_after = cursor
            else:
                start_after = _start_of_date_partition(prefix, self.settings.start_date)
            last_cursor = cursor
            stopped_early = False
            stream_pages = 0
            for objects, page_cursor in self._source(stream).iter_pages(
                start_date=self.settings.start_date,
                end_date=self.settings.end_date,
                start_after=start_after,
            ):
                discovered += self.store.enqueue_objects(stream, objects)
                self.store.save_discovery_cursor(stream, page_cursor, scan_complete=False)
                last_cursor = page_cursor
                pages += 1
                stream_pages += 1
                log_context(
                    LOGGER, logging.INFO, "source discovery page committed",
                    stream=stream, objects=len(objects), total_discovered=discovered,
                    page_cursor=page_cursor, full_reconcile=full_reconcile,
                )
                if max_pages is not None and stream_pages >= max_pages:
                    stopped_early = True
                    break
            if not stopped_early:
                self.store.save_discovery_cursor(stream, last_cursor, scan_complete=True)
        self.store.heartbeat(
            self.worker_id,
            {"phase": "discover", "objects": discovered, "pages": pages},
        )
        return discovered

    def process_batch(self) -> dict[str, int]:
        recovered = self.store.recover_expired_leases()
        jobs = self.store.claim_jobs(
            self.worker_id,
            self.settings.batch_size,
            self.settings.lease_seconds,
        )
        summary = {
            "claimed": len(jobs),
            "complete": 0,
            "retry": 0,
            "poison": 0,
            "blocked_metadata": 0,
            "events": 0,
            "inserted": 0,
            "recovered_leases": recovered,
        }
        for job in jobs:
            try:
                payload = self._process_job(job)
                committed = self.store.complete_job(job, payload)
                summary["complete"] += 1
                summary["events"] += committed.normalized_rows
                summary["inserted"] += committed.inserted_rows
                log_context(
                    LOGGER,
                    logging.INFO,
                    "source object committed",
                    object_key=job.object_key,
                    partition=job.partition_key,
                    source_rows=committed.source_rows,
                    normalized_rows=committed.normalized_rows,
                    inserted_rows=committed.inserted_rows,
                    rejected_rows=committed.rejected_rows,
                )
            except UnresolvedDomainError as exc:
                status = self.store.block_job(job, exc)
                summary[status] += 1
                log_context(
                    LOGGER, logging.WARNING, "source object blocked on domain metadata",
                    stream=job.stream, object_key=job.object_key,
                    unresolved=len(exc.addresses),
                )
            except Exception as exc:
                delay = self.settings.backoff_seconds * (2 ** max(0, job.attempts - 1))
                status = self.store.fail_job(
                    job,
                    error=f"{type(exc).__name__}: {exc}",
                    max_attempts=self.settings.max_attempts,
                    delay_seconds=delay,
                )
                summary[status] += 1
                log_context(
                    LOGGER,
                    logging.ERROR,
                    "source object failed",
                    object_key=job.object_key,
                    partition=job.partition_key,
                    attempts=job.attempts,
                    status=status,
                    error=f"{type(exc).__name__}: {exc}",
                )
        self.store.heartbeat(self.worker_id, {"phase": "ingest", **summary})
        return summary

    def run_continuous(self, poll_seconds: float, discover_every_seconds: float) -> None:
        last_discovery = 0.0
        while True:
            now = time.monotonic()
            if now - last_discovery >= discover_every_seconds:
                self.discover(full_reconcile=False)
                last_discovery = now
            result = self.process_batch()
            if result["claimed"] == 0:
                time.sleep(poll_seconds)

    def _process_job(self, job: Any) -> ObjectPayload:
        if job.size_bytes is not None and job.size_bytes > self.settings.max_object_bytes:
            raise RuntimeError(
                f"object exceeds DNS_MAX_OBJECT_BYTES={self.settings.max_object_bytes}"
            )
        item = SourceObject(
            key=job.object_key,
            etag=job.etag,
            size_bytes=job.size_bytes,
            last_modified=job.last_modified,
        )
        temp_root = Path(self.settings.temp_dir) if self.settings.temp_dir else None
        with tempfile.TemporaryDirectory(prefix="tontrack-dns-", dir=temp_root) as temporary:
            digest = hashlib.sha256(job.object_key.encode("utf-8")).hexdigest()
            local_path = Path(temporary) / f"{digest}.parquet"
            self._source(job.stream).download(item, local_path)
            events = []
            catalog_items = []
            metadata_records = []
            source_rows = 0
            rejected = 0
            unresolved = 0
            rows: Any = ()
            if job.stream == "nft_items":
                for record in self.reader.iter_items(local_path, job.object_key):
                    source_rows += 1
                    self._check_row_limit(source_rows)
                    if not record.domain_normalized:
                        unresolved += 1
                    catalog_items.append(record)
            elif job.stream in {"nft_metadata", "nft_sales"}:
                membership_path = Path(temporary) / "dns-membership.csv"
                member_count = self.store.export_membership_snapshot(membership_path)
                if member_count == 0:
                    raise RuntimeError("verified TON DNS membership has not been bootstrapped")
                if job.stream == "nft_metadata":
                    for record in self.reader.iter_metadata(
                        local_path, job.object_key, membership_path
                    ):
                        source_rows += 1
                        self._check_row_limit(source_rows)
                        if not record.domain_normalized:
                            unresolved += 1
                        metadata_records.append(record)
                else:
                    rows = self.reader.iter_sales(local_path, job.object_key, membership_path)
            else:
                rows = self.reader.iter_events(local_path)
            for row in rows if job.stream in {"nft_events", "nft_sales"} else ():
                source_rows += 1
                self._check_row_limit(source_rows)
                try:
                    events.append(normalize_row(row, job.object_key))
                except NormalizationError as exc:
                    rejected += 1
                    if "domain" in str(exc).lower():
                        unresolved += 1
                    log_context(
                        LOGGER,
                        logging.WARNING,
                        "source row rejected",
                        object_key=job.object_key,
                        row_number=source_rows,
                        error=str(exc),
                    )
            stats = IngestStats(
                source_rows=source_rows,
                normalized_rows=len(events),
                rejected_rows=rejected,
                unresolved_rows=unresolved,
            )
            return ObjectPayload(
                catalog_items=tuple(catalog_items),
                metadata_records=tuple(metadata_records),
                events=tuple(events),
                stats=stats,
            )

    def _check_row_limit(self, count: int) -> None:
        if count > self.settings.max_events_per_object:
            raise RuntimeError(
                "object exceeds bounded matched-row limit "
                f"DNS_MAX_EVENTS_PER_OBJECT={self.settings.max_events_per_object}"
            )


def default_worker_id() -> str:
    return f"{socket.gethostname()}:{os.getpid()}"


def _start_of_date_partition(prefix: str, value: Any) -> str | None:
    return f"{prefix}date={value.isoformat()}/" if value else None


def _start_of_object_partition(object_key: str) -> str:
    marker = "/date="
    if marker not in object_key:
        return object_key
    root, suffix = object_key.split(marker, 1)
    partition = suffix.split("/", 1)[0]
    return f"{root}{marker}{partition}/"


def source_proof(
    settings: Settings,
    source: S3Source,
    reader: DnsParquetReader,
    object_key: str,
    sample_limit: int = 20,
    stream: str = "nft_events",
    membership_path: Path | None = None,
) -> dict[str, Any]:
    temp_root = Path(settings.temp_dir) if settings.temp_dir else None
    counts: dict[str, int] = {}
    samples: list[dict[str, Any]] = []
    rejected = 0
    with tempfile.TemporaryDirectory(prefix="tontrack-dns-proof-", dir=temp_root) as temporary:
        local_path = Path(temporary) / "source.parquet"
        source.download(SourceObject(key=object_key), local_path)
        if stream == "nft_items":
            records = reader.iter_items(local_path, object_key)
            for record in records:
                counts["dns_item"] = counts.get("dns_item", 0) + 1
                if len(samples) < sample_limit:
                    samples.append(
                        {
                            "nft_address": record.nft_address,
                            "domain": record.domain_normalized,
                            "owner_address": record.owner_address,
                            "observed_at": record.observed_at.isoformat(),
                        }
                    )
            return _proof_result(object_key, stream, counts, rejected, samples)
        if stream == "nft_metadata":
            if membership_path is None:
                raise ValueError("--membership-file is required for nft_metadata proof")
            records = reader.iter_metadata(local_path, object_key, membership_path)
            for record in records:
                counts["dns_metadata"] = counts.get("dns_metadata", 0) + 1
                if len(samples) < sample_limit:
                    samples.append(
                        {
                            "nft_address": record.nft_address,
                            "domain": record.domain_normalized,
                            "observed_at": record.observed_at.isoformat(),
                        }
                    )
            return _proof_result(object_key, stream, counts, rejected, samples)
        if stream == "nft_sales":
            if membership_path is None:
                raise ValueError("--membership-file is required for nft_sales proof")
            rows = reader.iter_sales(local_path, object_key, membership_path)
        else:
            rows = reader.iter_events(local_path)
        for row in rows:
            try:
                event = normalize_row(row, object_key)
            except NormalizationError:
                rejected += 1
                continue
            counts[event.event_type] = counts.get(event.event_type, 0) + 1
            if len(samples) < sample_limit:
                samples.append(
                    {
                        "event_id": event.event_id,
                        "event_type": event.event_type,
                        "market_kind": event.market_kind,
                        "domain": event.domain_normalized,
                        "nft_address": event.nft_address,
                        "event_time": event.event_time.isoformat(),
                        "price_gram": str(event.price_gram)
                        if event.price_gram is not None
                        else None,
                        "marketplace": event.marketplace_name
                        or event.marketplace_address,
                        "quality_flags": list(event.quality_flags),
                    }
                )
    return _proof_result(object_key, stream, counts, rejected, samples)


def _proof_result(
    object_key: str,
    stream: str,
    counts: dict[str, int],
    rejected: int,
    samples: list[dict[str, Any]],
) -> dict[str, Any]:
    return {
        "source_object": object_key,
        "stream": stream,
        "checked_at": datetime.now(timezone.utc).isoformat(),
        "event_counts": counts,
        "rejected_rows": rejected,
        "samples": samples,
    }

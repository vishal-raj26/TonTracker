"""Environment-backed worker configuration."""

from __future__ import annotations

import os
from dataclasses import dataclass
from datetime import date

from .constants import (
    DEFAULT_BACKOFF_SECONDS,
    DEFAULT_BATCH_SIZE,
    DEFAULT_HTTP_TIMEOUT_SECONDS,
    DEFAULT_LEASE_SECONDS,
    DEFAULT_MAX_ATTEMPTS,
    SOURCE_BUCKET_URL,
    SOURCE_STREAM_PREFIXES,
)


def _positive_int(name: str, default: int) -> int:
    raw = os.getenv(name, "").strip()
    value = int(raw) if raw else default
    if value <= 0:
        raise ValueError(f"{name} must be positive")
    return value


def _positive_float(name: str, default: float) -> float:
    raw = os.getenv(name, "").strip()
    value = float(raw) if raw else default
    if value <= 0:
        raise ValueError(f"{name} must be positive")
    return value


@dataclass(frozen=True)
class Settings:
    database_url: str | None
    bucket_url: str
    source_prefixes: dict[str, str]
    start_date: date | None
    end_date: date | None
    batch_size: int
    max_attempts: int
    lease_seconds: int
    backoff_seconds: float
    http_timeout_seconds: float
    temp_dir: str | None
    max_events_per_object: int
    max_object_bytes: int
    duckdb_memory_limit: str
    duckdb_threads: int
    log_level: str
    worker_id: str | None

    @classmethod
    def from_env(cls, require_database: bool = True) -> "Settings":
        database_url = (
            os.getenv("DNS_DATABASE_URL", "").strip()
            or os.getenv("DATABASE_URL", "").strip()
            or None
        )
        if require_database and not database_url:
            raise ValueError("DNS_DATABASE_URL (or DATABASE_URL) is required")

        start_date = _optional_date("DNS_SOURCE_START_DATE")
        end_date = _optional_date("DNS_SOURCE_END_DATE")
        if start_date and end_date and end_date < start_date:
            raise ValueError("DNS_SOURCE_END_DATE cannot be before DNS_SOURCE_START_DATE")

        return cls(
            database_url=database_url,
            bucket_url=os.getenv("DNS_SOURCE_BUCKET_URL", SOURCE_BUCKET_URL).rstrip("/"),
            source_prefixes={
                stream: os.getenv(
                    f"DNS_SOURCE_{stream.upper()}_PREFIX", default
                ).strip()
                for stream, default in SOURCE_STREAM_PREFIXES.items()
            },
            start_date=start_date,
            end_date=end_date,
            batch_size=_positive_int("DNS_INGEST_BATCH_SIZE", DEFAULT_BATCH_SIZE),
            max_attempts=_positive_int("DNS_MAX_ATTEMPTS", DEFAULT_MAX_ATTEMPTS),
            lease_seconds=_positive_int("DNS_JOB_LEASE_SECONDS", DEFAULT_LEASE_SECONDS),
            backoff_seconds=_positive_float("DNS_RETRY_BASE_SECONDS", DEFAULT_BACKOFF_SECONDS),
            http_timeout_seconds=_positive_float(
                "DNS_HTTP_TIMEOUT_SECONDS", DEFAULT_HTTP_TIMEOUT_SECONDS
            ),
            temp_dir=os.getenv("DNS_TEMP_DIR", "").strip() or None,
            max_events_per_object=_positive_int("DNS_MAX_EVENTS_PER_OBJECT", 100_000),
            max_object_bytes=_positive_int("DNS_MAX_OBJECT_BYTES", 1_073_741_824),
            duckdb_memory_limit=os.getenv("DNS_DUCKDB_MEMORY_LIMIT", "512MB").strip()
            or "512MB",
            duckdb_threads=_positive_int("DNS_DUCKDB_THREADS", 2),
            log_level=os.getenv("DNS_LOG_LEVEL", "INFO").upper(),
            worker_id=os.getenv("DNS_WORKER_ID", "").strip() or None,
        )


def _optional_date(name: str) -> date | None:
    raw = os.getenv(name, "").strip()
    return date.fromisoformat(raw) if raw else None

"""Environment-backed configuration with conservative production defaults."""

from __future__ import annotations

import os
import socket
from dataclasses import dataclass

from .schema import SCHEMA_VERSION


def _text(name: str, default: str = "") -> str:
    return os.getenv(name, default).strip()


def _positive_int(name: str, default: int) -> int:
    raw = _text(name)
    value = int(raw) if raw else default
    if value <= 0:
        raise ValueError(f"{name} must be positive")
    return value


def _positive_float(name: str, default: float) -> float:
    raw = _text(name)
    value = float(raw) if raw else default
    if value <= 0:
        raise ValueError(f"{name} must be positive")
    return value


def _ratio(name: str, default: float) -> float:
    value = float(_text(name, str(default)))
    if not 0 <= value <= 1:
        raise ValueError(f"{name} must be between 0 and 1")
    return value


@dataclass(frozen=True)
class Settings:
    database_url: str
    worker_id: str
    job_type: str
    batch_size: int
    poll_seconds: float
    lease_seconds: int
    retry_base_seconds: float
    retry_max_seconds: float
    profile_version: str
    schema_version: str
    dictionary_version: str
    embedding_provider: str
    embedding_endpoint: str | None
    embedding_api_key: str | None
    embedding_model: str
    embedding_model_version: str
    embedding_batch_size: int
    embedding_requests_per_second: float
    embedding_timeout_seconds: float
    local_embedding_device: str
    vector_upsert_endpoint: str | None
    vector_database_url: str | None
    vector_api_key: str | None
    vector_namespace: str
    vector_store_name: str
    vector_dimensions: int
    vector_timeout_seconds: float
    qwen_endpoint: str | None
    qwen_api_key: str | None
    qwen_model: str
    qwen_model_version: str
    qwen_requests_per_second: float
    qwen_timeout_seconds: float
    qwen_confidence_threshold: float
    qwen_high_impact_gram: float
    qwen_response_format: str
    log_level: str
    run_once: bool

    @classmethod
    def from_env(cls) -> "Settings":
        database_url = _text("DNS_DATABASE_URL") or _text("DATABASE_URL")
        if not database_url:
            raise ValueError("DNS_DATABASE_URL (or DATABASE_URL) is required")

        embedding_provider = _text("DNS_EMBEDDING_PROVIDER", "disabled").lower()
        if embedding_provider not in {"disabled", "http", "local"}:
            raise ValueError("DNS_EMBEDDING_PROVIDER must be disabled, http, or local")
        embedding_endpoint = _text("DNS_EMBEDDING_ENDPOINT") or None
        if embedding_provider == "http" and not embedding_endpoint:
            raise ValueError("DNS_EMBEDDING_ENDPOINT is required for the http provider")

        qwen_response_format = _text("DNS_QWEN_RESPONSE_FORMAT", "json_schema")
        if qwen_response_format not in {"json_schema", "json_object", "none"}:
            raise ValueError(
                "DNS_QWEN_RESPONSE_FORMAT must be json_schema, json_object, or none"
            )

        schema_version = _text("DNS_SEMANTIC_SCHEMA_VERSION", SCHEMA_VERSION)
        if schema_version != SCHEMA_VERSION:
            raise ValueError(
                f"DNS_SEMANTIC_SCHEMA_VERSION must be {SCHEMA_VERSION}"
            )

        return cls(
            database_url=database_url,
            worker_id=_text("DNS_SEMANTIC_WORKER_ID")
            or f"dns-semantic-{socket.gethostname()}",
            job_type=_text("DNS_SEMANTIC_JOB_TYPE", "dns-semantic"),
            batch_size=_positive_int("DNS_SEMANTIC_BATCH_SIZE", 24),
            poll_seconds=_positive_float("DNS_SEMANTIC_POLL_SECONDS", 5.0),
            lease_seconds=_positive_int("DNS_SEMANTIC_LEASE_SECONDS", 300),
            retry_base_seconds=_positive_float("DNS_SEMANTIC_RETRY_BASE_SECONDS", 15.0),
            retry_max_seconds=_positive_float("DNS_SEMANTIC_RETRY_MAX_SECONDS", 3600.0),
            profile_version=_text("DNS_SEMANTIC_PROFILE_VERSION", "semantic-v1"),
            schema_version=schema_version,
            dictionary_version=_text("DNS_DICTIONARY_VERSION", "dictionary-v1"),
            embedding_provider=embedding_provider,
            embedding_endpoint=embedding_endpoint,
            embedding_api_key=_text("DNS_EMBEDDING_API_KEY") or None,
            embedding_model=_text("DNS_EMBEDDING_MODEL", "BAAI/bge-m3"),
            embedding_model_version=_text("DNS_EMBEDDING_MODEL_VERSION", "bge-m3-v1"),
            embedding_batch_size=_positive_int("DNS_EMBEDDING_BATCH_SIZE", 32),
            embedding_requests_per_second=_positive_float(
                "DNS_EMBEDDING_REQUESTS_PER_SECOND", 1.0
            ),
            embedding_timeout_seconds=_positive_float(
                "DNS_EMBEDDING_TIMEOUT_SECONDS", 60.0
            ),
            local_embedding_device=_text("DNS_LOCAL_EMBEDDING_DEVICE", "cpu"),
            vector_upsert_endpoint=_text("DNS_VECTOR_UPSERT_ENDPOINT") or None,
            vector_database_url=_text("DNS_VECTOR_DATABASE_URL") or None,
            vector_api_key=_text("DNS_VECTOR_API_KEY") or None,
            vector_namespace=_text("DNS_VECTOR_NAMESPACE", "ton-dns"),
            vector_store_name=_text("DNS_VECTOR_STORE_NAME", "dns-pgvector"),
            vector_dimensions=_positive_int("DNS_VECTOR_DIMENSIONS", 1024),
            vector_timeout_seconds=_positive_float("DNS_VECTOR_TIMEOUT_SECONDS", 30.0),
            qwen_endpoint=_text("DNS_QWEN_ENDPOINT") or None,
            qwen_api_key=_text("DNS_QWEN_API_KEY") or None,
            qwen_model=_text("DNS_QWEN_MODEL", "Qwen/Qwen3-8B"),
            qwen_model_version=_text("DNS_QWEN_MODEL_VERSION", "qwen3-8b-v1"),
            qwen_requests_per_second=_positive_float(
                "DNS_QWEN_REQUESTS_PER_SECOND", 0.25
            ),
            qwen_timeout_seconds=_positive_float("DNS_QWEN_TIMEOUT_SECONDS", 90.0),
            qwen_confidence_threshold=_ratio("DNS_QWEN_CONFIDENCE_THRESHOLD", 0.68),
            qwen_high_impact_gram=_positive_float("DNS_QWEN_HIGH_IMPACT_GRAM", 500.0),
            qwen_response_format=qwen_response_format,
            log_level=_text("DNS_SEMANTIC_LOG_LEVEL", "INFO").upper(),
            run_once=_text("DNS_SEMANTIC_RUN_ONCE", "0").lower()
            in {"1", "true", "yes", "on"},
        )

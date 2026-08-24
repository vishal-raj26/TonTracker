"""Typed records exchanged between source, normalizer, and PostgreSQL."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import Any


@dataclass(frozen=True)
class SourceObject:
    key: str
    etag: str | None = None
    size_bytes: int | None = None
    last_modified: datetime | None = None

    @property
    def partition(self) -> str:
        marker = "/date="
        if marker not in self.key:
            return "unknown"
        return self.key.split(marker, 1)[1].split("/", 1)[0]


@dataclass(frozen=True)
class NormalizedEvent:
    event_id: str
    nft_address: str
    collection_address: str
    nft_index: int | None
    domain_raw: str | None
    domain_normalized: str | None
    event_type: str
    market_kind: str
    event_time: datetime
    tx_hash: str | None
    trace_id: str | None
    logical_time: int | None
    marketplace_address: str | None
    marketplace_name: str | None
    sale_contract: str | None
    sale_contract_code_hash: str | None
    seller_address: str | None
    buyer_or_bidder_address: str | None
    owner_address: str | None
    price_nano_gram: int | None
    price_gram: Decimal | None
    historical_usd_rate: Decimal | None
    historical_usd_value: Decimal | None
    payment_asset: str | None
    is_finalized: bool
    is_cancelled: bool
    source: str
    source_event_id: str
    source_partition: str
    source_object_key: str
    quality_flags: tuple[str, ...] = field(default_factory=tuple)
    raw_hash: str = ""
    metadata_json: dict[str, Any] = field(default_factory=dict)
    raw_payload_json: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class CatalogItem:
    nft_address: str
    collection_address: str
    nft_index: int | None
    owner_address: str | None
    domain_raw: str | None
    domain_normalized: str | None
    observed_at: datetime
    source_partition: str
    source_object_key: str
    metadata_json: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class MetadataRecord:
    nft_address: str
    domain_raw: str | None
    domain_normalized: str | None
    observed_at: datetime
    source_partition: str
    source_object_key: str
    metadata_json: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ClaimedJob:
    stream: str
    object_key: str
    partition_key: str
    attempts: int
    etag: str | None = None
    size_bytes: int | None = None
    last_modified: datetime | None = None


@dataclass(frozen=True)
class IngestStats:
    source_rows: int = 0
    normalized_rows: int = 0
    inserted_rows: int = 0
    updated_domains: int = 0
    rejected_rows: int = 0
    unresolved_rows: int = 0


@dataclass(frozen=True)
class ObjectPayload:
    catalog_items: tuple[CatalogItem, ...] = ()
    metadata_records: tuple[MetadataRecord, ...] = ()
    events: tuple[NormalizedEvent, ...] = ()
    stats: IngestStats = field(default_factory=IngestStats)

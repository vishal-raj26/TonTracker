"""Projection-bounded extraction from extensionless TON lake Parquet objects."""

from __future__ import annotations

import tempfile
from collections.abc import Iterator
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from .addressing import AddressError, canonical_raw_address, optional_raw_address
from .constants import TON_DNS_COLLECTION
from .models import CatalogItem, MetadataRecord
from .normalizer import normalize_domain, parse_content_onchain

EVENT_COLUMNS = (
    "type", "nft_item_address", "nft_item_index", "collection_address",
    "owner_address", "content_onchain", "timestamp", "lt", "tx_hash",
    "trace_id", "prev_owner", "sale_contract", "sale_type", "sale_end_time",
    "marketplace_address", "sale_price", "payment_asset", "auction_max_bid",
    "auction_min_bid", "auction_min_step",
)


class ParquetReadError(RuntimeError):
    """Raised when an object is not readable as the expected Parquet schema."""


class DnsParquetReader:
    def __init__(self, row_batch_size: int = 2048, memory_limit: str = "512MB", threads: int = 2) -> None:
        self.row_batch_size = row_batch_size
        self.memory_limit = memory_limit
        self.threads = threads

    def iter_events(self, path: Path) -> Iterator[dict[str, Any]]:
        columns = ", ".join(f'"{name}"' for name in EVENT_COLUMNS)
        query = f"""
            SELECT {columns}
            FROM read_parquet(?)
            WHERE lower(collection_address) = ?
              AND type IN ('mint', 'transfer', 'put_on_sale', 'cancel_sale', 'sale', 'bid')
            ORDER BY timestamp, coalesce(lt, 0), type, nft_item_address
        """
        yield from self._iter_query(path, query, [TON_DNS_COLLECTION])

    # Compatibility for callers/tests created before the multi-stream bootstrap.
    def iter_rows(self, path: Path) -> Iterator[dict[str, Any]]:
        yield from self.iter_events(path)

    def iter_items(self, path: Path, source_key: str) -> Iterator[CatalogItem]:
        query = """
            SELECT address, index, collection_address, owner_address,
                   content_onchain, timestamp, lt
            FROM read_parquet(?)
            WHERE lower(collection_address) = ? AND is_init = true
            ORDER BY timestamp, coalesce(try_cast(lt AS HUGEINT), 0), address
        """
        for row in self._iter_query(path, query, [TON_DNS_COLLECTION]):
            try:
                nft_address = canonical_raw_address(row["address"])
                collection = canonical_raw_address(row["collection_address"])
                owner = optional_raw_address(row.get("owner_address"))
            except AddressError as exc:
                raise ParquetReadError(f"invalid TON address in nft_items: {exc}") from exc
            metadata, _ = parse_content_onchain(row.get("content_onchain"))
            raw_domain = _domain_from_metadata(metadata)
            yield CatalogItem(
                nft_address=nft_address,
                collection_address=collection,
                nft_index=_integer(row.get("index")),
                owner_address=owner,
                domain_raw=raw_domain,
                domain_normalized=normalize_domain(raw_domain),
                observed_at=_timestamp(row.get("timestamp")),
                source_partition=_partition(source_key),
                source_object_key=source_key,
                metadata_json=metadata,
            )

    def iter_metadata(
        self,
        path: Path,
        source_key: str,
        membership_path: Path,
    ) -> Iterator[MetadataRecord]:
        """Use DuckDB's disk-backed semi-join; never materialize a metadata file in Python."""

        if not membership_path.is_file() or membership_path.stat().st_size == 0:
            raise ParquetReadError("TON DNS membership snapshot is empty")
        connection = self._connection()
        try:
            cursor = connection.execute(
                """
                SELECT m.address, m.content_onchain, m.name, m.description,
                       m.image, m.attributes,
                       greatest(coalesce(m.update_time_metadata, 0),
                                coalesce(m.update_time_onchain, 0)) AS observed_at
                FROM read_parquet(?) AS m
                SEMI JOIN read_csv(?, header=false, columns={'address': 'VARCHAR'}) AS d
                  ON lower(m.address) = d.address
                WHERE m.type = 'item'
                ORDER BY m.address
                """,
                [str(path), str(membership_path)],
            )
            description = [column[0] for column in cursor.description]
            while rows := cursor.fetchmany(self.row_batch_size):
                for values in rows:
                    row = dict(zip(description, values, strict=True))
                    metadata, _ = parse_content_onchain(row.get("content_onchain"))
                    external = {
                        key: row.get(key)
                        for key in ("name", "description", "image", "attributes")
                        if row.get(key) not in (None, "")
                    }
                    raw_domain = _domain_from_metadata(metadata) or _domain_from_name(row.get("name"))
                    yield MetadataRecord(
                        nft_address=canonical_raw_address(row["address"]),
                        domain_raw=raw_domain,
                        domain_normalized=normalize_domain(raw_domain),
                        observed_at=_timestamp(row.get("observed_at")),
                        source_partition=_partition(source_key),
                        source_object_key=source_key,
                        metadata_json={**metadata, **external},
                    )
        except Exception as exc:
            raise ParquetReadError(f"failed to read {path.name}: {exc}") from exc
        finally:
            connection.close()

    def iter_sales(self, path: Path, source_key: str, membership_path: Path) -> Iterator[dict[str, Any]]:
        if not membership_path.is_file() or membership_path.stat().st_size == 0:
            raise ParquetReadError("TON DNS membership snapshot is empty")
        connection = self._connection()
        try:
            cursor = connection.execute(
                """
                SELECT s.address, s.type, s.nft_address, s.nft_owner_address,
                       s.created_at, s.is_complete, s.is_canceled, s.end_time,
                       s.marketplace_address, s.price, s.asset, s.max_bid,
                       s.min_bid, s.min_step, s.last_bid_at, s.last_member,
                       s.timestamp, s.lt
                FROM read_parquet(?) AS s
                SEMI JOIN read_csv(?, header=false, columns={'address': 'VARCHAR'}) AS d
                  ON lower(s.nft_address) = d.address
                ORDER BY s.timestamp, coalesce(try_cast(s.lt AS HUGEINT), 0), s.address
                """,
                [str(path), str(membership_path)],
            )
            description = [column[0] for column in cursor.description]
            while rows := cursor.fetchmany(self.row_batch_size):
                for values in rows:
                    row = dict(zip(description, values, strict=True))
                    common = {
                        "nft_item_address": row.get("nft_address"),
                        "collection_address": TON_DNS_COLLECTION,
                        "owner_address": row.get("nft_owner_address"),
                        "content_onchain": "{}",
                        "lt": row.get("lt"),
                        "tx_hash": None,
                        "trace_id": None,
                        "sale_contract": row.get("address"),
                        "sale_type": row.get("type"),
                        "sale_end_time": row.get("end_time"),
                        "marketplace_address": row.get("marketplace_address"),
                        "payment_asset": row.get("asset"),
                        "auction_max_bid": row.get("max_bid"),
                        "auction_min_bid": row.get("min_bid"),
                        "auction_min_step": row.get("min_step"),
                        "source_stream": "nft_sales",
                    }
                    primary_type = "cancel_sale" if row.get("is_canceled") else (
                        "sale" if row.get("is_complete") else "put_on_sale"
                    )
                    primary_price = row.get("price")
                    if primary_type == "sale" and _positive(row.get("max_bid")):
                        primary_price = row.get("max_bid")
                    yield {
                        **common,
                        "type": primary_type,
                        "timestamp": row.get("created_at")
                        if primary_type == "put_on_sale"
                        else row.get("timestamp") or row.get("created_at"),
                        "owner_address": row.get("last_member")
                        if primary_type == "sale" else row.get("nft_owner_address"),
                        "prev_owner": row.get("nft_owner_address")
                        if primary_type == "sale" else None,
                        "sale_price": primary_price,
                        "is_complete": row.get("is_complete"),
                        "is_canceled": row.get("is_canceled"),
                    }
                    if _positive(row.get("max_bid")):
                        yield {
                            **common,
                            "type": "bid",
                            "timestamp": row.get("last_bid_at") or row.get("timestamp")
                            or row.get("created_at"),
                            "prev_owner": row.get("last_member"),
                            "sale_price": row.get("max_bid"),
                            "is_complete": False,
                            "is_canceled": False,
                        }
        except Exception as exc:
            raise ParquetReadError(f"failed to read {path.name}: {exc}") from exc
        finally:
            connection.close()

    def _iter_query(self, path: Path, query: str, params: list[Any]) -> Iterator[dict[str, Any]]:
        connection = self._connection()
        try:
            cursor = connection.execute(query, [str(path), *params])
            description = [column[0] for column in cursor.description]
            while rows := cursor.fetchmany(self.row_batch_size):
                for values in rows:
                    yield dict(zip(description, values, strict=True))
        except Exception as exc:
            raise ParquetReadError(f"failed to read {path.name}: {exc}") from exc
        finally:
            connection.close()

    def _connection(self) -> Any:
        try:
            import duckdb
        except ImportError as exc:  # pragma: no cover
            raise ParquetReadError("duckdb is required to read TON-ETL Parquet") from exc
        # A temporary on-disk database gives DuckDB spill space when scanning
        # large metadata objects; the Parquet body still stays projection- and
        # semi-join-filtered rather than being materialized in Python.
        spill_path = Path(tempfile.gettempdir()) / "tontrack-dns-duckdb-spill"
        spill_path.mkdir(parents=True, exist_ok=True)
        connection = duckdb.connect(database=":memory:")
        connection.execute("SET memory_limit = ?", [self.memory_limit])
        connection.execute("SET threads = ?", [self.threads])
        connection.execute("SET preserve_insertion_order = false")
        connection.execute("SET temp_directory = ?", [str(spill_path)])
        return connection


def _domain_from_metadata(metadata: dict[str, Any]) -> str | None:
    for key in ("domain", "name"):
        value = str(metadata.get(key) or "").strip()
        if value:
            return value
    return None


def _domain_from_name(value: Any) -> str | None:
    text = str(value or "").strip()
    return text if text.lower().rstrip(".").endswith(".ton") else None


def _timestamp(value: Any) -> datetime:
    return datetime.fromtimestamp(max(0, int(value or 0)), tz=timezone.utc)


def _integer(value: Any) -> int | None:
    try:
        return int(value) if value not in (None, "") else None
    except (TypeError, ValueError):
        return None


def _positive(value: Any) -> bool:
    try:
        return int(value) > 0
    except (TypeError, ValueError, OverflowError):
        return False


def _partition(key: str) -> str:
    marker = "/date="
    return key.split(marker, 1)[1].split("/", 1)[0] if marker in key else "unknown"

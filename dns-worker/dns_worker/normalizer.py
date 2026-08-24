"""Normalize TON-ETL NFT events into reproducible DNS ledger evidence."""

from __future__ import annotations

import hashlib
import json
import math
import unicodedata
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any, Mapping

from .addressing import AddressError, canonical_raw_address, optional_raw_address
from .constants import (
    DNS_REGISTRATION_EVENT_TYPES,
    GETGEMS_MARKETPLACE_ADDRESSES,
    NATIVE_PAYMENT_ASSETS,
    PRICE_EVENT_TYPES,
    SOURCE_NAME,
    SUPPORTED_EVENT_TYPES,
    TON_DNS_COLLECTION,
)
from .models import NormalizedEvent


class NormalizationError(ValueError):
    """Raised when a source row cannot safely become ledger evidence."""


def normalize_row(row: Mapping[str, Any], source_object_key: str) -> NormalizedEvent:
    event_type = _clean_text(row.get("type")).lower()
    if event_type not in SUPPORTED_EVENT_TYPES:
        raise NormalizationError(f"unsupported event type: {event_type or '<empty>'}")

    collection_address = _required_address(row.get("collection_address"), "collection_address")
    if collection_address != TON_DNS_COLLECTION:
        raise NormalizationError("row does not belong to the verified TON DNS collection")

    nft_address = _required_address(row.get("nft_item_address"), "nft_item_address")

    timestamp = _integer(row.get("timestamp"))
    if timestamp is None or timestamp < 0:
        raise NormalizationError("invalid timestamp")
    event_time = datetime.fromtimestamp(timestamp, tz=timezone.utc)

    metadata, metadata_flags = parse_content_onchain(row.get("content_onchain"))
    domain_raw = _clean_text(metadata.get("domain")) or None
    domain = normalize_domain(domain_raw)
    payment_asset_raw = _clean_text(row.get("payment_asset")) or None
    payment_asset = payment_asset_raw.upper() if payment_asset_raw else None
    price_nano, price_flags = normalize_native_price(
        row.get("sale_price"), payment_asset, event_type
    )

    marketplace_address = _address(row.get("marketplace_address"))
    sale_contract = _address(row.get("sale_contract"))
    market_kind, marketplace_name = classify_market(
        event_type=event_type,
        marketplace_address=marketplace_address,
        sale_contract=sale_contract,
    )

    flags = list(metadata_flags)
    flags.extend(price_flags)
    if domain is None:
        flags.append("missing_domain_metadata")
    if market_kind == "secondary_unknown":
        flags.append("unknown_secondary_marketplace")
    if event_type in {"sale", "bid"} and price_nano is None:
        flags.append("missing_native_price")
    if event_type == "cancel_sale" and price_nano is not None:
        flags.append("cancel_price_is_prior_ask")

    normalized_payload = canonical_payload(row)
    logical_time = _integer(row.get("lt"))
    tx_hash = _clean_text(row.get("tx_hash")) or None
    trace_id = _clean_text(row.get("trace_id")) or None
    identity: dict[str, Any] = {
        "source": SOURCE_NAME,
        "event_type": event_type,
        "nft_address": nft_address,
    }
    if tx_hash or trace_id or (logical_time is not None and logical_time > 0):
        identity.update(
            tx_hash=tx_hash,
            trace_id=trace_id,
            logical_time=logical_time,
        )
    else:
        # TON DNS registration-auction rows may have no transaction hash or LT.
        # Their normalized content hash keeps duplicate publication idempotent
        # without tying identity to the S3 object that happened to carry it.
        identity.update(
            timestamp=timestamp,
            sale_contract=sale_contract,
            price_nano_gram=price_nano,
            payload_hash=hashlib.sha256(normalized_payload).hexdigest(),
        )
    event_id = stable_event_id(**identity)
    # The shared root schema has a unique (source, raw_hash) index. Use the
    # canonical event identity here rather than the raw payload hash because
    # equivalent nft_events/nft_sales evidence can have different payload
    # shapes, while separate bid/ask states can share one sale-contract row.
    raw_hash = event_id

    seller, buyer = participants(event_type, row)
    return NormalizedEvent(
        event_id=event_id,
        nft_address=nft_address,
        collection_address=collection_address,
        nft_index=_integer(row.get("nft_item_index")),
        domain_raw=domain_raw,
        domain_normalized=domain,
        event_type=event_type,
        market_kind=market_kind,
        event_time=event_time,
        tx_hash=tx_hash,
        trace_id=trace_id,
        logical_time=logical_time,
        marketplace_address=marketplace_address,
        marketplace_name=marketplace_name,
        sale_contract=sale_contract,
        sale_contract_code_hash=_clean_text(row.get("sale_contract_code_hash")) or None,
        seller_address=seller,
        buyer_or_bidder_address=buyer,
        owner_address=_address(row.get("owner_address")),
        price_nano_gram=price_nano,
        price_gram=(Decimal(price_nano) / Decimal(1_000_000_000))
        if price_nano is not None
        else None,
        historical_usd_rate=None,
        historical_usd_value=None,
        payment_asset="GRAM" if price_nano is not None else payment_asset,
        is_finalized=(
            event_type == "sale"
            and market_kind in {"registration_auction", "secondary_getgems"}
            and (
                market_kind == "registration_auction"
                or row.get("is_complete") is True
            )
        ),
        is_cancelled=event_type == "cancel_sale" or bool(row.get("is_canceled", False)),
        source=SOURCE_NAME,
        source_event_id=event_id,
        source_partition=_partition_from_key(source_object_key),
        source_object_key=source_object_key,
        quality_flags=tuple(sorted(set(flags))),
        raw_hash=raw_hash,
        metadata_json=metadata,
        raw_payload_json=dict(row),
    )


def parse_content_onchain(value: Any) -> tuple[dict[str, Any], tuple[str, ...]]:
    if isinstance(value, Mapping):
        return dict(value), ()
    if value is None or value == "":
        return {}, ()
    if isinstance(value, (bytes, bytearray)):
        value = value.decode("utf-8", errors="replace")
    if isinstance(value, str):
        try:
            decoded = json.loads(value)
        except json.JSONDecodeError:
            return {}, ("invalid_content_onchain_json",)
        if isinstance(decoded, Mapping):
            return dict(decoded), ()
    return {}, ("invalid_content_onchain_shape",)


def normalize_domain(value: Any) -> str | None:
    text = _clean_text(value)
    if not text:
        return None
    text = unicodedata.normalize("NFKC", text).strip().lower().rstrip(".")
    if text.endswith(".ton"):
        text = text[:-4].rstrip(".")
    if not text or any(ord(char) < 32 for char in text):
        return None
    return f"{text}.ton"


def normalize_native_price(
    value: Any, payment_asset: str | None, event_type: str
) -> tuple[int | None, tuple[str, ...]]:
    if value is None or value == "":
        return None, ()
    try:
        decimal_value = Decimal(str(value))
    except Exception:
        return None, ("invalid_sale_price",)
    if not decimal_value.is_finite() or decimal_value < 0:
        return None, ("invalid_sale_price",)
    if decimal_value != decimal_value.to_integral_value():
        return None, ("non_integer_nano_price",)
    if payment_asset not in NATIVE_PAYMENT_ASSETS:
        return None, ("non_native_payment_asset",)
    if event_type not in PRICE_EVENT_TYPES:
        return None, ("price_on_non_market_event",)
    if decimal_value == 0:
        return None, ("non_positive_native_price",)
    return int(decimal_value), ()


def classify_market(
    event_type: str, marketplace_address: str | None, sale_contract: str | None
) -> tuple[str, str | None]:
    if (
        marketplace_address == TON_DNS_COLLECTION
        and event_type in DNS_REGISTRATION_EVENT_TYPES
        and not sale_contract
    ):
        return "registration_auction", "TON DNS Auction"
    if marketplace_address in GETGEMS_MARKETPLACE_ADDRESSES:
        return "secondary_getgems", "Getgems"
    if sale_contract or marketplace_address:
        return "secondary_unknown", None
    return "non_market", None


def participants(event_type: str, row: Mapping[str, Any]) -> tuple[str | None, str | None]:
    previous = _address(row.get("prev_owner"))
    owner = _address(row.get("owner_address"))
    if event_type == "bid":
        return None, previous
    if event_type == "sale":
        return previous, owner
    if event_type == "transfer":
        return previous, owner
    if event_type == "put_on_sale":
        return owner, None
    return None, None


def stable_event_id(**parts: Any) -> str:
    # A tx hash is not guaranteed for registration-auction rows, so every
    # identity component is explicit and deterministic across reprocessing.
    encoded = json.dumps(parts, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(encoded.encode("utf-8")).hexdigest()


def canonical_payload(row: Mapping[str, Any]) -> bytes:
    value = json.dumps(
        dict(row),
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        default=_json_default,
    )
    return value.encode("utf-8")


def _json_default(value: Any) -> Any:
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, bytes):
        return value.hex()
    if isinstance(value, float) and not math.isfinite(value):
        return None
    return str(value)


def _integer(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        result = int(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return result


def _address(value: Any) -> str | None:
    try:
        return optional_raw_address(value)
    except AddressError as exc:
        raise NormalizationError(str(exc)) from exc


def _required_address(value: Any, name: str) -> str:
    try:
        return canonical_raw_address(value)
    except AddressError as exc:
        raise NormalizationError(f"invalid {name}: {exc}") from exc


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, bytes):
        return value.decode("utf-8", errors="replace").strip()
    return str(value).strip()


def _partition_from_key(key: str) -> str:
    marker = "/date="
    return key.split(marker, 1)[1].split("/", 1)[0] if marker in key else "unknown"

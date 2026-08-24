"""One-page TON Lake to compact D1 identity ingestion."""

from __future__ import annotations

import tempfile
import unicodedata
import hashlib
import json
import os
import time
import urllib.parse
import urllib.error
import urllib.request
from dataclasses import replace
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from typing import Any

from .config import Settings
from .d1_client import D1IdentityClient
from .addressing import AddressError, canonical_raw_address
from .historical_usd import HistoricalUsdProvider
from .models import CatalogItem, NormalizedEvent
from .normalizer import NormalizationError, normalize_domain, normalize_row
from .parquet_reader import DnsParquetReader
from .s3_source import S3Source
from .constants import TON_DNS_COLLECTION


SUPPORTED_DIRECT_STREAMS = ("nft_items", "nft_metadata", "nft_events", "nft_sales")
# v2 deliberately starts a new bounded evidence window. The previous direct
# cursor began at the start of TON Lake's archive and would spend months
# crawling catalog objects that TonAPI membership already supplies.
DIRECT_PIPELINE_VERSION = "dns-ton-lake-direct-v2"
DIRECT_SCHEDULER_KEY = f"{DIRECT_PIPELINE_VERSION}:scheduler"
TONAPI_MEMBERSHIP_KEY = "dns-tonapi-membership-v1"
GETGEMS_HISTORY_KEY = "dns-getgems-history-v1"
TONCENTER_HISTORY_KEY = "dns-toncenter-history-v1"
TONCENTER_RATE_LIMIT_KEY = "dns-toncenter-rate-limit-v1"
TONAPI_DNS_COLLECTION = "EQC3dNlesgVD8YbAazcauIrXBPfiVhMMr5YYk2in0Mtsz0Bz"


def _length_bucket(length: int) -> str:
    if length <= 3:
        return "1-3"
    if length <= 5:
        return "4-5"
    if length <= 8:
        return "6-8"
    if length <= 12:
        return "9-12"
    return "13+"


def _compact_features(domain: str) -> dict[str, Any]:
    label = domain.removesuffix(".ton")
    characters = list(label)
    numeric = bool(label) and all(char.isdecimal() for char in characters)
    letters = bool(label) and all(char.isalpha() for char in characters)
    alphanumeric = (bool(label) and all(char.isalnum() for char in characters)
                    and not numeric and not letters)
    scripts = {
        "Latin" if "LATIN" in unicodedata.name(char, "") else "NonLatin"
        for char in characters if char.isalpha()
    }
    script = "Common" if not scripts else next(iter(scripts)) if len(scripts) == 1 else "Mixed"
    repeated = len(set(characters)) < len(characters)
    palindrome = len(characters) > 1 and characters == list(reversed(characters))
    if numeric:
        route = "numeric"
    elif letters and len(characters) <= 3 and script == "Latin":
        route = "short-letters"
    elif alphanumeric:
        route = "alphanumeric"
    elif script in {"NonLatin", "Mixed"}:
        route = "multilingual"
    elif repeated or palindrome:
        route = "pattern"
    else:
        route = "residual"
    character_class = ("numeric" if numeric else "letters" if letters
                       else "alphanumeric" if alphanumeric else "mixed")
    scarcity = f"{len(characters)}{'N' if numeric else 'L' if letters else 'A' if alphanumeric else 'U'}"
    feature = {
        "normalizedDomain": domain, "label": label,
        "characterLength": len(characters), "characterClass": character_class,
        "primaryScript": script, "scarcityClass": scarcity,
        "uniqueCharacterCount": len(set(characters)), "palindrome": palindrome,
        "hasRepeatedRun": repeated, "primaryRoute": route,
        "classifierVersion": "dns-direct-structural-v1",
    }
    return {
        "primaryRoute": route, "lengthBucket": _length_bucket(len(characters)),
        "script": script, "scarcityClass": scarcity, "feature": feature,
    }


def _asset_record(nft_address: str, domain: str, observed_at: datetime,
                  source_key: str) -> dict[str, Any]:
    return {
        "assetKind": "dns", "assetKey": nft_address,
        "normalizedName": domain, "displayName": domain,
        **_compact_features(domain), "semantic": {},
        "sourceUpdatedAt": observed_at.astimezone(timezone.utc).isoformat(),
        "source": "ton-lake", "sourceObject": source_key,
    }


class DirectD1Ingestor:
    def __init__(self, settings: Settings, client: D1IdentityClient,
                 rate_provider: HistoricalUsdProvider | None = None,
                 reader: DnsParquetReader | None = None,
                 source: S3Source | None = None) -> None:
        self.settings = settings
        self.client = client
        self.rate_provider = rate_provider or HistoricalUsdProvider(
            timeout_seconds=settings.http_timeout_seconds
        )
        self.reader = reader or DnsParquetReader(
            memory_limit=settings.duckdb_memory_limit,
            threads=settings.duckdb_threads,
        )
        self.source = source

    def run_once(self, stream: str = "nft_events",
                 page_size: int = 4) -> dict[str, Any]:
        if stream not in SUPPORTED_DIRECT_STREAMS:
            raise ValueError(f"direct D1 stream must be one of {SUPPORTED_DIRECT_STREAMS}")
        pipeline_key = f"{DIRECT_PIPELINE_VERSION}:{stream}"
        state = self.client.read_state(pipeline_key) or {}
        cursor = state.get("cursor") or {}
        start_after = cursor.get("objectKey") or None
        source = self.source or S3Source(
            self.settings.bucket_url, self.settings.source_prefixes[stream],
            timeout_seconds=self.settings.http_timeout_seconds,
            backoff_seconds=self.settings.backoff_seconds,
        )
        pages = source.iter_pages(
            start_date=self._stream_start_date(stream), end_date=self.settings.end_date,
            max_keys=max(1, min(25, page_size)), start_after=start_after,
        )
        objects = []
        page_cursor = start_after
        for selected, discovered_cursor in pages:
            page_cursor = discovered_cursor
            if selected:
                objects = selected
                break
        if not objects:
            self.client.write_state(
                pipeline_key, {"objectKey": page_cursor, "scanComplete": True},
                {"stream": stream, "processedObjects": 0,
                 "completedAt": datetime.now(timezone.utc).isoformat()},
            )
            return {"stream": stream, "objects": 0, "assets": 0,
                    "sales": 0, "market": 0, "complete": True}

        assets: dict[str, dict[str, Any]] = {}
        events: list[NormalizedEvent] = []
        # `nft_events` is already filtered by TON Lake's verified collection
        # address. It can safely begin producing finalized-sale evidence while
        # the much larger catalog is still bootstrapping. Metadata and the
        # generic sale stream still require the catalog membership semi-join.
        membership = self._load_membership() if stream in {"nft_metadata", "nft_sales"} else {}
        with tempfile.TemporaryDirectory(dir=self.settings.temp_dir) as temporary:
            membership_path = Path(temporary) / "dns-membership.csv"
            if membership:
                membership_path.write_text(
                    "".join(f"{address}\n" for address in membership), encoding="utf-8"
                )
            for item in objects:
                if item.size_bytes and item.size_bytes > self.settings.max_object_bytes:
                    raise ValueError(
                        f"source object exceeds DNS_MAX_OBJECT_BYTES: {item.key}"
                    )
                filename = item.etag or item.key.rsplit("/", 1)[-1]
                path = source.download(item, Path(temporary) / f"{filename}.parquet")
                if stream == "nft_items":
                    for catalog_item in self.reader.iter_items(path, item.key):
                        self._remember_catalog_asset(assets, catalog_item)
                elif stream == "nft_metadata":
                    for metadata in self.reader.iter_metadata(path, item.key, membership_path):
                        if metadata.domain_normalized:
                            assets[metadata.nft_address] = _asset_record(
                                metadata.nft_address, metadata.domain_normalized,
                                metadata.observed_at, item.key,
                            )
                else:
                    rows = self.reader.iter_sales(path, item.key, membership_path) \
                        if stream == "nft_sales" else self.reader.iter_events(path)
                    for row in rows:
                        try:
                            event = normalize_row(row, item.key)
                        except NormalizationError:
                            continue
                        known_domain = event.domain_normalized or membership.get(event.nft_address)
                        if known_domain and not event.domain_normalized:
                            event = replace(
                                event, domain_raw=known_domain,
                                domain_normalized=known_domain,
                            )
                        if event.domain_normalized:
                            assets[event.nft_address] = _asset_record(
                                event.nft_address, event.domain_normalized,
                                event.event_time, item.key,
                            )
                        events.append(event)

        finalized = [event for event in events
                     if event.event_type == "sale" and event.is_finalized
                     and not event.is_cancelled and event.domain_normalized
                     and event.price_gram and event.price_gram > 0]
        rates = self.rate_provider.rates_at(event.event_time for event in finalized)
        sales = [self._sale_record(event, rates[event.event_time]) for event in finalized]
        market = self._market_records(events)

        assets_written = self.client.ingest_assets(list(assets.values()))
        sales_written = self.client.ingest_sales(sales)
        market_written = self.client.ingest_market(market)
        self.client.write_state(
            pipeline_key, {"objectKey": page_cursor, "scanComplete": False},
            {"stream": stream, "processedObjects": len(objects),
             "assets": len(assets), "sales": len(sales), "market": len(market),
             "processedAt": datetime.now(timezone.utc).isoformat()},
        )
        return {"stream": stream, "objects": len(objects),
                "assets": assets_written, "sales": sales_written,
                "market": market_written, "complete": False}

    def _stream_start_date(self, stream: str):
        """Use recent evidence for pricing, while leaving explicit dates intact.

        TonAPI supplies the verified live DNS catalog. Historical sale and market
        evidence is most useful when recent, and scanning TON Lake from 2022
        delays the first usable estimator without improving a time-decayed price.
        An operator can widen or pin this window with DNS_DIRECT_HISTORY_DAYS or
        DNS_SOURCE_START_DATE when a reconciliation is explicitly required.
        """
        if stream not in {"nft_events", "nft_sales"}:
            return self.settings.start_date
        configured_days = max(30, int(os.getenv("DNS_DIRECT_HISTORY_DAYS", "730") or 730))
        recent_start = datetime.now(timezone.utc).date() - timedelta(days=configured_days)
        configured_start = self.settings.start_date
        return max(recent_start, configured_start) if configured_start else recent_start

    def _available_historical_rates(self, moments: list[datetime]) -> tuple[dict[datetime, Decimal], list[datetime]]:
        provider = self.rate_provider
        available = getattr(provider, "available_rates_at", None)
        if callable(available):
            return available(moments)
        return provider.rates_at(moments), []

    def _getgems_history_page(self, after: str | None, limit: int = 100) -> dict[str, Any]:
        """Read authenticated DNS collection history from Getgems."""
        api_key = os.getenv("GETGEMS_API_KEY", "").strip()
        if not api_key:
            raise RuntimeError("GETGEMS_API_KEY is required for live TON DNS market history")
        base_url = os.getenv("GETGEMS_API_BASE_URL", "https://api.getgems.io/public-api").rstrip("/")
        parameters: list[tuple[str, str]] = [("limit", str(max(1, min(500, limit)))), ("types", "sold")]
        if after:
            parameters.append(("after", after))
        request = urllib.request.Request(
            f"{base_url}/v1/collection/history/{urllib.parse.quote(TONAPI_DNS_COLLECTION, safe='')}?"
            f"{urllib.parse.urlencode(parameters)}",
            headers={
                "Accept": "application/json",
                "Authorization": api_key,
                "User-Agent": "TonTrack-DNS-Market/1.0",
            },
        )
        with urllib.request.urlopen(request, timeout=self.settings.http_timeout_seconds) as response:
            payload = json.loads(response.read().decode("utf-8") or "{}")
        if payload.get("success") is not True or not isinstance(payload.get("response"), dict):
            raise RuntimeError("Getgems collection history returned an invalid response")
        return payload["response"]

    @staticmethod
    def _getgems_time(value: Any) -> datetime:
        text = str(value or "").strip()
        if not text:
            raise ValueError("Getgems event has no timestamp")
        if text.isdecimal():
            return datetime.fromtimestamp(int(text), tz=timezone.utc)
        return datetime.fromisoformat(text.replace("Z", "+00:00")).astimezone(timezone.utc)

    def run_getgems_history(self) -> dict[str, Any]:
        """Backfill compact final DNS sales, then poll the newest Getgems page.

        Getgems is the live DNS secondary market. The TON Lake public archive
        configured by this project ends in 2022, so it is unsuitable as the
        source of current fair-value evidence.
        """
        api_key = os.getenv("GETGEMS_API_KEY", "").strip()
        if not api_key:
            return {"stream": "getgems_history", "configured": False,
                    "reason": "awaiting_getgems_api_key", "complete": False}
        state = self.client.read_state(GETGEMS_HISTORY_KEY) or {}
        cursor = state.get("cursor") or {}
        backfill_complete = bool(cursor.get("backfillComplete"))
        after = None if backfill_complete else str(cursor.get("after") or "") or None
        page = self._getgems_history_page(after)
        cutoff = datetime.now(timezone.utc) - timedelta(days=max(
            30, int(os.getenv("DNS_GETGEMS_HISTORY_DAYS", "730") or 730)
        ))
        assets: list[dict[str, Any]] = []
        staged: list[tuple[dict[str, Any], datetime, Decimal]] = []
        oldest: datetime | None = None
        rejected = 0
        for item in page.get("items") or []:
            try:
                type_data = item.get("typeData") or {}
                if str(type_data.get("type") or "").lower() != "sold":
                    continue
                if str(type_data.get("currency") or "TON").upper() != "TON":
                    continue
                occurred_at = self._getgems_time(item.get("time") or item.get("timestamp"))
                oldest = occurred_at if oldest is None or occurred_at < oldest else oldest
                if occurred_at < cutoff:
                    continue
                nft_address = canonical_raw_address(item.get("address"))
                domain = normalize_domain(item.get("name"))
                price_nano = Decimal(str(type_data.get("priceNano") or "0"))
                if not domain or price_nano <= 0:
                    continue
                price_gram = price_nano / Decimal(1_000_000_000)
                assets.append(_asset_record(nft_address, domain, occurred_at, "getgems:collection-history"))
                staged.append(({
                    "saleId": hashlib.sha256(
                        f"getgems-dns-sale|{item.get('hash') or ''}|{nft_address}|{int(occurred_at.timestamp())}|{price_nano}".encode("utf-8")
                    ).hexdigest(),
                    "assetKind": "dns", "assetKey": nft_address,
                    "normalizedName": domain, "soldAt": int(occurred_at.timestamp()),
                    "priceGram": float(price_gram), "marketplace": "Getgems",
                    "source": "getgems-collection-history", "reliabilityScore": 1,
                    "qualityFlags": ["getgems-finalized-sale"],
                    **_compact_features(domain),
                }, occurred_at, price_gram))
            except (AddressError, ArithmeticError, TypeError, ValueError):
                rejected += 1
        rates, pending_rates = self._available_historical_rates(
            [occurred_at for _, occurred_at, _ in staged]
        )
        sales = [{**record, "historicalUsdRate": float(rates[occurred_at]),
                  "priceUsd": float(price_gram * rates[occurred_at])}
                 for record, occurred_at, price_gram in staged if rates.get(occurred_at, Decimal(0)) > 0]
        assets_written = self.client.ingest_assets(assets)
        sales_written = self.client.ingest_sales(sales)
        exhausted = not page.get("cursor") or (oldest is not None and oldest < cutoff)
        next_cursor = ({"after": after, "backfillComplete": backfill_complete}
                       if pending_rates else {
                           "after": None if exhausted else page.get("cursor"),
                           "backfillComplete": backfill_complete or exhausted,
                       })
        self.client.write_state(GETGEMS_HISTORY_KEY, next_cursor, {
            "items": len(page.get("items") or []), "assets": assets_written,
            "sales": sales_written, "pendingHistoricalUsd": len(pending_rates), "rejected": rejected,
            "oldestObservedAt": oldest.isoformat() if oldest else None,
            "processedAt": datetime.now(timezone.utc).isoformat(),
        })
        return {"stream": "getgems_history", "configured": True,
                "assets": assets_written, "sales": sales_written,
                "rejected": rejected, "pendingHistoricalUsd": len(pending_rates),
                "complete": bool(next_cursor["backfillComplete"]),
                "live": backfill_complete}

    def _pace_toncenter_public_request(self) -> None:
        """Persist the public-host pacing window across worker invocations."""
        if os.getenv("TONCENTER_API_KEY", "").strip():
            return
        interval = max(1.05, float(os.getenv("TONCENTER_PUBLIC_INTERVAL_SECONDS", "1.1") or 1.1))
        state = self.client.read_state(TONCENTER_RATE_LIMIT_KEY) or {}
        cursor = state.get("cursor") or {}
        try:
            last_request_at = float(cursor.get("lastRequestAt") or 0)
        except (TypeError, ValueError):
            last_request_at = 0
        wait_seconds = max(0.0, last_request_at + interval - time.time())
        if wait_seconds:
            time.sleep(wait_seconds)
        requested_at = time.time()
        self.client.write_state(
            TONCENTER_RATE_LIMIT_KEY,
            {"lastRequestAt": requested_at},
            {
                "source": "toncenter-public",
                "minimumIntervalSeconds": interval,
                "processedAt": datetime.now(timezone.utc).isoformat(),
            },
        )

    def _toncenter_request(self, path: str, parameters: list[tuple[str, str]]) -> dict[str, Any]:
        """Read indexed on-chain data without relying on marketplace credentials."""
        base_url = os.getenv("TONCENTER_API_BASE_URL", "https://toncenter.com/api/v3").rstrip("/")
        attempts = max(1, min(5, int(os.getenv("TONCENTER_RETRY_ATTEMPTS", "3") or 3)))
        retryable_statuses = {429, 500, 502, 503, 504}
        for attempt in range(attempts):
            self._pace_toncenter_public_request()
            request = urllib.request.Request(
                f"{base_url}{path}?{urllib.parse.urlencode(parameters, doseq=True)}",
                headers={"Accept": "application/json", "User-Agent": "TonTrack-DNS-Market/1.0"},
            )
            api_key = os.getenv("TONCENTER_API_KEY", "").strip()
            if api_key:
                request.add_header("X-API-Key", api_key)
            try:
                with urllib.request.urlopen(request, timeout=self.settings.http_timeout_seconds) as response:
                    payload = json.loads(response.read().decode("utf-8") or "{}")
                if not isinstance(payload, dict):
                    raise RuntimeError("TON Center returned an invalid response")
                return payload
            except urllib.error.HTTPError as exc:
                if exc.code not in retryable_statuses or attempt + 1 >= attempts:
                    raise
            except (urllib.error.URLError, TimeoutError, OSError):
                if attempt + 1 >= attempts:
                    raise
            time.sleep(min(12, 2 ** attempt))
        raise RuntimeError("TON Center request exhausted retries")

    def _toncenter_transfer_page(self, before_lt: int | None, cutoff: datetime,
                                 limit: int = 1000) -> dict[str, Any]:
        parameters: list[tuple[str, str]] = [
            ("collection_address", TONAPI_DNS_COLLECTION),
            ("start_utime", str(int(cutoff.timestamp()))),
            ("limit", str(max(1, min(1000, limit)))),
        ]
        if before_lt is not None:
            parameters.append(("end_lt", str(before_lt)))
        return self._toncenter_request("/nft/transfers", parameters)

    def _toncenter_sale_contracts(self, addresses: list[str]) -> dict[str, Any]:
        return self._toncenter_request("/nft/sales", [("address", address) for address in addresses])

    def run_toncenter_history(self) -> dict[str, Any]:
        """Ingest completed DNS sales from TON's public indexed chain data.

        A DNS ownership transfer is considered a sale only when its old owner is
        a recognized NFT sale contract and that contract is completed. This
        avoids treating ordinary transfers as market evidence while keeping the
        pipeline independent of a paid marketplace API key.
        """
        state = self.client.read_state(TONCENTER_HISTORY_KEY) or {}
        cursor = state.get("cursor") or {}
        backfill_complete = bool(cursor.get("backfillComplete"))
        days = max(30, int(os.getenv("DNS_TONCENTER_HISTORY_DAYS", "730") or 730))
        cutoff = datetime.now(timezone.utc) - timedelta(days=days)
        before_lt = None if backfill_complete else int(cursor["beforeLt"]) if cursor.get("beforeLt") else None
        page = self._toncenter_transfer_page(before_lt, cutoff)
        transfers = page.get("nft_transfers") or []
        address_book = page.get("address_book") or {}
        sale_contracts: set[str] = set()
        for address, details in address_book.items():
            try:
                if any(str(interface).startswith("nft_sale_")
                       for interface in (details.get("interfaces") or [])):
                    sale_contracts.add(canonical_raw_address(address))
            except (AddressError, AttributeError, TypeError):
                continue
        candidates: dict[str, dict[str, Any]] = {}
        rejected = 0
        for transfer in transfers:
            try:
                if transfer.get("transaction_aborted") is True:
                    continue
                old_owner = canonical_raw_address(transfer.get("old_owner"))
                item = canonical_raw_address(transfer.get("nft_address"))
                if old_owner not in sale_contracts:
                    continue
                candidates[old_owner] = {"transfer": transfer, "item": item}
            except (AddressError, TypeError, ValueError):
                rejected += 1
        sales_page = self._toncenter_sale_contracts(list(candidates)) if candidates else {"nft_sales": []}
        assets: list[dict[str, Any]] = []
        staged: list[tuple[dict[str, Any], datetime, Decimal]] = []
        for sale in sales_page.get("nft_sales") or []:
            try:
                contract = canonical_raw_address(sale.get("address"))
                candidate = candidates.get(contract)
                details = sale.get("details") or {}
                nft = sale.get("nft_item") or {}
                if not candidate or details.get("is_complete") is not True:
                    continue
                nft_address = canonical_raw_address(sale.get("nft_address"))
                if nft_address != candidate["item"]:
                    continue
                domain = normalize_domain((nft.get("content") or {}).get("domain"))
                price_nano = Decimal(str(details.get("full_price") or "0"))
                occurred_at = datetime.fromtimestamp(
                    int(candidate["transfer"].get("transaction_now")), tz=timezone.utc
                )
                if not domain or price_nano <= 0 or occurred_at < cutoff:
                    continue
                price_gram = price_nano / Decimal(1_000_000_000)
                assets.append(_asset_record(nft_address, domain, occurred_at, "toncenter:nft-transfer"))
                staged.append(({
                    "saleId": hashlib.sha256(
                        f"toncenter-dns-sale|{contract}|{nft_address}|{candidate['transfer'].get('transaction_hash')}".encode("utf-8")
                    ).hexdigest(),
                    "assetKind": "dns", "assetKey": nft_address,
                    "normalizedName": domain, "soldAt": int(occurred_at.timestamp()),
                    "priceGram": float(price_gram), "marketplace": "Getgems",
                    "source": "toncenter-indexed-sale", "reliabilityScore": 1,
                    "qualityFlags": ["toncenter-completed-sale-contract"],
                    **_compact_features(domain),
                }, occurred_at, price_gram))
            except (AddressError, ArithmeticError, TypeError, ValueError):
                rejected += 1
        rates, pending_rates = self._available_historical_rates(
            [occurred_at for _, occurred_at, _ in staged]
        )
        sales = [{**record, "historicalUsdRate": float(rates[occurred_at]),
                  "priceUsd": float(price_gram * rates[occurred_at])}
                 for record, occurred_at, price_gram in staged if rates.get(occurred_at, Decimal(0)) > 0]
        oldest_lt = min((int(row.get("transaction_lt") or 0) for row in transfers), default=0)
        exhausted = len(transfers) < 1000
        next_cursor = ({"beforeLt": before_lt, "backfillComplete": backfill_complete}
                       if pending_rates else {
                           "beforeLt": None if exhausted or not oldest_lt else oldest_lt - 1,
                           "backfillComplete": backfill_complete or exhausted,
                       })
        assets_written = self.client.ingest_assets(assets)
        sales_written = self.client.ingest_sales(sales)
        self.client.write_state(TONCENTER_HISTORY_KEY, next_cursor, {
            "transfers": len(transfers), "saleContracts": len(candidates),
            "assets": assets_written, "sales": sales_written,
            "pendingHistoricalUsd": len(pending_rates), "rejected": rejected,
            "processedAt": datetime.now(timezone.utc).isoformat(),
        })
        return {"stream": "toncenter_history", "configured": True,
                "transfers": len(transfers), "assets": assets_written,
                "sales": sales_written, "pendingHistoricalUsd": len(pending_rates),
                "rejected": rejected,
                "complete": bool(next_cursor["backfillComplete"]), "live": backfill_complete}

    def _tonapi_page(self, offset: int, limit: int) -> list[dict[str, Any]]:
        base_url = os.getenv("TONAPI_BASE_URL", "https://tonapi.io").rstrip("/")
        query = urllib.parse.urlencode({"limit": limit, "offset": offset})
        request = urllib.request.Request(
            f"{base_url}/v2/nfts/collections/{TONAPI_DNS_COLLECTION}/items?{query}",
            headers={"Accept": "application/json", "User-Agent": "TonTrack-DNS-Membership/1.0"},
        )
        api_key = os.getenv("TONAPI_API_KEY", "").strip()
        if api_key:
            request.add_header("Authorization", f"Bearer {api_key}")
        with urllib.request.urlopen(request, timeout=self.settings.http_timeout_seconds) as response:
            payload = json.loads(response.read().decode("utf-8") or "{}")
        rows = payload.get("nft_items") or []
        return rows if isinstance(rows, list) else []

    def run_tonapi_membership_seed(self) -> dict[str, Any]:
        """Seed the verified DNS membership set before historical sale scans."""
        state = self.client.read_state(TONAPI_MEMBERSHIP_KEY) or {}
        cursor = state.get("cursor") or {}
        if cursor.get("scanComplete"):
            return {"stream": "tonapi_membership", "assets": 0, "pages": 0, "complete": True}
        offset = max(0, int(cursor.get("offset") or 0))
        page_size = max(1, min(1000, int(os.getenv("TONAPI_MEMBERSHIP_PAGE_SIZE", "1000") or 1000)))
        pages = max(1, min(24, int(os.getenv("TONAPI_MEMBERSHIP_PAGES_PER_CYCLE", "24") or 24)))
        wait_seconds = 0 if os.getenv("TONAPI_API_KEY", "").strip() else 4.2
        assets_written = 0
        completed = False
        for page in range(pages):
            rows = self._tonapi_page(offset, page_size)
            records = []
            observed_at = datetime.now(timezone.utc)
            for row in rows:
                try:
                    collection = canonical_raw_address((row.get("collection") or {}).get("address"))
                    address = canonical_raw_address(row.get("address"))
                except AddressError:
                    continue
                if collection != TON_DNS_COLLECTION or row.get("verified") is not True:
                    continue
                domain = normalize_domain((row.get("metadata") or {}).get("name"))
                if domain:
                    records.append(_asset_record(address, domain, observed_at, f"tonapi:offset={offset}"))
            assets_written += self.client.ingest_assets(records)
            offset += len(rows)
            completed = len(rows) < page_size
            latest_state = self.client.read_state(TONAPI_MEMBERSHIP_KEY) or {}
            latest_cursor = latest_state.get("cursor") or {}
            latest_offset = max(0, int(latest_cursor.get("offset") or 0))
            if latest_offset > offset:
                # A newer cron invocation has already committed farther
                # progress. Asset writes are idempotent, but never let this
                # older invocation move the shared cursor backwards.
                return {"stream": "tonapi_membership", "assets": assets_written,
                        "pages": page + 1, "offset": latest_offset,
                        "complete": bool(latest_cursor.get("scanComplete")),
                        "superseded": True}
            self.client.write_state(
                TONAPI_MEMBERSHIP_KEY,
                {"offset": offset, "scanComplete": completed},
                {"pages": page + 1, "assets": assets_written, "processedAt": observed_at.isoformat()},
            )
            if completed:
                break
            if wait_seconds and page + 1 < pages:
                time.sleep(wait_seconds)
        return {"stream": "tonapi_membership", "assets": assets_written,
                "pages": page + 1, "offset": offset, "complete": completed}

    def run_cycle(self, page_size: int = 4) -> dict[str, Any]:
        """Advance one safe bootstrap page, then rotate all live streams."""
        membership_state = self.client.read_state(TONAPI_MEMBERSHIP_KEY) or {}
        membership_complete = bool((membership_state.get("cursor") or {}).get("scanComplete"))
        states = {
            stream: self.client.read_state(f"{DIRECT_PIPELINE_VERSION}:{stream}") or {}
            for stream in SUPPORTED_DIRECT_STREAMS
        }
        complete = {
            stream: bool((state.get("cursor") or {}).get("scanComplete"))
            for stream, state in states.items()
        }
        history_key = GETGEMS_HISTORY_KEY if os.getenv("GETGEMS_API_KEY", "").strip() else TONCENTER_HISTORY_KEY
        history_stream = "getgems_history" if history_key == GETGEMS_HISTORY_KEY else "toncenter_history"
        history_state = self.client.read_state(history_key) or {}
        complete[history_stream] = bool(
            (history_state.get("cursor") or {}).get("backfillComplete")
        )
        # TonAPI membership is our verified catalog. Once it is complete, live
        # price evidence comes from Getgems when a key is configured, otherwise
        # from TON Center's completed on-chain sale contracts. TON Lake remains
        # manual reconciliation only because its public archive is stale.
        safe_bootstrap = (["tonapi_membership"] if not membership_complete
                          else [history_stream])
        incomplete = [stream for stream in safe_bootstrap if stream == "tonapi_membership" or not complete[stream]]
        if incomplete:
            scheduler = self.client.read_state(DIRECT_SCHEDULER_KEY) or {}
            cursor = scheduler.get("cursor") or {}
            start = int(cursor.get("bootstrapNextStreamIndex") or 0) % len(safe_bootstrap)
            stream = next(
                candidate for offset in range(len(safe_bootstrap))
                if (candidate := safe_bootstrap[(start + offset) % len(safe_bootstrap)]) in incomplete
            )
            result = self.run_tonapi_membership_seed() if stream == "tonapi_membership" \
                else self.run_getgems_history() if stream == "getgems_history" else self.run_toncenter_history()
            next_index = (safe_bootstrap.index(stream) + 1) % len(safe_bootstrap)
            self.client.write_state(
                DIRECT_SCHEDULER_KEY,
                {"bootstrapNextStreamIndex": next_index},
                {"lastStream": stream, "processedAt": datetime.now(timezone.utc).isoformat()},
            )
            return {**result, "phase": "bootstrap", "remainingStreams": incomplete}

        scheduler = self.client.read_state(DIRECT_SCHEDULER_KEY) or {}
        scheduler_cursor = scheduler.get("cursor") or {}
        stream = history_stream
        result = self.run_getgems_history() if stream == "getgems_history" else self.run_toncenter_history()
        self.client.write_state(
            DIRECT_SCHEDULER_KEY,
            {"nextStreamIndex": 0, "bootstrapComplete": True},
            {"lastStream": stream, "processedAt": datetime.now(timezone.utc).isoformat()},
        )
        return {**result, "phase": "incremental", "nextStream": stream}

    @staticmethod
    def _remember_catalog_asset(assets: dict[str, dict[str, Any]],
                                item: CatalogItem) -> None:
        if item.domain_normalized:
            assets[item.nft_address] = _asset_record(
                item.nft_address, item.domain_normalized, item.observed_at,
                item.source_object_key,
            )

    def _load_membership(self) -> dict[str, str]:
        members: dict[str, str] = {}
        cursor: str | None = None
        while True:
            page = self.client.read_assets("dns", cursor=cursor, limit=5000)
            for record in page.get("records", []):
                address = str(record.get("asset_key") or "").lower()
                domain = str(record.get("normalized_name") or "").lower()
                if address and domain:
                    members[address] = domain
            cursor = page.get("nextCursor")
            if not cursor:
                break
        if not members:
            raise RuntimeError("verified TON DNS membership has not been bootstrapped")
        return members

    @staticmethod
    def _sale_record(event: NormalizedEvent, rate: Decimal) -> dict[str, Any]:
        if not event.domain_normalized or not event.price_gram or rate <= 0:
            raise ValueError(
                f"finalized DNS sale lacks identity or historical USD: {event.event_id}"
            )
        features = _compact_features(event.domain_normalized)
        return {
            "saleId": hashlib.sha256(
                f"dns-sale|{event.nft_address}|{int(event.event_time.timestamp())}|"
                f"{event.price_nano_gram}|{event.sale_contract or ''}".encode("utf-8")
            ).hexdigest(), "assetKind": "dns",
            "assetKey": event.nft_address,
            "normalizedName": event.domain_normalized,
            "soldAt": int(event.event_time.timestamp()),
            "priceGram": float(event.price_gram),
            "historicalUsdRate": float(rate),
            "priceUsd": float(event.price_gram * rate),
            "marketplace": event.marketplace_name or "TON DNS",
            "source": event.source, "reliabilityScore": 1,
            "qualityFlags": [*event.quality_flags,
                             f"market_kind:{event.market_kind}"],
            "primaryRoute": features["primaryRoute"],
            "lengthBucket": features["lengthBucket"],
            "script": features["script"],
            "scarcityClass": features["scarcityClass"],
        }

    @staticmethod
    def _market_records(events: list[NormalizedEvent]) -> list[dict[str, Any]]:
        latest: dict[str, NormalizedEvent] = {}
        for event in events:
            if event.event_type not in {"put_on_sale", "bid", "cancel_sale", "sale"}:
                continue
            current = latest.get(event.nft_address)
            if current is None or event.event_time >= current.event_time:
                latest[event.nft_address] = event
        records = []
        for event in latest.values():
            active = event.event_type in {"put_on_sale", "bid"} and not event.is_cancelled
            records.append({
                "assetKind": "dns", "assetKey": event.nft_address,
                "lowestAskGram": float(event.price_gram)
                if active and event.event_type == "put_on_sale" and event.price_gram else None,
                "highestBidGram": float(event.price_gram)
                if active and event.event_type == "bid" and event.price_gram else None,
                "marketplace": event.marketplace_name or "",
                "verified": event.market_kind in {
                    "registration_auction", "secondary_getgems"
                },
                "observedAt": event.event_time.isoformat(),
                "staleAt": (event.event_time + timedelta(hours=6)).isoformat()
                if active else event.event_time.isoformat(),
            })
        return records

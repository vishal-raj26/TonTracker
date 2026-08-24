"""Anonymous, paginated discovery and bounded download for TON-ETL S3."""

from __future__ import annotations

import logging
import os
import random
import time
import urllib.error
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from collections.abc import Callable, Iterator
from datetime import date, datetime
from email.utils import parsedate_to_datetime
from pathlib import Path

from .constants import DEFAULT_DISCOVERY_PAGE_SIZE
from .models import SourceObject

LOGGER = logging.getLogger(__name__)
S3_XML_NAMESPACE = "http://s3.amazonaws.com/doc/2006-03-01/"


class SourceError(RuntimeError):
    """Raised when a source request remains unsuccessful after retries."""


class S3Source:
    def __init__(
        self,
        bucket_url: str,
        prefix: str,
        timeout_seconds: float = 30.0,
        retry_attempts: int = 5,
        backoff_seconds: float = 2.0,
        opener: Callable[..., object] | None = None,
        sleeper: Callable[[float], None] = time.sleep,
    ) -> None:
        self.bucket_url = bucket_url.rstrip("/")
        self.prefix = prefix
        self.timeout_seconds = timeout_seconds
        self.retry_attempts = retry_attempts
        self.backoff_seconds = backoff_seconds
        self._opener = opener or urllib.request.urlopen
        self._sleeper = sleeper

    def iter_objects(
        self,
        start_date: date | None = None,
        end_date: date | None = None,
        max_keys: int = DEFAULT_DISCOVERY_PAGE_SIZE,
        start_after: str | None = None,
    ) -> Iterator[SourceObject]:
        for objects, _ in self.iter_pages(
            start_date=start_date,
            end_date=end_date,
            max_keys=max_keys,
            start_after=start_after,
        ):
            yield from objects

    def iter_pages(
        self,
        start_date: date | None = None,
        end_date: date | None = None,
        max_keys: int = DEFAULT_DISCOVERY_PAGE_SIZE,
        start_after: str | None = None,
    ) -> Iterator[tuple[list[SourceObject], str | None]]:
        continuation_token: str | None = None
        while True:
            params = {
                "list-type": "2",
                "prefix": self.prefix,
                "max-keys": str(max_keys),
            }
            if continuation_token:
                params["continuation-token"] = continuation_token
            elif start_after:
                params["start-after"] = start_after
            url = f"{self.bucket_url}/?{urllib.parse.urlencode(params)}"
            body, _ = self._request(url)
            objects, is_truncated, continuation_token = parse_list_objects_v2(body)
            raw_partition_dates = [
                parsed
                for parsed in (partition_date_from_key(item.key) for item in objects)
                if parsed is not None
            ]
            if end_date and raw_partition_dates and min(raw_partition_dates) > end_date:
                return
            selected: list[SourceObject] = []
            for item in objects:
                partition_date = partition_date_from_key(item.key)
                if partition_date is None:
                    continue
                if start_date and partition_date < start_date:
                    continue
                if end_date and partition_date > end_date:
                    continue
                selected.append(item)
            page_cursor = objects[-1].key if objects else start_after
            yield selected, page_cursor
            if not is_truncated:
                return
            if not continuation_token:
                raise SourceError("S3 response was truncated without a continuation token")

    def download(self, item: SourceObject, destination: Path) -> Path:
        destination.parent.mkdir(parents=True, exist_ok=True)
        quoted_key = urllib.parse.quote(item.key, safe="/=")
        url = f"{self.bucket_url}/{quoted_key}"
        temporary = destination.with_suffix(destination.suffix + ".part")
        last_error: Exception | None = None
        for attempt in range(1, self.retry_attempts + 1):
            downloaded = 0
            try:
                request = urllib.request.Request(
                    url,
                    headers={"User-Agent": "TonTrack-DNS-Market-Worker/1.0"},
                )
                with self._opener(request, timeout=self.timeout_seconds) as response:
                    expected_length = item.size_bytes
                    header_length = response.headers.get("Content-Length")
                    if expected_length is None and header_length:
                        expected_length = int(header_length)
                    with temporary.open("wb") as output:
                        while True:
                            chunk = response.read(1024 * 1024)
                            if not chunk:
                                break
                            output.write(chunk)
                            downloaded += len(chunk)
                if expected_length is not None and downloaded != expected_length:
                    raise SourceError(
                        f"downloaded {downloaded} bytes for {item.key}; expected {expected_length}"
                    )
                os.replace(temporary, destination)
                return destination
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError, SourceError) as exc:
                last_error = exc
                temporary.unlink(missing_ok=True)
                if attempt >= self.retry_attempts:
                    break
                delay = self.backoff_seconds * (2 ** (attempt - 1))
                delay += random.uniform(0, min(1.0, delay * 0.1))
                self._sleeper(delay)
        raise SourceError(f"source download failed: {item.key}: {last_error}") from last_error

    def _request(self, url: str) -> tuple[bytes, object]:
        last_error: Exception | None = None
        for attempt in range(1, self.retry_attempts + 1):
            try:
                request = urllib.request.Request(
                    url,
                    headers={"User-Agent": "TonTrack-DNS-Market-Worker/1.0"},
                )
                with self._opener(request, timeout=self.timeout_seconds) as response:
                    return response.read(), response.headers
            except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError) as exc:
                last_error = exc
                retryable = not isinstance(exc, urllib.error.HTTPError) or exc.code in {
                    408,
                    425,
                    429,
                    500,
                    502,
                    503,
                    504,
                }
                if not retryable or attempt >= self.retry_attempts:
                    break
                retry_after = _retry_after_seconds(exc)
                delay = retry_after or self.backoff_seconds * (2 ** (attempt - 1))
                delay += random.uniform(0, min(1.0, delay * 0.1))
                LOGGER.warning(
                    "source request retry",
                    extra={
                        "context": {
                            "attempt": attempt,
                            "delay_seconds": round(delay, 3),
                            "error": str(exc),
                        }
                    },
                )
                self._sleeper(delay)
        raise SourceError(f"source request failed: {url}: {last_error}") from last_error


def parse_list_objects_v2(xml_body: bytes) -> tuple[list[SourceObject], bool, str | None]:
    try:
        root = ET.fromstring(xml_body)
    except ET.ParseError as exc:
        raise SourceError(f"invalid S3 XML response: {exc}") from exc

    ns = {"s3": S3_XML_NAMESPACE}
    objects: list[SourceObject] = []
    for content in root.findall("s3:Contents", ns):
        key = _node_text(content.find("s3:Key", ns))
        if not key or key.endswith("/"):
            continue
        etag = _node_text(content.find("s3:ETag", ns))
        if etag:
            etag = etag.strip('"')
        size_text = _node_text(content.find("s3:Size", ns))
        modified_text = _node_text(content.find("s3:LastModified", ns))
        objects.append(
            SourceObject(
                key=key,
                etag=etag or None,
                size_bytes=int(size_text) if size_text else None,
                last_modified=_parse_datetime(modified_text),
            )
        )

    truncated = (_node_text(root.find("s3:IsTruncated", ns)) or "false").lower() == "true"
    token = _node_text(root.find("s3:NextContinuationToken", ns)) or None
    return objects, truncated, token


def partition_date_from_key(key: str) -> date | None:
    marker = "/date="
    if marker not in key:
        return None
    value = key.split(marker, 1)[1].split("/", 1)[0]
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _node_text(node: ET.Element | None) -> str:
    return (node.text or "").strip() if node is not None else ""


def _parse_datetime(value: str) -> datetime | None:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(normalized)
    except ValueError:
        try:
            return parsedate_to_datetime(value)
        except (TypeError, ValueError):
            return None


def _retry_after_seconds(exc: Exception) -> float | None:
    if not isinstance(exc, urllib.error.HTTPError):
        return None
    value = exc.headers.get("Retry-After") if exc.headers else None
    if not value:
        return None
    try:
        return max(0.0, float(value))
    except ValueError:
        return None

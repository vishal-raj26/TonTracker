"""Small authenticated client for TonTrack's compact D1 identity ledger."""

from __future__ import annotations

import json
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Callable


class D1ClientError(RuntimeError):
    pass


class D1IdentityClient:
    def __init__(self, base_url: str, secret: str, timeout_seconds: float = 45.0,
                 opener: Callable[..., object] | None = None) -> None:
        if not base_url.strip() or not secret.strip():
            raise ValueError("D1 registry URL and ingest secret are required")
        self.base_url = base_url.rstrip("/")
        self.secret = secret
        self.timeout_seconds = timeout_seconds
        self._opener = opener or urllib.request.urlopen

    def read_state(self, pipeline_key: str) -> dict[str, Any] | None:
        encoded = urllib.parse.quote(pipeline_key, safe="")
        return self._request(f"/identity/state?key={encoded}").get("state")

    def write_state(self, pipeline_key: str, cursor: dict[str, Any],
                    metadata: dict[str, Any]) -> None:
        self._request("/ingest/identity-state", {
            "pipelineKey": pipeline_key, "cursor": cursor, "metadata": metadata,
        }, authorized=True)

    def ingest_assets(self, records: list[dict[str, Any]]) -> int:
        return self._write_records("/ingest/identity-assets", records)

    def ingest_sales(self, records: list[dict[str, Any]]) -> int:
        return self._write_records("/ingest/identity-sales", records)

    def ingest_market(self, records: list[dict[str, Any]]) -> int:
        return self._write_records("/ingest/identity-market", records)

    def read_assets(self, asset_kind: str, cursor: str | None = None,
                    limit: int = 5000) -> dict[str, Any]:
        return self._request("/identity/assets/read", {
            "assetKind": asset_kind, "cursor": cursor, "limit": limit,
        })

    def _write_records(self, path: str, records: list[dict[str, Any]]) -> int:
        written = 0
        for index in range(0, len(records), 500):
            payload = self._request(path, {
                "records": records[index:index + 500],
            }, authorized=True)
            written += int(payload.get("inserted") or payload.get("changed")
                           or payload.get("written") or 0)
        return written

    def _request(self, path: str, body: dict[str, Any] | None = None,
                 authorized: bool = False) -> dict[str, Any]:
        headers = {"Accept": "application/json", "User-Agent": "TonTrack-DNS-D1/1.0"}
        data = None
        if body is not None:
            data = json.dumps(body, separators=(",", ":")).encode("utf-8")
            headers["Content-Type"] = "application/json"
        if authorized:
            headers["Authorization"] = f"Bearer {self.secret}"
        request = urllib.request.Request(
            f"{self.base_url}{path}", data=data, headers=headers,
            method="POST" if body is not None else "GET",
        )
        try:
            with self._opener(request, timeout=self.timeout_seconds) as response:
                return json.loads(response.read().decode("utf-8") or "{}")
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError, OSError) as exc:
            detail = exc.read().decode("utf-8", errors="replace")[:500] \
                if isinstance(exc, urllib.error.HTTPError) else ""
            raise D1ClientError(f"D1 request failed for {path}: {exc} {detail}".strip()) from exc

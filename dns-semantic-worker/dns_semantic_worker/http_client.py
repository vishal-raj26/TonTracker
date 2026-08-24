"""Small retrying JSON client used by optional inference and vector services."""

from __future__ import annotations

import json
import random
import time
from dataclasses import dataclass
from typing import Any, Callable
from urllib import error, request


class HttpClientError(RuntimeError):
    pass


@dataclass
class RateLimiter:
    requests_per_second: float
    clock: Callable[[], float] = time.monotonic
    sleep: Callable[[float], None] = time.sleep
    _last_request_at: float | None = None

    def wait(self) -> None:
        if self._last_request_at is not None:
            minimum_interval = 1.0 / self.requests_per_second
            remaining = minimum_interval - (self.clock() - self._last_request_at)
            if remaining > 0:
                self.sleep(remaining)
        self._last_request_at = self.clock()


class JsonHttpClient:
    def __init__(
        self,
        *,
        timeout_seconds: float,
        requests_per_second: float,
        max_attempts: int = 4,
        opener: Callable[..., Any] = request.urlopen,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self.timeout_seconds = timeout_seconds
        self.max_attempts = max_attempts
        self.opener = opener
        self.sleep = sleep
        self.limiter = RateLimiter(requests_per_second, sleep=sleep)

    def post(
        self, url: str, payload: dict[str, Any], api_key: str | None = None
    ) -> dict[str, Any]:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        headers = {"Content-Type": "application/json", "Accept": "application/json"}
        if api_key:
            headers["Authorization"] = f"Bearer {api_key}"
        last_error: Exception | None = None
        for attempt in range(1, self.max_attempts + 1):
            self.limiter.wait()
            try:
                req = request.Request(url, data=body, headers=headers, method="POST")
                with self.opener(req, timeout=self.timeout_seconds) as response:
                    data = response.read()
                    parsed = json.loads(data.decode("utf-8"))
                    if not isinstance(parsed, dict):
                        raise HttpClientError("HTTP endpoint returned a non-object JSON value")
                    return parsed
            except (error.HTTPError, error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
                last_error = exc
                status = getattr(exc, "code", None)
                retryable = status in {408, 409, 425, 429, 500, 502, 503, 504} or status is None
                if attempt >= self.max_attempts or not retryable:
                    break
                retry_after = None
                headers_obj = getattr(exc, "headers", None)
                if headers_obj:
                    retry_after_raw = headers_obj.get("Retry-After")
                    try:
                        retry_after = float(retry_after_raw) if retry_after_raw else None
                    except ValueError:
                        retry_after = None
                delay = retry_after or min(30.0, 2 ** (attempt - 1) + random.random())
                self.sleep(delay)
        raise HttpClientError(f"HTTP request failed after {self.max_attempts} attempts: {last_error}")

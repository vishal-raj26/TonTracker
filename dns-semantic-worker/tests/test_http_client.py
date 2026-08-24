import json
from io import BytesIO
from urllib import error

import pytest

from dns_semantic_worker.http_client import HttpClientError, JsonHttpClient, RateLimiter


class Response:
    def __init__(self, payload):
        self.body = BytesIO(json.dumps(payload).encode("utf-8"))

    def __enter__(self):
        return self

    def __exit__(self, *_):
        return False

    def read(self):
        return self.body.read()


def test_http_client_retries_rate_limit_and_honors_retry_after():
    calls = []
    sleeps = []

    def opener(req, timeout):
        calls.append((req, timeout))
        if len(calls) == 1:
            raise error.HTTPError(
                req.full_url,
                429,
                "rate limited",
                {"Retry-After": "2.5"},
                None,
            )
        return Response({"data": [{"embedding": [1.0]}]})

    client = JsonHttpClient(
        timeout_seconds=7,
        requests_per_second=1000,
        max_attempts=2,
        opener=opener,
        sleep=sleeps.append,
    )
    result = client.post("https://models.test/v1/embeddings", {"input": ["x"]}, "key")
    assert result["data"][0]["embedding"] == [1.0]
    assert len(calls) == 2
    assert calls[0][1] == 7
    assert calls[0][0].get_header("Authorization") == "Bearer key"
    assert any(delay == 2.5 for delay in sleeps)


def test_http_client_stops_after_bounded_timeouts():
    attempts = 0

    def opener(_req, timeout):
        nonlocal attempts
        assert timeout == 1
        attempts += 1
        raise TimeoutError("provider timeout")

    client = JsonHttpClient(
        timeout_seconds=1,
        requests_per_second=1000,
        max_attempts=3,
        opener=opener,
        sleep=lambda _: None,
    )
    with pytest.raises(HttpClientError, match="after 3 attempts"):
        client.post("https://models.test/v1/chat/completions", {})
    assert attempts == 3


def test_rate_limiter_spaces_requests():
    times = iter([0.0, 0.25, 0.25])
    sleeps = []
    limiter = RateLimiter(
        requests_per_second=2,
        clock=lambda: next(times),
        sleep=sleeps.append,
    )
    limiter.wait()
    limiter.wait()
    assert sleeps == [0.25]

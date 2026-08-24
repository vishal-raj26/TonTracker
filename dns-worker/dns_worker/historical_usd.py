"""Historical GRAM/USD attribution with no current-rate or static fallback."""

from __future__ import annotations

import json
import urllib.parse
import urllib.request
from bisect import bisect_left
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Callable, Iterable


class HistoricalRateError(RuntimeError):
    pass


class HistoricalUsdProvider:
    def __init__(self, base_url: str = "https://coins.llama.fi",
                 timeout_seconds: float = 30.0,
                 opener: Callable[..., object] | None = None) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds
        self._opener = opener or urllib.request.urlopen

    def rates_at(self, event_times: Iterable[datetime]) -> dict[datetime, Decimal]:
        times = sorted({value.astimezone(timezone.utc) for value in event_times})
        if not times:
            return {}
        points = self._load_points(times[0] - timedelta(hours=6),
                                   times[-1] + timedelta(hours=6))
        return {event_time: self._interpolated_rate(points, event_time)
                for event_time in times}

    def available_rates_at(self, event_times: Iterable[datetime]) -> tuple[dict[datetime, Decimal], list[datetime]]:
        """Return only rates that are genuinely bracketed by observed history.

        Fresh sales can be newer than the provider's newest six-hour observation.
        They are retried by the caller later instead of being assigned a live or
        default rate, while older sales in the same batch remain usable.
        """
        times = sorted({value.astimezone(timezone.utc) for value in event_times})
        if not times:
            return {}, []
        points = self._load_points(times[0] - timedelta(hours=6),
                                   times[-1] + timedelta(hours=6))
        rates: dict[datetime, Decimal] = {}
        pending: list[datetime] = []
        for event_time in times:
            try:
                rates[event_time] = self._interpolated_rate(points, event_time)
            except HistoricalRateError:
                pending.append(event_time)
        return rates, pending

    def _load_points(self, start: datetime, end: datetime) -> list[tuple[int, Decimal]]:
        period_seconds = 6 * 60 * 60
        span = max(2, min(499, int((end - start).total_seconds() / period_seconds) + 2))
        query = urllib.parse.urlencode({
            "start": int(start.timestamp()), "span": span, "period": "6h",
        })
        request = urllib.request.Request(
            f"{self.base_url}/chart/coingecko:the-open-network?{query}",
            headers={"Accept": "application/json", "User-Agent": "TonTrack-DNS-D1/1.0"},
        )
        with self._opener(request, timeout=self.timeout_seconds) as response:
            payload = json.loads(response.read().decode("utf-8"))
        raw_points = payload.get("coins", {}).get("coingecko:the-open-network", {}).get("prices", [])
        points = sorted(
            (int(point["timestamp"]), Decimal(str(point["price"])))
            for point in raw_points
            if int(point.get("timestamp", 0)) > 0 and Decimal(str(point.get("price", 0))) > 0
        )
        if len(points) < 2:
            raise HistoricalRateError("historical GRAM/USD series has insufficient coverage")
        return points

    @staticmethod
    def _interpolated_rate(points: list[tuple[int, Decimal]],
                           event_time: datetime) -> Decimal:
        target = int(event_time.timestamp())
        timestamps = [point[0] for point in points]
        position = bisect_left(timestamps, target)
        if position < len(points) and points[position][0] == target:
            return points[position][1]
        if position == 0 or position >= len(points):
            raise HistoricalRateError(
                f"historical GRAM/USD does not bracket {event_time.isoformat()}"
            )
        before_time, before_rate = points[position - 1]
        after_time, after_rate = points[position]
        if target - before_time > 12 * 60 * 60 or after_time - target > 12 * 60 * 60:
            raise HistoricalRateError(
                f"historical GRAM/USD gap is too wide at {event_time.isoformat()}"
            )
        ratio = Decimal(target - before_time) / Decimal(after_time - before_time)
        return before_rate + ((after_rate - before_rate) * ratio)

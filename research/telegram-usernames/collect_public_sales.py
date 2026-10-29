#!/usr/bin/env python3
"""Collect public Telegram username sale summaries for clean-room research.

The collector only reads indexable public pages allowed by the site's robots file.
It intentionally avoids private or undocumented API routes.
"""

from __future__ import annotations

import argparse
import concurrent.futures
import csv
import html
import json
import random
import re
import threading
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path


SITEMAP_URL = "https://namesniper.pro/sitemap.xml"
USERNAME_PREFIX = "https://namesniper.pro/telegram/usernames/"
USER_AGENT = "TonTrackCleanRoomResearch/1.0 (+public-market-research)"
_rate_lock = threading.Lock()
_next_request_at = 0.0


def fetch(url: str, min_interval: float, attempts: int = 4) -> str:
    global _next_request_at
    for attempt in range(attempts):
        with _rate_lock:
            now = time.monotonic()
            wait = max(0.0, _next_request_at - now)
            _next_request_at = max(now, _next_request_at) + min_interval
        if wait:
            time.sleep(wait)
        request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=25) as response:
                return response.read().decode("utf-8", errors="replace")
        except (urllib.error.URLError, TimeoutError):
            if attempt + 1 == attempts:
                raise
            time.sleep((2**attempt) + random.random())
    raise RuntimeError("unreachable")


def page_text(raw_html: str) -> str:
    text = re.sub(r"<script[\s\S]*?</script>", " ", raw_html, flags=re.I)
    text = re.sub(r"<style[\s\S]*?</style>", " ", text, flags=re.I)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def number(value: str) -> float:
    return float(value.replace(",", ""))


def parse_page(url: str, min_interval: float) -> dict[str, object]:
    slug = url.rstrip("/").rsplit("/", 1)[-1]
    result: dict[str, object] = {
        "username": slug.lower(),
        "source_url": url,
        "source": "namesniper_public_page",
        "parse_ok": False,
    }
    try:
        text = page_text(fetch(url, min_interval))
        sale = re.search(
            r"Last sold\s+(.+?)\s+([\d,.]+)\s+TON\s+about\s+\$([\d,.]+)",
            text,
            flags=re.I,
        )
        history = re.search(
            r"has\s+(\d+)\s+recorded on-chain sale(?:s)? across\s+(\d+)\s+total auction events",
            text,
            flags=re.I,
        )
        details = re.search(
            r"Length:\s+(\d+)\s+characters\s+Type:\s+(.+?)\s+Market rank:\s+#([\d,]+)\s+of\s+([\d,]+)",
            text,
            flags=re.I,
        )
        if not sale:
            result["parse_error"] = "missing_last_sale"
            return result
        result.update(
            {
                "last_sale_date_label": sale.group(1).strip(),
                "last_sale_ton": number(sale.group(2)),
                "last_sale_usd_reported": number(sale.group(3)),
                "recorded_sales": int(history.group(1)) if history else None,
                "auction_events": int(history.group(2)) if history else None,
                "length": int(details.group(1)) if details else len(slug),
                "page_type": details.group(2).strip() if details else None,
                "market_rank": int(details.group(3).replace(",", "")) if details else None,
                "rank_population": int(details.group(4).replace(",", "")) if details else None,
                "parse_ok": True,
            }
        )
    except Exception as exc:  # Record failures so the sample remains auditable.
        result["parse_error"] = f"{type(exc).__name__}: {exc}"
    return result


def load_urls(min_interval: float) -> list[str]:
    root = ET.fromstring(fetch(SITEMAP_URL, min_interval))
    namespace = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}
    urls = [node.text or "" for node in root.findall("sm:url/sm:loc", namespace)]
    return [
        url
        for url in urls
        if url.startswith(USERNAME_PREFIX)
        and url.rsplit("/", 1)[-1] not in {"4-letter", "5-letter"}
    ]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--limit", type=int, default=0, help="0 collects all sitemap names")
    parser.add_argument("--workers", type=int, default=4)
    parser.add_argument("--interval", type=float, default=0.28)
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("data"))
    args = parser.parse_args()

    urls = load_urls(args.interval)
    if args.limit:
        urls = urls[: args.limit]
    results: list[dict[str, object]] = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as executor:
        futures = {executor.submit(parse_page, url, args.interval): url for url in urls}
        for index, future in enumerate(concurrent.futures.as_completed(futures), 1):
            results.append(future.result())
            if index % 100 == 0 or index == len(urls):
                parsed = sum(bool(row["parse_ok"]) for row in results)
                print(f"collected={index}/{len(urls)} parsed={parsed}", flush=True)

    results.sort(key=lambda row: str(row["username"]))
    args.output.mkdir(parents=True, exist_ok=True)
    json_path = args.output / "public_username_sales.json"
    csv_path = args.output / "public_username_sales.csv"
    json_path.write_text(json.dumps(results, indent=2), encoding="utf-8")
    fieldnames = sorted({key for row in results for key in row})
    with csv_path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(results)
    print(f"json={json_path}")
    print(f"csv={csv_path}")


if __name__ == "__main__":
    main()

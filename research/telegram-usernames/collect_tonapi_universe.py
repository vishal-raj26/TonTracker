#!/usr/bin/env python3
"""Collect the verified Telegram Usernames NFT universe from TonAPI.

This is intentionally isolated from application code. It is resumable and writes a
single canonical snapshot that can be joined to sale observations during research.
"""

from __future__ import annotations

import csv
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


COLLECTION = "0:80d78a35f955a14b679faa887ff4cd5bfc0f43b4a4eea2a7e6927f3701b273c2"
BASE_URL = f"https://tonapi.io/v2/nfts/collections/{COLLECTION}/items"
ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
CHECKPOINT = DATA_DIR / "tonapi_username_universe.checkpoint.json"
OUT_JSON = DATA_DIR / "tonapi_username_universe.json"
OUT_CSV = DATA_DIR / "tonapi_username_universe.csv"
PAGE_SIZE = 1000
REQUEST_DELAY_SECONDS = 0.7
CHECKPOINT_EVERY_PAGES = 20


def fetch_json(url: str, attempts: int = 6) -> dict:
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(
                url,
                headers={"Accept": "application/json", "User-Agent": "TonTrackCleanRoomResearch/1.0"},
            )
            with urllib.request.urlopen(req, timeout=45) as response:
                return json.load(response)
        except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as exc:
            if attempt == attempts - 1:
                raise
            wait = min(30, 2 ** attempt)
            print(f"request failed ({exc}); retrying in {wait}s", flush=True)
            time.sleep(wait)
    raise RuntimeError("unreachable")


def normalize_item(item: dict) -> dict:
    metadata = item.get("metadata") or {}
    sale = item.get("sale") or {}
    price = sale.get("price") or {}
    owner = item.get("owner") or {}
    collection = item.get("collection") or {}
    raw_name = str(metadata.get("name") or item.get("name") or item.get("dns") or "").strip()
    username = raw_name.removeprefix("@").removesuffix(".t.me").lower()
    value = price.get("value")
    decimals = price.get("decimals")
    amount = None
    if value is not None:
        try:
            amount = float(value) / (10 ** int(decimals or 0))
        except (TypeError, ValueError, OverflowError):
            amount = None
    return {
        "username": username,
        "nft_address": item.get("address"),
        "index": item.get("index"),
        "owner_address": owner.get("address"),
        "collection_address": collection.get("address"),
        "verified": bool(item.get("verified")),
        "trust": item.get("trust"),
        "dns": item.get("dns"),
        "on_sale": bool(sale),
        "ask_amount_native": amount,
        "ask_token": price.get("token_name"),
        "ask_contract": sale.get("address"),
        "metadata_image": metadata.get("image"),
    }


def save_checkpoint(rows: list[dict], offset: int) -> None:
    CHECKPOINT.write_text(
        json.dumps({"offset": offset, "rows": rows}, ensure_ascii=True), encoding="utf-8"
    )


def write_outputs(rows: list[dict]) -> None:
    OUT_JSON.write_text(json.dumps(rows, indent=2, ensure_ascii=True), encoding="utf-8")
    fields = list(rows[0].keys()) if rows else []
    with OUT_CSV.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    rows: list[dict] = []
    offset = 0
    if CHECKPOINT.exists():
        state = json.loads(CHECKPOINT.read_text(encoding="utf-8"))
        rows = state.get("rows") or []
        offset = int(state.get("offset") or 0)
        print(f"resuming offset={offset} rows={len(rows)}", flush=True)

    seen = {row["nft_address"] for row in rows}
    pages_since_checkpoint = 0
    while True:
        query = urllib.parse.urlencode({"limit": PAGE_SIZE, "offset": offset})
        payload = fetch_json(f"{BASE_URL}?{query}")
        items = payload.get("nft_items") or []
        if not items:
            break
        for item in items:
            row = normalize_item(item)
            if row["nft_address"] not in seen:
                rows.append(row)
                seen.add(row["nft_address"])
        offset += len(items)
        pages_since_checkpoint += 1
        if pages_since_checkpoint >= CHECKPOINT_EVERY_PAGES:
            save_checkpoint(rows, offset)
            pages_since_checkpoint = 0
        print(f"offset={offset} unique={len(rows)}", flush=True)
        if len(items) < PAGE_SIZE:
            break
        time.sleep(REQUEST_DELAY_SECONDS)

    save_checkpoint(rows, offset)
    rows.sort(key=lambda row: (row["username"], row["nft_address"] or ""))
    write_outputs(rows)
    CHECKPOINT.unlink(missing_ok=True)
    print(f"complete rows={len(rows)} json={OUT_JSON} csv={OUT_CSV}", flush=True)


if __name__ == "__main__":
    main()

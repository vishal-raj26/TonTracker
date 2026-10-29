#!/usr/bin/env python3
"""Collect the verified TON DNS domain NFT universe from TonAPI."""

from __future__ import annotations

import csv
import json
import time
import urllib.parse
from pathlib import Path

from collect_tonapi_universe import fetch_json, normalize_item


COLLECTION = "0:b774d95eb20543f186c06b371ab88ad704f7e256130caf96189368a7d0cb6ccf"
BASE_URL = f"https://tonapi.io/v2/nfts/collections/{COLLECTION}/items"
ROOT = Path(__file__).resolve().parent
DATA_DIR = ROOT / "data"
CHECKPOINT = DATA_DIR / "tonapi_dns_universe.checkpoint.json"
OUT_JSON = DATA_DIR / "tonapi_dns_universe.json"
OUT_CSV = DATA_DIR / "tonapi_dns_universe.csv"
PAGE_SIZE = 1_000
REQUEST_DELAY_SECONDS = 0.7
CHECKPOINT_EVERY_PAGES = 20


def save_checkpoint(rows: list[dict], offset: int) -> None:
    CHECKPOINT.write_text(
        json.dumps({"offset": offset, "rows": rows}, ensure_ascii=True), encoding="utf-8"
    )


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
            row["domain"] = row.pop("username").removesuffix(".ton")
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
    rows.sort(key=lambda row: (row["domain"], row["nft_address"] or ""))
    OUT_JSON.write_text(json.dumps(rows, indent=2, ensure_ascii=True), encoding="utf-8")
    fields = list(rows[0].keys()) if rows else []
    with OUT_CSV.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    CHECKPOINT.unlink(missing_ok=True)
    print(f"complete rows={len(rows)} json={OUT_JSON} csv={OUT_CSV}", flush=True)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Export canonical Telegram Username market data from Dune's TON NFT events.

The collector is deliberately separate from application code. It executes one SQL
query per dataset, then paginates the stored Dune result so large exports do not
re-run the expensive query for every page.
"""

from __future__ import annotations

import argparse
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


COLLECTION = "0:80d78a35f955a14b679faa887ff4cd5bfc0f43b4a4eea2a7e6927f3701b273c2"
DNS_COLLECTION = "0:b774d95eb20543f186c06b371ab88ad704f7e256130caf96189368a7d0cb6ccf"
DUNE_API = "https://api.dune.com/api/v1"
ROOT = Path(__file__).resolve().parent
REPO_ROOT = ROOT.parent.parent
DATA_DIR = ROOT / "data"
PAGE_SIZE = 10_000
PAGE_DELAY_SECONDS = 1.25

NATIVE_DAILY_CTE = """
native_daily AS (
  SELECT date(timestamp) AS day, max_by(price, timestamp) AS usd_rate
  FROM prices.day
  WHERE blockchain = 'ton'
    AND contract_address_varchar = '0x0000000000000000000000000000000000000000'
    AND symbol = 'TON'
    AND source = 'coinpaprika'
  GROUP BY 1
)
"""

QUERIES = {
    "sales": f"""
WITH {NATIVE_DAILY_CTE}
SELECT
  lower(e.nft_item_address) AS nft_item_address,
  e.timestamp AS sale_timestamp,
  from_unixtime(e.timestamp) AS sale_at_utc,
  CAST(e.sale_price AS double) / 1e9 AS price_native,
  p.usd_rate AS event_usd_rate,
  (CAST(e.sale_price AS double) / 1e9) * p.usd_rate AS price_usd,
  CASE WHEN e.prev_owner IS NULL THEN 'primary' ELSE 'secondary' END AS market_stage,
  e.sale_type,
  lower(e.marketplace_address) AS marketplace_address,
  lower(e.sale_contract) AS sale_contract,
  lower(e.prev_owner) AS seller_address,
  lower(e.owner_address) AS buyer_address,
  e.payment_asset,
  lower(e.tx_hash) AS tx_hash,
  lower(e.trace_id) AS trace_id
FROM ton.nft_events e
LEFT JOIN native_daily p
  ON p.day = date(from_unixtime(e.timestamp))
WHERE lower(e.collection_address) = lower('{COLLECTION}')
  AND e.type = 'sale'
  AND e.payment_asset = 'TON'
  AND e.sale_price > 0
ORDER BY e.timestamp, e.nft_item_address
""",
    "features": f"""
WITH {NATIVE_DAILY_CTE},
market_events AS (
  SELECT
    lower(e.nft_item_address) AS nft_item_address,
    e.type,
    e.timestamp,
    CAST(e.sale_price AS double) / 1e9 AS price_native,
    (CAST(e.sale_price AS double) / 1e9) * p.usd_rate AS price_usd,
    lower(e.prev_owner) AS actor_address,
    lower(e.marketplace_address) AS marketplace_address
  FROM ton.nft_events e
  LEFT JOIN native_daily p
    ON p.day = date(from_unixtime(e.timestamp))
  WHERE lower(e.collection_address) = lower('{COLLECTION}')
    AND e.type IN ('sale', 'bid')
    AND e.sale_price > 0
)
SELECT
  nft_item_address,
  count_if(type = 'sale') AS sale_count,
  count_if(type = 'sale' AND actor_address IS NOT NULL) AS secondary_sale_count,
  min(CASE WHEN type = 'sale' THEN timestamp END) AS first_sale_timestamp,
  max(CASE WHEN type = 'sale' THEN timestamp END) AS last_sale_timestamp,
  min_by(price_native, timestamp) FILTER (WHERE type = 'sale') AS first_sale_native,
  max_by(price_native, timestamp) FILTER (WHERE type = 'sale') AS last_sale_native,
  min_by(price_usd, timestamp) FILTER (WHERE type = 'sale') AS first_sale_usd,
  max_by(price_usd, timestamp) FILTER (WHERE type = 'sale') AS last_sale_usd,
  approx_percentile(price_usd, 0.25) FILTER (WHERE type = 'sale' AND price_usd IS NOT NULL) AS sale_usd_p25,
  approx_percentile(price_usd, 0.50) FILTER (WHERE type = 'sale' AND price_usd IS NOT NULL) AS sale_usd_median,
  approx_percentile(price_usd, 0.75) FILTER (WHERE type = 'sale' AND price_usd IS NOT NULL) AS sale_usd_p75,
  count_if(type = 'bid') AS bid_count,
  approx_distinct(actor_address) FILTER (WHERE type = 'bid') AS distinct_bidder_count,
  max(price_native) FILTER (WHERE type = 'bid') AS max_bid_native,
  max_by(price_native, timestamp) FILTER (WHERE type = 'bid') AS latest_bid_native,
  max(CASE WHEN type = 'bid' THEN timestamp END) AS latest_bid_timestamp,
  approx_distinct(marketplace_address) AS marketplace_count
FROM market_events
GROUP BY 1
ORDER BY nft_item_address
""",
    "monthly": f"""
WITH {NATIVE_DAILY_CTE}
SELECT
  date_trunc('month', from_unixtime(e.timestamp)) AS month,
  CASE WHEN e.prev_owner IS NULL THEN 'primary' ELSE 'secondary' END AS stage,
  count(*) AS sales,
  approx_distinct(lower(e.nft_item_address)) AS items,
  sum(CAST(e.sale_price AS double) / 1e9) AS volume_native,
  sum((CAST(e.sale_price AS double) / 1e9) * p.usd_rate) AS volume_usd,
  approx_percentile(CAST(e.sale_price AS double) / 1e9, ARRAY[0.10, 0.50, 0.90, 0.99]) AS native_quantiles,
  approx_percentile((CAST(e.sale_price AS double) / 1e9) * p.usd_rate, ARRAY[0.10, 0.50, 0.90, 0.99]) AS usd_quantiles
FROM ton.nft_events e
LEFT JOIN native_daily p ON p.day = date(from_unixtime(e.timestamp))
WHERE lower(e.collection_address) = lower('{COLLECTION}')
  AND e.type = 'sale'
  AND e.payment_asset = 'TON'
  AND e.sale_price > 0
GROUP BY 1, 2
ORDER BY 1, 2
""",
    "event_counts": f"""
SELECT
  CASE
    WHEN lower(collection_address) = lower('{COLLECTION}') THEN 'telegram_username'
    WHEN lower(collection_address) = lower('{DNS_COLLECTION}') THEN 'ton_dns'
  END AS asset_type,
  type AS event_type,
  count(*) AS events,
  approx_distinct(lower(nft_item_address)) AS items,
  min(from_unixtime(timestamp)) AS first_event_at,
  max(from_unixtime(timestamp)) AS last_event_at
FROM ton.nft_events
WHERE lower(collection_address) IN (lower('{COLLECTION}'), lower('{DNS_COLLECTION}'))
GROUP BY 1, 2
ORDER BY 1, 2
""",
    "marketplaces": f"""
WITH {NATIVE_DAILY_CTE}
SELECT
  lower(e.marketplace_address) AS marketplace_address,
  CASE WHEN e.prev_owner IS NULL THEN 'primary' ELSE 'secondary' END AS stage,
  count(*) AS sales,
  approx_distinct(lower(e.nft_item_address)) AS items,
  sum(CAST(e.sale_price AS double) / 1e9) AS volume_native,
  sum((CAST(e.sale_price AS double) / 1e9) * p.usd_rate) AS volume_usd
FROM ton.nft_events e
LEFT JOIN native_daily p ON p.day = date(from_unixtime(e.timestamp))
WHERE lower(e.collection_address) = lower('{COLLECTION}')
  AND e.type = 'sale'
  AND e.payment_asset = 'TON'
  AND e.sale_price > 0
GROUP BY 1, 2
ORDER BY sales DESC
""",
    "username_dns_pairs": f"""
WITH {NATIVE_DAILY_CTE},
username_names AS (
  SELECT DISTINCT
    lower(address) AS nft_item_address,
    lower(regexp_replace(name, '^@', '')) AS base_name
  FROM ton.nft_metadata
  WHERE lower(parent_address) = lower('{COLLECTION}')
    AND name IS NOT NULL
),
dns_names AS (
  SELECT DISTINCT
    lower(dns_nft_item_address) AS nft_item_address,
    lower(regexp_replace(domain, '\\.ton$', '')) AS base_name
  FROM dns_ton.domain_latest_info
  WHERE domain IS NOT NULL
),
secondary_sales AS (
  SELECT
    CASE
      WHEN lower(e.collection_address) = lower('{COLLECTION}') THEN 'telegram_username'
      ELSE 'ton_dns'
    END AS asset_type,
    lower(e.nft_item_address) AS nft_item_address,
    e.timestamp,
    (CAST(e.sale_price AS double) / 1e9) * p.usd_rate AS price_usd,
    row_number() OVER (
      PARTITION BY lower(e.collection_address), lower(e.nft_item_address)
      ORDER BY e.timestamp DESC, e.lt DESC
    ) AS recency_rank
  FROM ton.nft_events e
  LEFT JOIN native_daily p ON p.day = date(from_unixtime(e.timestamp))
  WHERE lower(e.collection_address) IN (lower('{COLLECTION}'), lower('{DNS_COLLECTION}'))
    AND e.type = 'sale'
    AND e.payment_asset = 'TON'
    AND e.sale_price > 0
    AND e.prev_owner IS NOT NULL
    AND lower(e.prev_owner) <> lower(e.owner_address)
    AND p.usd_rate IS NOT NULL
),
username_latest AS (
  SELECT n.base_name, s.timestamp, s.price_usd
  FROM secondary_sales s
  JOIN username_names n ON n.nft_item_address = s.nft_item_address
  WHERE s.asset_type = 'telegram_username' AND s.recency_rank = 1
),
dns_latest AS (
  SELECT n.base_name, s.timestamp, s.price_usd
  FROM secondary_sales s
  JOIN dns_names n ON n.nft_item_address = s.nft_item_address
  WHERE s.asset_type = 'ton_dns' AND s.recency_rank = 1
),
paired AS (
  SELECT
    base_name,
    u.price_usd AS username_usd,
    d.price_usd AS dns_usd,
    u.price_usd / nullif(d.price_usd, 0) AS username_to_dns_ratio,
    abs(u.timestamp - d.timestamp) / 86400.0 AS sale_gap_days,
    CASE
      WHEN regexp_like(base_name, '^[a-z]+$') AND length(base_name) <= 4 THEN 'letters_1_4'
      WHEN regexp_like(base_name, '^[a-z]+$') AND length(base_name) <= 6 THEN 'letters_5_6'
      WHEN regexp_like(base_name, '^[a-z]+$') AND length(base_name) <= 9 THEN 'letters_7_9'
      WHEN regexp_like(base_name, '^[a-z]+$') AND length(base_name) <= 12 THEN 'letters_10_12'
      WHEN regexp_like(base_name, '^[a-z]+$') THEN 'letters_13_plus'
      WHEN regexp_like(base_name, '^[a-z0-9_]+$') AND length(base_name) <= 6 THEN 'mixed_1_6'
      WHEN regexp_like(base_name, '^[a-z0-9_]+$') AND length(base_name) <= 9 THEN 'mixed_7_9'
      ELSE 'mixed_10_plus'
    END AS segment
  FROM username_latest u
  JOIN dns_latest d USING (base_name)
)
SELECT
  segment,
  count(*) AS matched_names,
  approx_percentile(username_usd, ARRAY[0.10, 0.25, 0.50, 0.75, 0.90]) AS username_usd_quantiles,
  approx_percentile(dns_usd, ARRAY[0.10, 0.25, 0.50, 0.75, 0.90]) AS dns_usd_quantiles,
  approx_percentile(username_to_dns_ratio, ARRAY[0.10, 0.25, 0.50, 0.75, 0.90]) AS ratio_quantiles,
  count_if(sale_gap_days <= 90) AS matched_within_90d,
  approx_percentile(username_to_dns_ratio, ARRAY[0.25, 0.50, 0.75])
    FILTER (WHERE sale_gap_days <= 90) AS ratio_quantiles_within_90d,
  count_if(sale_gap_days <= 180) AS matched_within_180d,
  approx_percentile(username_to_dns_ratio, ARRAY[0.25, 0.50, 0.75])
    FILTER (WHERE sale_gap_days <= 180) AS ratio_quantiles_within_180d,
  count_if(sale_gap_days <= 365) AS matched_within_365d,
  approx_percentile(username_to_dns_ratio, ARRAY[0.25, 0.50, 0.75])
    FILTER (WHERE sale_gap_days <= 365) AS ratio_quantiles_within_365d,
  approx_percentile(sale_gap_days, ARRAY[0.50, 0.90]) AS sale_gap_day_quantiles
FROM paired
GROUP BY GROUPING SETS ((segment), ())
ORDER BY segment NULLS FIRST
""",
}


def load_api_key() -> str:
    if os.environ.get("DUNE_API_KEY"):
        return os.environ["DUNE_API_KEY"].strip()
    env_file = REPO_ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            if line.startswith("DUNE_API_KEY="):
                return line.split("=", 1)[1].strip()
    raise RuntimeError("DUNE_API_KEY is not configured")


def request(url: str, api_key: str, *, method: str = "GET", body: dict | None = None):
    encoded = None if body is None else json.dumps(body).encode("utf-8")
    headers = {"x-dune-api-key": api_key, "accept": "application/json"}
    if encoded is not None:
        headers["content-type"] = "application/json"
    for attempt in range(8):
        req = urllib.request.Request(url, data=encoded, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=120) as response:
                return response.read(), response.headers.get_content_type()
        except urllib.error.HTTPError as exc:
            if exc.code not in {429, 500, 502, 503, 504} or attempt == 7:
                raise
            retry_after = exc.headers.get("Retry-After")
            wait = float(retry_after) if retry_after and retry_after.isdigit() else min(60, 2 ** attempt)
            print(f"request throttled status={exc.code}; retrying in {wait:.0f}s", flush=True)
            time.sleep(wait)
        except (urllib.error.URLError, TimeoutError):
            if attempt == 7:
                raise
            wait = min(60, 2 ** attempt)
            print(f"request failed; retrying in {wait}s", flush=True)
            time.sleep(wait)
    raise RuntimeError("request retries exhausted")


def execute(sql: str, api_key: str) -> str:
    raw, _ = request(f"{DUNE_API}/sql/execute", api_key, method="POST", body={"sql": sql})
    execution_id = json.loads(raw)["execution_id"]
    print(f"execution={execution_id}", flush=True)
    return execution_id


def wait_for_result(execution_id: str, api_key: str) -> dict:
    url = f"{DUNE_API}/execution/{execution_id}/results?limit=1"
    while True:
        try:
            raw, _ = request(url, api_key)
            payload = json.loads(raw)
            state = payload.get("state")
            print(f"state={state}", flush=True)
            if state == "QUERY_STATE_COMPLETED":
                return payload
            if state in {"QUERY_STATE_FAILED", "QUERY_STATE_CANCELLED", "QUERY_STATE_EXPIRED"}:
                raise RuntimeError(json.dumps(payload, indent=2))
        except urllib.error.HTTPError as exc:
            if exc.code not in {202, 404}:
                raise
        time.sleep(3)


def download_csv(dataset: str, execution_id: str, total_rows: int, api_key: str) -> Path:
    target = DATA_DIR / f"dune_username_{dataset}.csv"
    partial = target.with_suffix(".part")
    state_path = DATA_DIR / f"dune_username_{dataset}.state.json"
    offset = 0
    if state_path.exists() and partial.exists():
        state = json.loads(state_path.read_text(encoding="utf-8"))
        if state.get("execution_id") == execution_id:
            offset = int(state.get("offset") or 0)
    mode = "ab" if offset else "wb"
    with partial.open(mode) as handle:
        while offset < total_rows:
            query = urllib.parse.urlencode({"limit": PAGE_SIZE, "offset": offset})
            raw, _ = request(
                f"{DUNE_API}/execution/{execution_id}/results/csv?{query}", api_key
            )
            if offset:
                newline = raw.find(b"\n")
                raw = raw[newline + 1 :] if newline >= 0 else b""
            handle.write(raw)
            handle.flush()
            offset = min(total_rows, offset + PAGE_SIZE)
            state_path.write_text(
                json.dumps({"execution_id": execution_id, "offset": offset, "total_rows": total_rows}),
                encoding="utf-8",
            )
            print(f"{dataset}: {offset}/{total_rows}", flush=True)
            time.sleep(PAGE_DELAY_SECONDS)
    partial.replace(target)
    state_path.unlink(missing_ok=True)
    return target


def collect(dataset: str, api_key: str) -> None:
    state_path = DATA_DIR / f"dune_username_{dataset}.state.json"
    execution_id = ""
    if state_path.exists():
        execution_id = str(json.loads(state_path.read_text(encoding="utf-8")).get("execution_id") or "")
    if not execution_id:
        execution_id = execute(QUERIES[dataset], api_key)
        state_path.write_text(
            json.dumps({"execution_id": execution_id, "offset": 0}), encoding="utf-8"
        )
    result = wait_for_result(execution_id, api_key)
    metadata = (result.get("result") or {}).get("metadata") or {}
    total_rows = int(metadata.get("total_row_count") or metadata.get("row_count") or 0)
    target = download_csv(dataset, execution_id, total_rows, api_key)
    print(f"complete dataset={dataset} rows={total_rows} file={target}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("dataset", choices=[*QUERIES, "all"], default="all", nargs="?")
    args = parser.parse_args()
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    api_key = load_api_key()
    datasets = list(QUERIES) if args.dataset == "all" else [args.dataset]
    for dataset in datasets:
        collect(dataset, api_key)


if __name__ == "__main__":
    main()

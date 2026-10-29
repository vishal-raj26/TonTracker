#!/usr/bin/env python3
"""Summarize canonical exact-name Telegram Username / TON DNS sale pairs."""

from __future__ import annotations

import csv
import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "data" / "dune_username_username_dns_pairs.csv"
OUTPUT_JSON = ROOT / "data" / "username_dns_sales_analysis.json"
OUTPUT_MD = ROOT / "USERNAME_DNS_SALES_RESULTS.md"


def numbers(value: str) -> list[float]:
    return [float(item) for item in re.findall(r"-?\d+(?:\.\d+)?(?:e[+-]?\d+)?", value or "", re.I)]


def main() -> None:
    rows = list(csv.DictReader(SOURCE.open(encoding="utf-8", newline="")))
    normalized = []
    for row in rows:
        normalized.append(
            {
                "segment": "all" if row["segment"] == "<nil>" else row["segment"],
                "matched_names": int(row["matched_names"]),
                "username_usd_quantiles": numbers(row["username_usd_quantiles"]),
                "dns_usd_quantiles": numbers(row["dns_usd_quantiles"]),
                "ratio_quantiles": numbers(row["ratio_quantiles"]),
                "matched_within_90d": int(row["matched_within_90d"]),
                "ratio_quantiles_within_90d": numbers(row["ratio_quantiles_within_90d"]),
                "matched_within_180d": int(row["matched_within_180d"]),
                "ratio_quantiles_within_180d": numbers(row["ratio_quantiles_within_180d"]),
                "matched_within_365d": int(row["matched_within_365d"]),
                "ratio_quantiles_within_365d": numbers(row["ratio_quantiles_within_365d"]),
                "sale_gap_day_quantiles": numbers(row["sale_gap_day_quantiles"]),
            }
        )

    result = {
        "method": (
            "Latest arm's-length secondary TON sale per exact base string, converted with "
            "the historical USD rate on each sale date. Self-sales and primary auctions excluded."
        ),
        "warning": (
            "Latest sales are observations, not simultaneous appraisals. Windowed rows reduce but "
            "do not eliminate market-regime, selection, liquidity, and manipulation effects."
        ),
        "segments": normalized,
    }
    OUTPUT_JSON.write_text(json.dumps(result, indent=2), encoding="utf-8")

    lines = [
        "# Telegram Username / TON DNS Matched-Sale Results",
        "",
        result["method"],
        "",
        "> " + result["warning"],
        "",
        "| Segment | Pairs | Ratio p25 / p50 / p75 | <=180d pairs | <=180d p25 / p50 / p75 |",
        "|---|---:|---:|---:|---:|",
    ]
    for row in normalized:
        ratio = " / ".join(f"{value:.2f}x" for value in row["ratio_quantiles"][1:4])
        near = " / ".join(f"{value:.2f}x" for value in row["ratio_quantiles_within_180d"])
        lines.append(
            f"| {row['segment']} | {row['matched_names']:,} | {ratio} | "
            f"{row['matched_within_180d']:,} | {near or '-'} |"
        )
    lines.extend(
        [
            "",
            "The ratio is structurally heterogeneous and very wide even inside segments. It is a "
            "cross-market feature for a DNS model, not a conversion rule.",
        ]
    )
    OUTPUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"results={OUTPUT_JSON} report={OUTPUT_MD}")


if __name__ == "__main__":
    main()

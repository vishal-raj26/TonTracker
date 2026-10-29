#!/usr/bin/env python3
"""Compare verified Telegram Username and TON DNS inventories.

Current asks are analyzed only as seller-intent diagnostics. They are not sale labels
and must never be treated as fair value without an execution-probability model.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
RUNTIME = ROOT / ".runtime"
DATA_DIR = ROOT / "data"
sys.path.insert(0, str(RUNTIME))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402


USERNAME_CSV = DATA_DIR / "tonapi_username_universe.csv"
DNS_CSV = DATA_DIR / "tonapi_dns_universe.csv"
OUTPUT_JSON = DATA_DIR / "username_dns_inventory_analysis.json"
OUTPUT_MD = ROOT / "USERNAME_DNS_INVENTORY_RESULTS.md"


def load_inventory(path: Path, suffix: str, name_column: str) -> pd.DataFrame:
    frame = pd.read_csv(
        path,
        usecols=[name_column, "dns", "nft_address", "on_sale", "ask_amount_native", "ask_token"],
        low_memory=False,
    )
    explicit = frame[name_column].fillna("").astype(str).str.strip()
    dns_name = frame["dns"].fillna("").astype(str).str.strip()
    if suffix:
        dns_name = dns_name.str.replace(rf"\.{suffix}$", "", regex=True, case=False)
    name = explicit.where(explicit.ne(""), dns_name)
    if suffix == "t.me":
        name = name.str.replace(r"\.t\.me$", "", regex=True, case=False)
    frame["name"] = name.str.lower()
    frame["on_sale"] = frame["on_sale"].fillna(False).astype(bool)
    frame["ask_amount_native"] = pd.to_numeric(frame["ask_amount_native"], errors="coerce")
    frame["length"] = frame["name"].str.len()
    frame["all_letters"] = frame["name"].str.fullmatch(r"[a-z]+", na=False)
    frame["all_digits"] = frame["name"].str.fullmatch(r"\d+", na=False)
    frame["contains_digit"] = frame["name"].str.contains(r"\d", regex=True, na=False)
    frame["contains_underscore"] = frame["name"].str.contains("_", regex=False, na=False)
    return frame[frame["name"].ne("")].drop_duplicates("name", keep="last")


def q(series: pd.Series) -> dict:
    values = pd.to_numeric(series, errors="coerce")
    values = values[np.isfinite(values) & (values > 0)]
    if values.empty:
        return {"n": 0, "p25": None, "p50": None, "p75": None, "p90": None}
    return {
        "n": int(len(values)),
        "p25": float(values.quantile(0.25)),
        "p50": float(values.quantile(0.50)),
        "p75": float(values.quantile(0.75)),
        "p90": float(values.quantile(0.90)),
    }


def segment_name(row: pd.Series) -> str:
    length = int(row["length"])
    if row["all_digits"]:
        shape = "digits"
    elif row["all_letters"]:
        shape = "letters"
    elif row["contains_underscore"]:
        shape = "underscore"
    else:
        shape = "mixed"
    if length <= 4:
        bucket = "1-4"
    elif length <= 6:
        bucket = "5-6"
    elif length <= 9:
        bucket = "7-9"
    elif length <= 12:
        bucket = "10-12"
    else:
        bucket = "13+"
    return f"{shape}:{bucket}"


def main() -> None:
    usernames = load_inventory(USERNAME_CSV, "t.me", "username")
    domains = load_inventory(DNS_CSV, "ton", "domain")
    usernames["segment"] = usernames.apply(segment_name, axis=1)
    domains["segment"] = domains.apply(segment_name, axis=1)

    matched = usernames.merge(domains, on="name", suffixes=("_username", "_dns"), validate="one_to_one")
    both_asked = matched[
        matched["ask_amount_native_username"].gt(0)
        & matched["ask_amount_native_dns"].gt(0)
    ].copy()
    both_asked["username_to_dns_ask_ratio"] = (
        both_asked["ask_amount_native_username"] / both_asked["ask_amount_native_dns"]
    )
    both_asked["segment"] = both_asked["segment_username"]

    segment_rows = []
    for segment, group in matched.groupby("segment_username"):
        both = both_asked[both_asked["segment"].eq(segment)]
        segment_rows.append(
            {
                "segment": segment,
                "matched_names": int(len(group)),
                "username_listed_share": float(group["on_sale_username"].mean()),
                "dns_listed_share": float(group["on_sale_dns"].mean()),
                "both_with_positive_asks": int(len(both)),
                "username_to_dns_ask_ratio": q(both["username_to_dns_ask_ratio"]),
            }
        )

    result = {
        "username_unique_names": int(len(usernames)),
        "dns_unique_names": int(len(domains)),
        "exact_name_overlap": int(len(matched)),
        "username_overlap_share": float(len(matched) / max(1, len(usernames))),
        "dns_overlap_share": float(len(matched) / max(1, len(domains))),
        "username_listed_share": float(usernames["on_sale"].mean()),
        "dns_listed_share": float(domains["on_sale"].mean()),
        "both_with_positive_asks": int(len(both_asked)),
        "username_to_dns_ask_ratio": q(both_asked["username_to_dns_ask_ratio"]),
        "segments": sorted(segment_rows, key=lambda row: (-row["matched_names"], row["segment"])),
        "warning": "Asks are censored seller intent, not executed prices. Ratios are diagnostics only.",
    }
    OUTPUT_JSON.write_text(json.dumps(result, indent=2), encoding="utf-8")

    ratio = result["username_to_dns_ask_ratio"]
    lines = [
        "# Telegram Username / TON DNS Inventory Comparison",
        "",
        f"- Verified Telegram Username names: **{result['username_unique_names']:,}**.",
        f"- Verified TON DNS names: **{result['dns_unique_names']:,}**.",
        f"- Exact base-string overlap: **{result['exact_name_overlap']:,}** "
        f"({result['dns_overlap_share']:.1%} of DNS inventory).",
        f"- Listed share: usernames **{result['username_listed_share']:.1%}**, "
        f"DNS **{result['dns_listed_share']:.1%}**.",
        "",
        "> Current asks are seller intent, not transactions. The ratios below are useful for showing "
        "why a single cross-market multiplier is invalid, not for training a fair-value target.",
        "",
        f"Both sides have positive asks for **{result['both_with_positive_asks']:,}** exact matches. "
        f"Their username/DNS ask-ratio median is **{ratio['p50']:,.2f}x**, with "
        f"a 25th-75th percentile span of **{ratio['p25']:,.2f}x-{ratio['p75']:,.2f}x**.",
        "",
        "## By structural segment",
        "",
        "| Segment | Exact matches | Username listed | DNS listed | Both asks | Median ask ratio |",
        "|---|---:|---:|---:|---:|---:|",
    ]
    for row in result["segments"]:
        rq = row["username_to_dns_ask_ratio"]
        median = "-" if rq["p50"] is None else f"{rq['p50']:,.2f}x"
        lines.append(
            f"| {row['segment']} | {row['matched_names']:,} | "
            f"{row['username_listed_share']:.1%} | {row['dns_listed_share']:.1%} | "
            f"{row['both_with_positive_asks']:,} | {median} |"
        )
    OUTPUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {OUTPUT_JSON}")
    print(f"wrote {OUTPUT_MD}")


if __name__ == "__main__":
    main()

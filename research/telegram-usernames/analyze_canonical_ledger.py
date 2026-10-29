#!/usr/bin/env python3
"""Analyze the canonical Telegram Username inventory and sale ledger.

This is a clean-room research harness, not application runtime code. It deliberately
keeps asks, bids, primary auctions, secondary sales, and transfers conceptually
separate. The Dune export may be partial when an account export quota is reached;
the generated report always states the covered interval and row count.
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent
RUNTIME = ROOT / ".runtime"
DATA_DIR = ROOT / "data"
sys.path.insert(0, str(RUNTIME))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402


UNIVERSE_CSV = DATA_DIR / "tonapi_username_universe.csv"
SALES_PART = DATA_DIR / "dune_username_sales.part"
OUTPUT_JSON = DATA_DIR / "canonical_ledger_analysis.json"
OUTPUT_MD = ROOT / "CANONICAL_LEDGER_RESULTS.md"


def factor_metrics(actual: pd.Series, predicted: pd.Series) -> dict[str, float | int]:
    valid = (
        actual.notna()
        & predicted.notna()
        & np.isfinite(actual)
        & np.isfinite(predicted)
        & (actual > 0)
        & (predicted > 0)
    )
    actual = actual[valid].astype(float)
    predicted = predicted[valid].astype(float)
    if actual.empty:
        return {"n": 0}
    factors = np.exp(np.abs(np.log(predicted) - np.log(actual)))
    return {
        "n": int(len(factors)),
        "median_factor": float(np.median(factors)),
        "p90_factor": float(np.quantile(factors, 0.90)),
        "within_2x": float(np.mean(factors <= 2)),
        "within_5x": float(np.mean(factors <= 5)),
        "within_10x": float(np.mean(factors <= 10)),
    }


def quantiles(series: pd.Series) -> dict[str, float | int | None]:
    values = pd.to_numeric(series, errors="coerce")
    values = values[np.isfinite(values) & (values > 0)]
    if values.empty:
        return {"n": 0, "p10": None, "p25": None, "p50": None, "p75": None, "p90": None, "p99": None}
    return {
        "n": int(len(values)),
        "p10": float(values.quantile(0.10)),
        "p25": float(values.quantile(0.25)),
        "p50": float(values.quantile(0.50)),
        "p75": float(values.quantile(0.75)),
        "p90": float(values.quantile(0.90)),
        "p99": float(values.quantile(0.99)),
    }


def load_universe() -> pd.DataFrame:
    columns = [
        "username",
        "nft_address",
        "owner_address",
        "dns",
        "on_sale",
        "ask_amount_native",
        "ask_token",
    ]
    frame = pd.read_csv(UNIVERSE_CSV, usecols=columns, low_memory=False)
    explicit = frame["username"].fillna("").astype(str).str.strip()
    dns_name = (
        frame["dns"]
        .fillna("")
        .astype(str)
        .str.strip()
        .str.replace(r"\.t\.me$", "", regex=True, case=False)
    )
    frame["name"] = explicit.where(explicit.ne(""), dns_name).str.lower()
    frame["nft_address"] = frame["nft_address"].fillna("").astype(str).str.lower()
    frame["owner_address"] = frame["owner_address"].fillna("").astype(str).str.lower()
    frame["on_sale"] = frame["on_sale"].fillna(False).astype(bool)
    frame["ask_amount_native"] = pd.to_numeric(frame["ask_amount_native"], errors="coerce")
    frame["length"] = frame["name"].str.len()
    frame["digit_count"] = frame["name"].str.count(r"\d")
    frame["letter_count"] = frame["name"].str.count(r"[a-z]")
    frame["underscore_count"] = frame["name"].str.count("_")
    frame["all_letters"] = frame["name"].str.fullmatch(r"[a-z]+", na=False)
    frame["all_digits"] = frame["name"].str.fullmatch(r"\d+", na=False)
    return frame.drop_duplicates("nft_address", keep="last")


def load_sales() -> pd.DataFrame:
    columns = [
        "nft_item_address",
        "sale_timestamp",
        "price_native",
        "event_usd_rate",
        "price_usd",
        "market_stage",
        "sale_type",
        "marketplace_address",
        "seller_address",
        "buyer_address",
        "tx_hash",
        "trace_id",
    ]
    frame = pd.read_csv(SALES_PART, usecols=columns, low_memory=False)
    for column in ("price_native", "event_usd_rate", "price_usd", "sale_timestamp"):
        frame[column] = pd.to_numeric(frame[column], errors="coerce")
    for column in ("nft_item_address", "seller_address", "buyer_address", "marketplace_address"):
        frame[column] = frame[column].fillna("").astype(str).str.lower().replace("<nil>", "")
    frame["sale_at"] = pd.to_datetime(frame["sale_timestamp"], unit="s", utc=True, errors="coerce")
    frame = frame[
        frame["sale_at"].notna()
        & frame["price_native"].gt(0)
        & frame["price_usd"].gt(0)
    ].copy()
    dedupe_key = frame["tx_hash"].fillna("").astype(str) + ":" + frame["trace_id"].fillna("").astype(str)
    fallback_key = (
        frame["nft_item_address"]
        + ":"
        + frame["sale_timestamp"].astype(str)
        + ":"
        + frame["price_native"].astype(str)
        + ":"
        + frame["buyer_address"]
    )
    frame["event_key"] = dedupe_key.where(~dedupe_key.isin({":", "<nil>:<nil>"}), fallback_key)
    return frame.drop_duplicates("event_key", keep="last").sort_values("sale_at").reset_index(drop=True)


def trailing_market_index(sales: pd.DataFrame) -> pd.Series:
    daily = sales.set_index("sale_at")["price_usd"].resample("1D").median()
    trailing = daily.shift(1).rolling("30D", min_periods=7).median().ffill()
    lookup = trailing.reindex(sales["sale_at"].dt.floor("D"), method="ffill")
    return pd.Series(lookup.to_numpy(), index=sales.index, dtype=float)


def structural_segment(frame: pd.DataFrame) -> pd.Series:
    length = pd.to_numeric(frame["length"], errors="coerce")
    shape = np.select(
        [
            frame["all_digits"].fillna(False),
            frame["all_letters"].fillna(False),
            frame["underscore_count"].fillna(0).gt(0),
        ],
        ["digits", "letters", "underscore"],
        default="mixed",
    )
    bucket = np.select(
        [length.le(4), length.le(6), length.le(9), length.le(12)],
        ["1-4", "5-6", "7-9", "10-12"],
        default="13+",
    )
    return pd.Series(shape, index=frame.index) + ":" + pd.Series(bucket, index=frame.index)


def repeat_sale_backtest(sales: pd.DataFrame) -> dict:
    ordered = sales.sort_values(["nft_item_address", "sale_at"]).copy()
    group = ordered.groupby("nft_item_address", sort=False)
    ordered["previous_price_usd"] = group["price_usd"].shift(1)
    ordered["previous_sale_at"] = group["sale_at"].shift(1)
    ordered["previous_buyer"] = group["buyer_address"].shift(1)
    ordered["previous_seller"] = group["seller_address"].shift(1)
    ordered["days_since_previous"] = (
        ordered["sale_at"] - ordered["previous_sale_at"]
    ).dt.total_seconds() / 86400
    ordered["self_sale"] = (
        ordered["seller_address"].ne("")
        & ordered["seller_address"].eq(ordered["buyer_address"])
    )
    ordered["rapid_round_trip"] = (
        ordered["buyer_address"].ne("")
        & ordered["buyer_address"].eq(ordered["previous_seller"])
        & ordered["days_since_previous"].between(0, 30, inclusive="both")
    )
    pair_key = ordered["seller_address"] + ">" + ordered["buyer_address"]
    ordered["pair_frequency"] = pair_key.map(pair_key.value_counts())

    repeats = ordered[
        ordered["previous_price_usd"].gt(0)
        & ~ordered["self_sale"]
        & ~ordered["rapid_round_trip"]
        & ordered["pair_frequency"].le(10)
    ].copy()
    if repeats.empty:
        return {"rows": 0}

    sales_with_index = sales.copy()
    sales_with_index["market_index"] = trailing_market_index(sales_with_index)
    current_index = sales_with_index.set_index("event_key")["market_index"]
    repeats["current_market_index"] = repeats["event_key"].map(current_index)
    previous_index_lookup = sales_with_index.set_index(
        ["nft_item_address", "sale_at"]
    )["market_index"]
    repeats["previous_market_index"] = [
        previous_index_lookup.get((address, timestamp), np.nan)
        for address, timestamp in zip(repeats["nft_item_address"], repeats["previous_sale_at"])
    ]
    ratio = repeats["current_market_index"] / repeats["previous_market_index"]
    ratio = ratio.clip(lower=0.25, upper=4.0)
    repeats["regime_adjusted_previous"] = repeats["previous_price_usd"] * ratio

    cutoff = repeats["sale_at"].quantile(0.80)
    test = repeats[repeats["sale_at"].ge(cutoff)]
    return {
        "rows": int(len(repeats)),
        "test_start": cutoff.isoformat(),
        "test_rows": int(len(test)),
        "days_between_sales": quantiles(repeats["days_since_previous"]),
        "unchanged_last_sale": factor_metrics(test["price_usd"], test["previous_price_usd"]),
        "trailing_market_adjusted_last_sale": factor_metrics(
            test["price_usd"], test["regime_adjusted_previous"]
        ),
    }


def main() -> None:
    universe = load_universe()
    sales = load_sales()
    sales = sales.merge(
        universe[["nft_address", "name", "length", "all_letters", "all_digits", "digit_count", "underscore_count"]],
        left_on="nft_item_address",
        right_on="nft_address",
        how="left",
        validate="many_to_one",
    )
    sales["structural_segment"] = structural_segment(sales)

    item_sale_counts = sales.groupby("nft_item_address").size()
    seller_counts = sales.loc[sales["seller_address"].ne(""), "seller_address"].value_counts()
    buyer_counts = sales.loc[sales["buyer_address"].ne(""), "buyer_address"].value_counts()
    sold_items = set(item_sale_counts.index)
    universe["observed_sale_in_partial_ledger"] = universe["nft_address"].isin(sold_items)

    by_length = []
    for length, segment in universe[universe["length"].between(1, 20)].groupby("length"):
        by_length.append(
            {
                "length": int(length),
                "inventory": int(len(segment)),
                "on_sale": int(segment["on_sale"].sum()),
                "observed_sold_items": int(segment["observed_sale_in_partial_ledger"].sum()),
                "observed_sale_share": float(segment["observed_sale_in_partial_ledger"].mean()),
            }
        )

    stage_summary = {}
    for stage, segment in sales.groupby("market_stage", dropna=False):
        stage_summary[str(stage)] = {
            "sales": int(len(segment)),
            "items": int(segment["nft_item_address"].nunique()),
            "price_native": quantiles(segment["price_native"]),
            "price_usd": quantiles(segment["price_usd"]),
            "volume_usd": float(segment["price_usd"].sum()),
        }

    structural_sales = []
    named_sales = sales[sales["name"].notna() & sales["name"].ne("")]
    for (stage, segment_name), segment in named_sales.groupby(["market_stage", "structural_segment"]):
        if len(segment) < 25:
            continue
        structural_sales.append(
            {
                "stage": str(stage),
                "segment": str(segment_name),
                "sales": int(len(segment)),
                "items": int(segment["nft_item_address"].nunique()),
                "price_usd": quantiles(segment["price_usd"]),
            }
        )

    same_party = (
        sales["seller_address"].ne("")
        & sales["seller_address"].eq(sales["buyer_address"])
    )
    pair_key = sales["seller_address"] + ">" + sales["buyer_address"]
    pair_counts = pair_key[(sales["seller_address"].ne("")) & (sales["buyer_address"].ne(""))].value_counts()

    result = {
        "coverage": {
            "inventory_items": int(len(universe)),
            "inventory_named": int(universe["name"].ne("").sum()),
            "sale_rows": int(len(sales)),
            "sale_items": int(sales["nft_item_address"].nunique()),
            "sale_start": sales["sale_at"].min().isoformat(),
            "sale_end": sales["sale_at"].max().isoformat(),
            "note": "The canonical sale export is partial because the Dune result-download quota stopped pagination.",
        },
        "inventory": {
            "on_sale_items": int(universe["on_sale"].sum()),
            "on_sale_share": float(universe["on_sale"].mean()),
            "owner_addresses_present": int(universe["owner_address"].ne("").sum()),
            "unique_owner_addresses_present": int(universe.loc[universe["owner_address"].ne(""), "owner_address"].nunique()),
            "ask_native": quantiles(universe["ask_amount_native"]),
            "length": quantiles(universe["length"]),
            "all_letters_share": float(universe["all_letters"].mean()),
            "all_digits_share": float(universe["all_digits"].mean()),
            "contains_digits_share": float(universe["digit_count"].gt(0).mean()),
            "contains_underscore_share": float(universe["underscore_count"].gt(0).mean()),
            "by_length": by_length,
        },
        "sales": {
            "by_stage": stage_summary,
            "by_structural_segment": sorted(
                structural_sales, key=lambda row: (row["stage"], -row["sales"], row["segment"])
            ),
            "repeat_sale_items": int((item_sale_counts > 1).sum()),
            "items_with_3_plus_sales": int((item_sale_counts >= 3).sum()),
            "self_sale_rows": int(same_party.sum()),
            "seller_top_10_share": float(seller_counts.head(10).sum() / max(1, seller_counts.sum())),
            "buyer_top_10_share": float(buyer_counts.head(10).sum() / max(1, buyer_counts.sum())),
            "buyer_seller_pairs_over_10_sales": int((pair_counts > 10).sum()),
            "by_year": [
                {
                    "year": int(year),
                    "sales": int(len(segment)),
                    "items": int(segment["nft_item_address"].nunique()),
                    "volume_usd": float(segment["price_usd"].sum()),
                    "price_usd": quantiles(segment["price_usd"]),
                }
                for year, segment in sales.groupby(sales["sale_at"].dt.year)
            ],
        },
        "repeat_sale_backtest": repeat_sale_backtest(sales),
    }

    OUTPUT_JSON.write_text(json.dumps(result, indent=2), encoding="utf-8")
    repeat = result["repeat_sale_backtest"]
    lines = [
        "# Canonical Telegram Username Ledger Results",
        "",
        f"Inventory: **{result['coverage']['inventory_items']:,}** verified items.",
        f"Analyzed sale rows: **{result['coverage']['sale_rows']:,}** from "
        f"{result['coverage']['sale_start'][:10]} through {result['coverage']['sale_end'][:10]}.",
        "",
        "> The row-level sale export is partial because the Dune account hit its result-download quota. "
        "All numbers below are explicitly limited to the covered interval; they are not represented as full-market totals.",
        "",
        "## Inventory",
        "",
        f"- Currently listed: **{result['inventory']['on_sale_items']:,}** "
        f"({result['inventory']['on_sale_share']:.1%}).",
        f"- All-letter names: **{result['inventory']['all_letters_share']:.1%}**.",
        f"- Names containing digits: **{result['inventory']['contains_digits_share']:.1%}**.",
        f"- Names containing underscores: **{result['inventory']['contains_underscore_share']:.1%}**.",
        "",
        "## Sale structure",
        "",
    ]
    for stage, values in result["sales"]["by_stage"].items():
        lines.append(
            f"- **{stage}**: {values['sales']:,} rows, {values['items']:,} items, "
            f"median ${values['price_usd']['p50']:,.2f}."
        )
    lines.extend(
        [
            f"- Repeat-sale items: **{result['sales']['repeat_sale_items']:,}**.",
            f"- Self-sale rows: **{result['sales']['self_sale_rows']:,}**.",
            f"- Buyer/seller pairs with over 10 sales: **{result['sales']['buyer_seller_pairs_over_10_sales']:,}**.",
            "",
            "## Repeat-sale backtest",
            "",
        ]
    )
    if repeat.get("rows"):
        plain = repeat["unchanged_last_sale"]
        adjusted = repeat["trailing_market_adjusted_last_sale"]
        lines.extend(
            [
                f"Out-of-time test rows: **{repeat['test_rows']:,}**, starting {repeat['test_start'][:10]}.",
                "",
                "| Baseline | Median error factor | Within 2x | Within 5x |",
                "|---|---:|---:|---:|",
                f"| Unchanged prior sale | {plain['median_factor']:.2f}x | {plain['within_2x']:.1%} | {plain['within_5x']:.1%} |",
                f"| Prior sale + trailing market regime | {adjusted['median_factor']:.2f}x | {adjusted['within_2x']:.1%} | {adjusted['within_5x']:.1%} |",
                "",
                "A prior sale is useful evidence, but it is neither a current floor nor a complete valuation. "
                "The production model must decay it, adjust for market regime, and combine it with current bids, listings, comparables, and name quality.",
            ]
        )
    OUTPUT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {OUTPUT_JSON}")
    print(f"wrote {OUTPUT_MD}")


if __name__ == "__main__":
    main()

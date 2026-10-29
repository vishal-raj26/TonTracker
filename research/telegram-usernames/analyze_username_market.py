#!/usr/bin/env python3
"""Clean-room Telegram Username market experiments.

The script deliberately keeps source-derived ranking and post-sale auction counters out
of predictive features because they can leak the target. It evaluates only information
that can be computed for a previously unseen username plus the sale's market date.
"""

from __future__ import annotations

import csv
import json
import math
import re
import statistics
import sys
import time
import urllib.parse
import urllib.request
from collections import Counter, defaultdict
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parent
RUNTIME = ROOT / ".runtime"
sys.path.insert(0, str(RUNTIME))

import numpy as np  # noqa: E402
import pandas as pd  # noqa: E402
import wordninja  # noqa: E402
from sklearn.compose import ColumnTransformer  # noqa: E402
from sklearn.ensemble import ExtraTreesRegressor  # noqa: E402
from sklearn.feature_extraction.text import TfidfVectorizer  # noqa: E402
from sklearn.linear_model import Ridge  # noqa: E402
from sklearn.metrics.pairwise import cosine_similarity  # noqa: E402
from sklearn.pipeline import Pipeline  # noqa: E402
from sklearn.preprocessing import OneHotEncoder, StandardScaler  # noqa: E402
from wordfreq import zipf_frequency  # noqa: E402


DATA_DIR = ROOT / "data"
SALES_CSV = DATA_DIR / "public_username_sales.csv"
RATE_CACHE = DATA_DIR / "event_usd_rates.json"
RESULT_JSON = DATA_DIR / "username_experiment_results.json"
RESULT_MD = ROOT / "EXPERIMENT_RESULTS.md"
DEFI_LLAMA_COIN = "coingecko:the-open-network"
LANGUAGES = ("en", "ru", "tr", "es", "de", "fr", "pt", "id", "ar", "hi")


def fetch_json(url: str, attempts: int = 5) -> dict:
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(
                url,
                headers={"Accept": "application/json", "User-Agent": "TonTrackCleanRoomResearch/1.0"},
            )
            with urllib.request.urlopen(req, timeout=40) as response:
                return json.load(response)
        except Exception:
            if attempt == attempts - 1:
                raise
            time.sleep(min(12, 2 ** attempt))
    raise RuntimeError("unreachable")


def event_rate(date_label: str, cache: dict[str, dict]) -> dict:
    if date_label in cache:
        return cache[date_label]
    day = datetime.strptime(date_label, "%b %d, %Y").replace(
        hour=12, tzinfo=timezone.utc
    )
    timestamp = int(day.timestamp())
    url = (
        f"https://coins.llama.fi/prices/historical/{timestamp}/"
        f"{urllib.parse.quote(DEFI_LLAMA_COIN, safe=':')}?searchWidth=18h"
    )
    payload = fetch_json(url)
    point = (payload.get("coins") or {}).get(DEFI_LLAMA_COIN) or {}
    if not point.get("price"):
        raise RuntimeError(f"no historical rate for {date_label}")
    cache[date_label] = {
        "usd": float(point["price"]),
        "timestamp": int(point.get("timestamp") or timestamp),
        "confidence": point.get("confidence"),
        "source": "DefiLlama historical prices",
        "asset": DEFI_LLAMA_COIN,
    }
    RATE_CACHE.write_text(json.dumps(cache, indent=2, sort_keys=True), encoding="utf-8")
    time.sleep(0.12)
    return cache[date_label]


def max_run(value: str) -> int:
    if not value:
        return 0
    return max(len(match.group(0)) for match in re.finditer(r"(.)\1*", value))


def sequence_score(value: str) -> int:
    compact = value.replace("_", "")
    if len(compact) < 3:
        return 0
    codes = [ord(char) for char in compact]
    deltas = [b - a for a, b in zip(codes, codes[1:])]
    return int(all(delta == 1 for delta in deltas) or all(delta == -1 for delta in deltas))


def lexical_features(username: str) -> dict:
    name = username.lower().strip().removeprefix("@")
    pieces = [piece for piece in wordninja.split(name.replace("_", "")) if piece]
    if not pieces:
        pieces = [name]
    language_scores = {lang: zipf_frequency(name.replace("_", ""), lang) for lang in LANGUAGES}
    best_language, best_zipf = max(language_scores.items(), key=lambda pair: pair[1])
    segment_zipfs = [max(zipf_frequency(piece, lang) for lang in LANGUAGES) for piece in pieces]
    alpha_count = sum(char.isalpha() for char in name)
    digit_count = sum(char.isdigit() for char in name)
    underscore_count = name.count("_")
    length = len(name)
    if name.isdigit():
        charset = "numeric"
    elif name.isalpha():
        charset = "alpha"
    elif underscore_count:
        charset = "underscore"
    else:
        charset = "alphanumeric"
    if length <= 4:
        length_bucket = "le4"
    elif length == 5:
        length_bucket = "5"
    elif length == 6:
        length_bucket = "6"
    elif length <= 8:
        length_bucket = "7_8"
    elif length <= 12:
        length_bucket = "9_12"
    else:
        length_bucket = "ge13"
    if best_zipf >= 4.0:
        lexical_class = "common_word"
    elif len(pieces) <= 3 and min(segment_zipfs, default=0) >= 3.6:
        lexical_class = "segmented_words"
    else:
        lexical_class = "opaque"
    return {
        "username": name,
        "length": length,
        "alpha_count": alpha_count,
        "digit_count": digit_count,
        "underscore_count": underscore_count,
        "digit_share": digit_count / max(1, length),
        "underscore_share": underscore_count / max(1, length),
        "unique_share": len(set(name)) / max(1, length),
        "max_run": max_run(name),
        "palindrome": int(len(name) >= 3 and name == name[::-1]),
        "sequence": sequence_score(name),
        "starts_digit": int(bool(name) and name[0].isdigit()),
        "ends_digit": int(bool(name) and name[-1].isdigit()),
        "all_same": int(len(set(name)) == 1),
        "vowel_share": sum(char in "aeiou" for char in name) / max(1, alpha_count),
        "segment_count": len(pieces),
        "segment_min_zipf": min(segment_zipfs, default=0),
        "segment_mean_zipf": statistics.fmean(segment_zipfs) if segment_zipfs else 0,
        "full_max_zipf": best_zipf,
        "best_language": best_language,
        "charset": charset,
        "length_bucket": length_bucket,
        "lexical_class": lexical_class,
    }


def metrics(actual_log: np.ndarray, predicted_log: np.ndarray) -> dict:
    error = np.abs(actual_log - predicted_log)
    ratio = np.exp(error)
    return {
        "n": int(len(error)),
        "median_abs_log_error": float(np.median(error)),
        "mean_abs_log_error": float(np.mean(error)),
        "median_error_factor": float(np.median(ratio)),
        "within_2x": float(np.mean(ratio <= 2)),
        "within_5x": float(np.mean(ratio <= 5)),
        "within_10x": float(np.mean(ratio <= 10)),
    }


def grouped_median_predict(
    train: pd.DataFrame, test: pd.DataFrame, max_age_days: int | None = None
) -> np.ndarray:
    levels = [
        ["length_bucket", "charset", "lexical_class"],
        ["length_bucket", "charset"],
        ["length_bucket"],
    ]
    global_median = float(train["log_usd"].median())
    predictions = []
    for _, row in test.iterrows():
        candidates = train
        if max_age_days is not None:
            cutoff = row["sale_date"] - pd.Timedelta(days=max_age_days)
            recent = train[train["sale_date"] >= cutoff]
            if len(recent) >= 40:
                candidates = recent
        candidate_median = float(candidates["log_usd"].median())
        prediction = None
        for columns in levels:
            mask = np.ones(len(candidates), dtype=bool)
            for column in columns:
                mask &= candidates[column].to_numpy() == row[column]
            values = candidates.loc[mask, "log_usd"]
            if len(values) >= 8:
                prediction = float(values.median())
                break
        predictions.append(candidate_median if prediction is None else prediction)
    return np.array(predictions)


def comparable_predict(
    train: pd.DataFrame, test: pd.DataFrame, neighbors: int = 15, max_age_days: int = 365
) -> np.ndarray:
    vectorizer = TfidfVectorizer(analyzer="char", ngram_range=(2, 5), min_df=1, sublinear_tf=True)
    train_matrix = vectorizer.fit_transform(train["username"])
    test_matrix = vectorizer.transform(test["username"])
    similarities = cosine_similarity(test_matrix, train_matrix, dense_output=True)
    train_logs = train["log_usd"].to_numpy()
    predictions = []
    for row_number, scores in enumerate(similarities):
        row = test.iloc[row_number]
        eligible = (
            (train["sale_date"] >= row["sale_date"] - pd.Timedelta(days=max_age_days))
            & (train["charset"] == row["charset"])
            & (np.abs(train["length"].to_numpy() - row["length"]) <= 3)
        ).to_numpy()
        candidate_idx = np.flatnonzero(eligible)
        if len(candidate_idx) < 8:
            candidate_idx = np.flatnonzero(
                (train["charset"] == row["charset"]).to_numpy()
                & (np.abs(train["length"].to_numpy() - row["length"]) <= 3)
            )
        if len(candidate_idx) < 8:
            candidate_idx = np.arange(len(train))
        count = min(neighbors, len(candidate_idx))
        local_scores = scores[candidate_idx]
        idx = candidate_idx[np.argpartition(local_scores, -count)[-count:]]
        selected_scores = np.maximum(scores[idx], 0.03)
        selected_logs = train_logs[idx]
        order = np.argsort(selected_logs)
        selected_logs = selected_logs[order]
        selected_scores = selected_scores[order]
        cutoff = selected_scores.sum() / 2
        predictions.append(float(selected_logs[np.searchsorted(np.cumsum(selected_scores), cutoff)]))
    return np.array(predictions)


def make_numeric_model(numeric: list[str], categorical: list[str]) -> Pipeline:
    preprocessor = ColumnTransformer(
        [
            ("num", StandardScaler(), numeric),
            ("cat", OneHotEncoder(handle_unknown="ignore"), categorical),
        ]
    )
    return Pipeline(
        [
            ("features", preprocessor),
            ("regressor", Ridge(alpha=8.0)),
        ]
    )


def make_char_model() -> Pipeline:
    return Pipeline(
        [
            (
                "tfidf",
                TfidfVectorizer(
                    analyzer="char", ngram_range=(2, 5), min_df=2, max_features=18000, sublinear_tf=True
                ),
            ),
            ("regressor", Ridge(alpha=12.0)),
        ]
    )


def make_tree_model(numeric: list[str], categorical: list[str]) -> Pipeline:
    preprocessor = ColumnTransformer(
        [
            ("num", StandardScaler(), numeric),
            ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), categorical),
        ],
        sparse_threshold=0,
    )
    return Pipeline(
        [
            ("features", preprocessor),
            (
                "regressor",
                ExtraTreesRegressor(
                    n_estimators=350,
                    min_samples_leaf=6,
                    max_features=0.85,
                    random_state=42,
                    n_jobs=-1,
                ),
            ),
        ]
    )


def recency_weights(train: pd.DataFrame, reference_date: pd.Timestamp) -> np.ndarray:
    age_days = (reference_date - train["sale_date"]).dt.days.clip(lower=0).to_numpy()
    return np.exp(-age_days / 365.0) + 0.08


def evaluate_fold(train: pd.DataFrame, test: pd.DataFrame) -> dict:
    numeric = [
        "length",
        "alpha_count",
        "digit_count",
        "underscore_count",
        "digit_share",
        "underscore_share",
        "unique_share",
        "max_run",
        "palindrome",
        "sequence",
        "starts_digit",
        "ends_digit",
        "all_same",
        "vowel_share",
        "segment_count",
        "segment_min_zipf",
        "segment_mean_zipf",
        "full_max_zipf",
        "market_day",
    ]
    categorical = ["charset", "length_bucket", "lexical_class", "best_language"]
    actual = test["log_usd"].to_numpy()
    global_prediction = np.repeat(float(train["log_usd"].median()), len(test))
    segment_prediction = grouped_median_predict(train, test)
    recent_segment_prediction = grouped_median_predict(train, test, max_age_days=180)
    comparable_prediction = comparable_predict(train, test)
    weights = recency_weights(train, test["sale_date"].min())

    numeric_model = make_numeric_model(numeric, categorical)
    numeric_model.fit(train, train["log_usd"], regressor__sample_weight=weights)
    numeric_prediction = numeric_model.predict(test)

    tree_model = make_tree_model(numeric, categorical)
    tree_model.fit(train, train["log_usd"], regressor__sample_weight=weights)
    tree_prediction = tree_model.predict(test)

    char_model = make_char_model()
    char_model.fit(
        train["username"], train["log_usd"], regressor__sample_weight=weights
    )
    char_prediction = char_model.predict(test["username"])

    blend_prediction = np.median(
        np.vstack([recent_segment_prediction, numeric_prediction, tree_prediction]), axis=0
    )
    predictions = {
        "global_median": global_prediction,
        "structural_segment_median": segment_prediction,
        "recent_structural_median": recent_segment_prediction,
        "constrained_comparable_knn": comparable_prediction,
        "structured_recency_ridge": numeric_prediction,
        "structured_recency_extra_trees": tree_prediction,
        "character_ngram_recency_ridge": char_prediction,
        "robust_recency_ensemble": blend_prediction,
    }
    result = {
        "train_n": int(len(train)),
        "test_n": int(len(test)),
        "train_end": train["sale_date"].max().strftime("%Y-%m-%d"),
        "test_start": test["sale_date"].min().strftime("%Y-%m-%d"),
        "test_end": test["sale_date"].max().strftime("%Y-%m-%d"),
        "models": {name: metrics(actual, values) for name, values in predictions.items()},
        "segments": {},
    }
    for column in ("length_bucket", "charset", "lexical_class"):
        result["segments"][column] = {}
        for value in sorted(test[column].unique()):
            mask = test[column].to_numpy() == value
            if mask.sum() >= 8:
                result["segments"][column][str(value)] = {
                    name: metrics(actual[mask], values[mask])
                    for name, values in predictions.items()
                }
    return result


def quantile_summary(frame: pd.DataFrame, column: str) -> list[dict]:
    rows = []
    for value, group in frame.groupby(column, dropna=False):
        prices = group["sale_usd_event"].to_numpy()
        rows.append(
            {
                column: str(value),
                "n": int(len(group)),
                "median_usd": float(np.median(prices)),
                "p25_usd": float(np.quantile(prices, 0.25)),
                "p75_usd": float(np.quantile(prices, 0.75)),
                "p90_usd": float(np.quantile(prices, 0.9)),
            }
        )
    return sorted(rows, key=lambda row: row["median_usd"], reverse=True)


def load_frame() -> pd.DataFrame:
    cache = json.loads(RATE_CACHE.read_text(encoding="utf-8")) if RATE_CACHE.exists() else {}
    raw = pd.read_csv(SALES_CSV)
    raw = raw[(raw["parse_ok"] == True) & raw["last_sale_date_label"].notna()].copy()  # noqa: E712
    rows = []
    dates = sorted(raw["last_sale_date_label"].unique(), key=lambda value: datetime.strptime(value, "%b %d, %Y"))
    for index, date_label in enumerate(dates, start=1):
        event_rate(date_label, cache)
        if index % 25 == 0 or index == len(dates):
            print(f"historical_rates={index}/{len(dates)}", flush=True)
    for _, source in raw.iterrows():
        features = lexical_features(source["username"])
        date_label = source["last_sale_date_label"]
        sale_date = datetime.strptime(date_label, "%b %d, %Y")
        usd_rate = float(cache[date_label]["usd"])
        event_usd = float(source["last_sale_ton"]) * usd_rate
        features.update(
            {
                "sale_date": sale_date,
                "market_day": (sale_date - datetime(2022, 1, 1)).days,
                "sale_native": float(source["last_sale_ton"]),
                "event_usd_rate": usd_rate,
                "sale_usd_event": event_usd,
                "log_usd": math.log(max(1.0, event_usd)),
                "recorded_sales": int(source.get("recorded_sales") or 0),
                "auction_events": int(source.get("auction_events") or 0),
                "market_rank": int(source.get("market_rank") or 0),
            }
        )
        rows.append(features)
    return pd.DataFrame(rows).sort_values(["sale_date", "username"]).reset_index(drop=True)


def main() -> None:
    frame = load_frame()
    cutoffs = [0.60, 0.70, 0.80]
    boundaries = [
        frame.iloc[min(len(frame) - 1, int(len(frame) * value))]["sale_date"]
        for value in cutoffs
    ]
    boundaries = list(dict.fromkeys(boundaries))
    boundaries.append(frame["sale_date"].max() + pd.Timedelta(days=1))
    folds = []
    for boundary, next_boundary in zip(boundaries, boundaries[1:]):
        train = frame[frame["sale_date"] < boundary].copy()
        test = frame[
            (frame["sale_date"] >= boundary) & (frame["sale_date"] < next_boundary)
        ].copy()
        if len(test) < 20:
            continue
        folds.append(evaluate_fold(train, test))
        print(f"evaluated train={len(train)} test={len(test)}", flush=True)

    model_names = list(folds[0]["models"])
    aggregate = {}
    for name in model_names:
        aggregate[name] = {
            metric: float(np.mean([fold["models"][name][metric] for fold in folds]))
            for metric in folds[0]["models"][name]
            if metric != "n"
        }

    observed = {
        "rows": int(len(frame)),
        "date_min": frame["sale_date"].min().strftime("%Y-%m-%d"),
        "date_max": frame["sale_date"].max().strftime("%Y-%m-%d"),
        "sale_usd_event": {
            "median": float(frame["sale_usd_event"].median()),
            "p10": float(frame["sale_usd_event"].quantile(0.1)),
            "p90": float(frame["sale_usd_event"].quantile(0.9)),
            "p99": float(frame["sale_usd_event"].quantile(0.99)),
            "max": float(frame["sale_usd_event"].max()),
        },
        "by_length": quantile_summary(frame, "length_bucket"),
        "by_charset": quantile_summary(frame, "charset"),
        "by_lexical_class": quantile_summary(frame, "lexical_class"),
    }
    results = {
        "method": "chronological expanding-window tests on event-date USD",
        "source_limitations": [
            "The public-page sample is selected toward names with visible sales and is not the full market universe.",
            "Only the latest visible sale per username is available in this source.",
            "A daily historical native/USD rate is used because the source exposes a date but not the exact event timestamp.",
            "Semantic and legal-risk labels are not yet present, so these results are lower-bound baselines.",
        ],
        "observed": observed,
        "folds": folds,
        "aggregate_models": aggregate,
    }
    RESULT_JSON.write_text(json.dumps(results, indent=2), encoding="utf-8")

    ranking = sorted(
        aggregate.items(), key=lambda pair: pair[1]["median_abs_log_error"]
    )
    lines = [
        "# Telegram Username Experiment Results",
        "",
        f"Observed sale records: **{len(frame):,}** ({observed['date_min']} to {observed['date_max']}).",
        "All sale labels were converted to USD using the historical native-token/USD rate on the sale date.",
        "",
        "## Chronological backtest",
        "",
        "| Model | Median error factor | Within 2x | Within 5x | Within 10x |",
        "|---|---:|---:|---:|---:|",
    ]
    for name, values in ranking:
        lines.append(
            f"| {name} | {values['median_error_factor']:.2f}x | "
            f"{values['within_2x']:.1%} | {values['within_5x']:.1%} | {values['within_10x']:.1%} |"
        )
    lines.extend(
        [
            "",
            "## Interpretation",
            "",
            "These are deliberately hard out-of-time tests. They measure cold-start generalization, not fit on names the model has already seen.",
            "The result is not a production estimator by itself: the source is selected, semantic labels are incomplete, and manipulation filtering is still required.",
            "",
            "## Source limitations",
            "",
        ]
    )
    lines.extend(f"- {item}" for item in results["source_limitations"])
    RESULT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"results={RESULT_JSON} report={RESULT_MD}", flush=True)


if __name__ == "__main__":
    main()

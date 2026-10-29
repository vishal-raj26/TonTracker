# Telegram Username Experiment Results

Observed sale records: **1,488** (2022-10-28 to 2026-08-19).
All sale labels were converted to USD using the historical native-token/USD rate on the sale date.

## Chronological backtest

| Model | Median error factor | Within 2x | Within 5x | Within 10x |
|---|---:|---:|---:|---:|
| robust_recency_ensemble | 1.71x | 60.1% | 92.6% | 96.4% |
| structured_recency_extra_trees | 1.72x | 60.5% | 91.5% | 96.1% |
| recent_structural_median | 1.73x | 61.6% | 90.7% | 95.5% |
| structured_recency_ridge | 1.90x | 53.2% | 88.6% | 96.3% |
| structural_segment_median | 2.15x | 46.7% | 71.8% | 80.5% |
| constrained_comparable_knn | 3.43x | 35.4% | 57.9% | 72.2% |
| character_ngram_recency_ridge | 5.33x | 11.7% | 49.0% | 68.5% |
| global_median | 40.62x | 13.1% | 17.0% | 32.5% |

## Interpretation

These are deliberately hard out-of-time tests. They measure cold-start generalization, not fit on names the model has already seen.
The result is not a production estimator by itself: the source is selected, semantic labels are incomplete, and manipulation filtering is still required.

## Source limitations

- The public-page sample is selected toward names with visible sales and is not the full market universe.
- Only the latest visible sale per username is available in this source.
- A daily historical native/USD rate is used because the source exposes a date but not the exact event timestamp.
- Semantic and legal-risk labels are not yet present, so these results are lower-bound baselines.

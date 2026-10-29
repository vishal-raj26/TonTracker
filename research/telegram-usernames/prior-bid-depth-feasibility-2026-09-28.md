# Prior exact-NFT auction bid depth: bounded feasibility pilot

Date: 2026-09-28 local (2026-09-27 UTC). Research-only. No 2026 reserved outcome labels were opened, no estimator was fit, and no production source or worker changed.

## Why this was checked

Prior on-chain bids by independent buyers could, in principle, provide a prediction-time measure of demand for an inactive username beyond its last completed sale. A seller ask is not equivalent evidence. This pilot tested data accessibility and the existing verifier only; it did **not** test whether bid depth predicts resale value.

## Inputs and deterministic selection

- Exposed historical paired v25 cases: `data/username-secondary-own-history-v25-comparison-2026-09-27.json`, SHA256 `be022970b33b8662b266496e652da60299d4e677be4020920148173ee3c32186`.
- Point-in-time own-history features: `data/username-secondary-own-history-features-2026-09-27.json`, SHA256 `03746b61f77a9a203f5a877303f071409549e731ab6098a4d61c076d29b64aca`.
- Existing chain-bid verifier: `../../lib/username-auction-bid-evidence.js`, SHA256 `11afca7e5a45dcca07250d8380688e7f539ce887e3127716de796d5b40f7fd06`.

Select exposed historical paired cases whose `realizedVenue` contains `secondary`, whose event time is in `[2024-12-01, 2025-02-01)`, and whose point-in-time own-history row has a strictly prior sale. There are 3,715 eligible cases. Sort by SHA256 of `nftAddress + '|' + eventTime` and take the first 24; all 24 have distinct NFT identities. Ordered sample-key SHA256 is `269c73fc4d9dca418a919782635ef3c133fb6bbe2d9bfcb63bc6fa520b4c9c23` (keys joined with the two-character string `\n`). This selection does not use target prices, names or predicted errors. `realizedVenue` is a **post-outcome feasibility stratum** and must never become a prediction-time routing feature.

## Read-only API and result

For each selected NFT, a bounded unauthenticated [TON Center v3 transactions query](https://docs.ton.org/ecosystem/api/toncenter/v3/blockchain-data/get-transactions) used exact `account`, `start_utime=1660000000`, `end_utime` at the historical target event, `limit=1000`, and ascending sort. Requests were spaced at least 1.2 seconds apart and timed out after 15 seconds. The existing `bidLifecycleEvidence` verifier was applied with target username/address and target-time cutoff. No raw transaction or price output was saved.

| Pilot measure | Count |
| --- | ---: |
| Selected distinct historical NFTs | 24 |
| HTTP errors | 0 |
| Verified by existing lifecycle parser | 16 |
| Verified with one bid | 14 |
| Verified with two or more bids and multiple bidder identities | 2 |
| Parser failures | 8 |
| Transactions returned across queries | 1,507 |

A follow-up on the first three parser failures (sample indices 4, 5, 6) returned `Verified auction bids are not strictly increasing`. Their account queries returned 9, 45 and 238 transactions respectively. This is a verifier limitation on these historical histories; it is **not** proof of any particular auction-cycle interpretation. Queries were capped at 1,000 transactions per NFT, so complete account history was not proven for every case.

## Decision and next test boundary

Do not feed this pilot's bid count into valuation, infer a funded current offer, or use the two multi-bid cases as an accuracy claim. Existing verified coverage is 16/24, observed independent-bid competition is 2/24, and eight histories require investigation before a reliable feature can be defined. The small, secondary-selected historical sample cannot establish full-market coverage or prediction value.

If pursuing this avenue, first define and test a cycle-aware, fail-closed historical-bid verifier that segments auctions without accepting transfers or refunds as bids, proves completeness/pagination, and restricts evidence strictly before each target time. Freeze its source hash and a distinct temporal development/calibration/evaluation protocol **before** fitting any bid-depth feature. Compare all cases and same-case v25, with premium/ordinary/intermediate errors, interval score and coverage, abstentions, independent identities and uncertainty. Keep the 2026 prospective streams sealed and price-blind. A negative or sparse result should end this avenue rather than be converted into a value floor.

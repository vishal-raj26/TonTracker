# Historical Telemint auction-cycle feasibility

Date: 2026-09-28 local (2026-09-27 UTC). Research-only, exposed historical sample. No 2026 reserved outcome was opened, no target price was emitted by the diagnostic, and no production valuation code, worker, or deployment changed.

## Source and question

The previous [24-NFT prior-bid pilot](prior-bid-depth-feasibility-2026-09-28.md) had eight histories rejected for non-increasing lifetime bids. The question here is whether complete account histories expose distinct auction starts, so a future verifier can analyze bids within cycles rather than across an NFT's lifetime.

Telegram's [Telemint NFT item contract](https://github.com/TelegramMessenger/telemint/blob/main/func/nft-item.fc) processes a plain transfer as a bid when an auction is active, but also accepts an owner plain-transfer top-up when no auction is active. It separately handles `teleitem_start_auction`; `process_new_bid` raises the minimum and may extend the end time. Therefore a successful plain transfer alone is **not** a lifetime bid proof, and a lifetime monotonicity rule is invalid across restarts. The contract source is the behavioral reference, not proof that an indexed transaction is an accepted bid in a particular cycle.

TON Center's [v3 transactions API](https://docs.ton.org/ecosystem/api/toncenter/v3/blockchain-data/get-transactions) exposes account-scoped ordered transactions and before/after state hashes. In the live responses used here, `data_boc` was absent, so the before/after hashes by themselves cannot decode historical auction state. The transaction `prev_trans_lt` and `prev_trans_hash` fields were used for completeness checks.

## Fixed sample and method

The research-only script `scripts/diagnose-username-prior-bid-cycles.js` reproduces the prior pilot's deterministic 24 distinct NFTs from the exposed v25 comparison and prior-own-sale feature files. It asserts the same literal-`\\n`-joined selection-key SHA256 `269c73fc4d9dca418a919782635ef3c133fb6bbe2d9bfcb63bc6fa520b4c9c23`, and does not select on target price or error. The original feasibility stratum uses `realizedVenue`, which is post-outcome information and **must not** be a prediction-time feature.

For each NFT the script read at most 1,000 ascending account transactions from 2022-08-09 to the historical target time. It required a genesis predecessor LT of zero, every successive transaction's predecessor LT/hash to match the preceding transaction, correct account identity, no post-target transaction, and fewer than 1,000 returned rows. It counted successful decoded `teleitem_msg_start_auction` operations strictly before target time, and ran the old lifetime parser solely to reproduce its status. It wrote no bid amount, sale outcome, or target price. A gap, cap hit, or request error would have remained explicit rather than being treated as a complete history.

## Result and boundary

The immutable diagnostic output is `data/username-prior-bid-cycle-feasibility-2026-09-28.json` (SHA256 `613e9b219d7c9d3787fee307a1b653a3ff3a11faa95ebae60e69118f4c16819d`). All 24 histories reach genesis and have zero predecessor-link gaps; the largest contains 306 transactions, below the 1,000-row cap. There were zero request errors. Twenty NFTs have at least one successful later auction start; 17 have two or more. The old lifetime parser rejects eight, all eight in histories with later starts. The first three previously rejected cases have 2, 19, and 13 successful later starts respectively and complete account chains.

This establishes a reproducible source for historical cycle boundaries and explains why a lifetime monotonicity test rejects some cases. It does **not** prove that all plain transfers are bids, that the latest cycle was active at a prediction cutoff, that before/after state hashes alone identify bid state, or that prior bid depth predicts later resale value. A successful plain transfer after an auction can be an owner top-up. The current bid parser is therefore unsuitable as a general inactive-resale demand feature. The existing active-auction prospective evaluator is frozen; this diagnostic neither changes its protocol nor retroactively certifies it.

Next: build a separate fail-closed, cycle-aware historical verifier. It must prove account-chain pagination/completeness, identity, successful start/deploy configuration, exact in-cycle time/minimum/extension/max-bid transitions, and exclude owner top-ups, refunds, failed transactions, and post-cutoff events. Validate against independent historical chain/Fragment evidence before using any magnitude feature. Then seal a distinct temporal development/calibration/untouched-test protocol **before** fitting or inspecting target-price outcomes, and compare all-case and same-case v25 premium/ordinary/intermediate error, intervals, coverage, abstentions and identity uncertainty. Do not use a bid count as a floor or promote this source without those gates.

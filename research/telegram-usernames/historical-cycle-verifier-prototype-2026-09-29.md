# Historical auction-cycle verifier prototype

Research-only, 2026-09-29 local. No production estimator, frozen prospective evaluator, worker or deployment changed; no reserved 2026 outcome label was opened.

## Implementation and evidence boundary

`lib/username-historical-auction-cycles.js` is a new isolated prototype, not a qualified valuation source. It requires a genesis-linked, contiguous exact-NFT transaction history below the 1,000-row query cap; an exact-collection/name successful deploy; successful state-changing restarts; strictly pre-cutoff, successful plain-message bids while the reconstructed cycle is open; the configured minimum, 1 TON minimum increment, percentage step, extension and maximum-bid rules. It excludes post-auction transfers. Missing state-change evidence, inconsistent timing/minimums and account-chain gaps fail closed.

Cancellation is accepted only with the exact decoded type/opcode, valid source/destination, successful execution, changed data hashes, an open cycle, and no accepted bids. This follows Telegram's published [operation constants](https://github.com/TelegramMessenger/telemint/blob/main/func/common.fc) and [NFT item cancellation implementation](https://github.com/TelegramMessenger/telemint/blob/main/func/nft-item.fc). Without cancellation handling, some legitimate later restarts falsely appear to overlap an earlier unsold cycle.

This is indexed-state reconstruction, **not cryptographic validation of contract code, independent historical owner/state verification, or proof of current funded demand**. The module returns `valuationEligible:false` and `portfolioEligible:false`. It must not be substituted into the frozen v2/v3 evaluators or production valuation merely because its unit tests pass.

Current module SHA256: `a02dfb42aae9ace67a7ccfce29110271e9a0956230ef3bfb8a372f0d0407afee`. Its initial-deploy helper remains `username-auction-bid-evidence.js` SHA256 `11afca7e5a45dcca07250d8380688e7f539ce887e3127716de796d5b40f7fd06`. Research runner `scripts/diagnose-username-cycle-verifier.js` is SHA256 `93191b9259e1c76b1959b3a5ca2e179c94defe0f0e67a8e69d37d89d78be5901`.

## Fixed-sample coverage result

The runner reuses exactly the price/error-blind 24-NFT exposed-history selection from the [previous pilot](prior-bid-cycle-feasibility-2026-09-28.md). It outputs only statuses, counts and hashes, not target prices or bid amounts. The original uncancelled prototype report is preserved at `data/username-cycle-verifier-feasibility-2026-09-28.json`, SHA256 `c02dd9d8721460070d256e7524061ca776fba3b8364c3f5c56a2ee05d020d793`; it reconstructed 15 and abstained on nine. The cancellation-aware report is `data/username-cycle-verifier-feasibility-v2-2026-09-29.json`, SHA256 `01275bbe584cab143859b6b852b180c067c3c2dbf72407db2a362df87100ff6b`.

The current prototype reconstructs 19/24 histories and leaves five unavailable: two in-cycle transfers lack state-change proof, and three auction starts lack it. Three of the eight old lifetime-parser failures are recovered without weakening state-change requirements. Among the 19 reconstructed histories, eight latest cycles have a bid and **none has multiple bids**. There are 41 reconstructed bids across all cycles. This sample therefore does not demonstrate that latest-cycle bid depth is a useful new premium magnitude signal. It also does not prove that the other five histories contain no valid demand.

## Decision and next boundary

Do not fit or promote a bid-depth price multiplier from this pilot. First independently validate historical code/state transitions and measure representative source coverage. If a larger point-in-time demand study is pursued, predeclare the sampling, development/calibration/evaluation dates, source hashes and all-case gates before fitting. Candidate signals could include prior cycle competition or unsuccessful auction exposure as learned evidence reliability, but seller-selected minimums and unsold cycles are not executable prices and must not become floors. Compare against same-case v25 and saved own-history candidates, preserve missing-source abstentions, and report premium/ordinary/intermediate errors, intervals, coverage and identity uncertainty. If coverage/independent demand remains sparse, end this avenue rather than scaling it blindly.

Verification: focused cycle tests 4/4 and full Node suite 366/366 pass. These establish implementation safety and preservation of other app behavior, not predictive quality. Premium inactive resale and current-market qualification remain incomplete.

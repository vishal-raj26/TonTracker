# Username rebuild: bounded finish plan

Decision recorded 2026-09-30 UTC after the user requested a shorter path to completion.

The full estimator goal and its accuracy requirements remain active. This plan replaces open-ended experimentation; it does not lower the qualification bar or turn passing unit tests into valuation evidence.

## Decisions

1. Close historical auction-depth development at its current feasibility boundary. The 24-NFT pilot has no latest cycle with multiple bids. Independent historical state proof would add engineering work before demonstrating a useful valuation signal. Preserve the prototype and reports; do not expand or integrate this branch without new independent evidence.
2. Keep rejected absolute-price HGB, logistic routing, generic history expansion and market-index variants rejected. Do not search parameters or thresholds on their exposed results.
3. Run one fixed residual candidate using existing exact-NFT own-sale features and the same-case v25 replay. Learn the change from v25, conditioned on the prior sale's relative price, age, count, baseline range and name length. This can learn downward as well as upward corrections. Keep v25 unchanged where the required evidence is absent. Freeze code, inputs, dates and gates before fitting; do not iterate after viewing the result.
4. Separate historical feasibility from current-market qualification. Fit October–November 2024, calibrate December 2024, and check every January 2025 case. All these dates are exposed development data. A pass only permits preparing a new future reservation for this exact candidate; it does not permit production integration or reuse of an already reserved cohort for a changed candidate.
5. Preserve the existing prospective reservations and evaluation rules. Their October 4/11/18 blocks test active auctions, which is a separate claim from inactive resale. Do not describe their results as general premium-estimator qualification.

## Stop and integration rules

Run the residual experiment once. Publish all errors, coverage, interval scores, abstentions, comparison with saved candidates and failed gates. On failure, close this candidate path and record exactly what independent evidence remains missing. A future experiment requires a materially new evidenced hypothesis; changing parameters on this check is insufficient.

If the numerical development gates pass, freeze the candidate and its runtime adapter, verify callers and reserve a genuinely future temporal qualification cohort before any outcome access. Historical exposure and the single January block still fail the independent-evidence requirements. Only an independent qualification pass permits integration. No deployment, other-worker resumption, shared DNS schedule or subscription change is included.

At each stage save the result and exact next command in `docs/USERNAME_REBUILD_CHECKPOINT.md`. Never promise a completion date before the required evidence exists. Code readiness, historical improvement and current-market qualification must be reported separately.

## Single-experiment outcome

The fixed residual run finished on September 30 and failed its numerical gates. Its [result record](anchor-residual-development-result-2026-09-30.md) retains all cases, the source/code seals and saved-candidate comparisons. This candidate path is closed. Further residual/anchor parameter searches and auction-depth expansion are not the next task. Continue the existing sealed qualification streams within their claims; general inactive-premium improvement requires independent premium-magnitude evidence before another candidate is justified.

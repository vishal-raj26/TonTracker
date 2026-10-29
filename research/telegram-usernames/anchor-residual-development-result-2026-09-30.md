# Fixed residual candidate: rejected

2026-09-30 UTC. This completes the single experiment in the [bounded finish plan](USERNAME_REBUILD_FINISH_PLAN.md). No parameter search or second fit was performed.

## Provenance and scope

Protocol SHA256 `a87d988574fa0c12f542621366c0d4b853998d5c41d4d212458dc18b21483977`; evaluator SHA256 `5bff130dab06bd6a15098595cb6b219714d672b9b48fc7ebfc34f1d06e0bc90d`; pre-fit code seal SHA256 `d2c7962855823b767e4bc6ebf26273124010eca5dc2f0d18011e95dbd85bd22a`. Immutable report `data/username-anchor-residual-development-2026-09-30.json` SHA256 `1a5eeaf4b1db64c585a8e5e77235e91f7e595b978e9306d95586dd19309a0845`.

All 30,995 source cases match the frozen exact-NFT/name/time feature export. The model fit 3,393 eligible October–November 2024 cases, calibrated on 1,604 December cases, and checked every January 2025 case: 6,717 attempts, of which 2,111 had eligible anchors. The absent-anchor population keeps v25 and its unavailable states. Residual features omit target outcomes, realized venue, address and name spelling. Own sales can produce downward corrections and are never floors.

January was previously exposed during development. This is one temporal check block, not independent qualification. The mixed historical index does not prove current 2026 resale behavior. Saved HGB controls are same-case predictions but have their original different training/calibration windows; their columns are descriptive comparisons, not a matched-family causal experiment.

## Results

MALE is mean absolute log error; lower is better. Coverage refers to the advertised 80% interval and excludes unavailable predictions from its numerator and denominator; attempts and abstentions are retained separately.

| January cohort | Attempts | v25 MALE | Residual MALE | v25 median factor | Residual median factor | v25 coverage | Residual coverage |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| All | 6,717 | 0.60657 | 0.58844 | 1.269× | 1.252× | 82.62% | 81.43% |
| Ordinary | 5,314 | 0.28976 | 0.26770 | 1.199× | 1.190× | 90.55% | 89.44% |
| Premium | 727 | 2.49835 | 2.46183 | 9.347× | 9.259× | 20.25% | 23.69% |
| Secondary premium | 72 | 2.02155 | 1.65337 | 7.786× | 4.466× | 15.28% | 50.00% |
| Secondary intermediate | 141 | 0.90099 | 1.05686 | 2.412× | 2.689× | 89.36% | 56.74% |

Overall log interval score improves 3.68167 → 3.29974, and both v25 and residual retain one abstention. Ordinary MALE improves 7.6%, but overall premium improvement is only 1.46% (identity-bootstrap 95% interval 0.66–2.35%). Secondary-premium improvement is 18.21% (95% interval 9.33–26.42%), below the predeclared 25%; its median error exceeds 3× and coverage misses 70%. The 72 secondary-premium events represent only 69 identities. Secondary intermediate MALE regresses 17.30%, exceeding 5%. Numerical gates fail, in addition to independent temporal support.

On the same 72 secondary-premium check cases, saved absolute-price own-history HGB has MALE 1.61020 / median 4.955× / coverage 66.67%; saved logistic fusion has MALE 1.72816 / median 6.192× / coverage 45.83%. Those variants were already rejected. The residual's somewhat better median does not offset its failed gates or establish superiority.

## Decision and continuation

Close this candidate. Preserve code, seal and result; do not retune parameters, gates, feature thresholds or intervals on January. No production integration, reserved-label opening or worker/deployment change occurred. The auction-depth pilot is also closed at feasibility because it demonstrated no latest-cycle bid depth.

The goal remains incomplete: no candidate has demonstrated sufficiently accurate premium magnitude with ordinary/intermediate safety and independent current-market evidence. The next useful evidence is a verified prediction-time source of premium magnitude for previously unseen/no-anchor names, or a materially new hypothesis justified by such evidence. Prior-anchor tuning alone cannot solve the large first-sale premium population.

Existing future active-auction reservations keep their original claims and hashes; their October 4/11/18 windows cannot qualify this residual or general inactive resale. Continue their collection and independent evaluation under the sealed protocol. If a new inactive-resale candidate is justified later, it needs its own future reservation before outcomes occur.

Verification: six focused Python tests and 366/366 full Node tests pass; graphify updated to 5,912 nodes / 11,318 edges / 450 communities (optional SQL parser absent). Passing implementation checks does not change the valuation rejection.

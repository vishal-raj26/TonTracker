# TonTrack product redesign direction

2026-10-04. Implementation in progress, not a completion certificate.

## Evidence and translation

Primary benchmark: actual Android Fomo navigation and held chart touch documented in `FOMO_MOBILE_OBSERVATION_LOG.md`. Exact font, motion curves and unvisited behaviors are not claimed. TonTrack live audits include populated native/jetton, gift collection/model/individual/preview sheet, sticker brand/pack, identity details, analytics, settings, wallet management and watchlist flows. Remaining states are tracked in the checkpoint.

TonTrack is a read-only portfolio product, not a trading feed. Transfer Fomo's quiet hierarchy, consistent rows, stable graphs and contextual depth; do not add trading or social functionality.

## Product system

- Home: one leading portfolio value and chart. Holdings, allocation and recent activity follow without competing display treatments. Analytics answers exposure/history questions rather than repeating Home's headline twice.
- Assets: category discovery leads into holdings. Collections and models remain real navigation levels, but a group total is called a holding value, not an individual floor. Item values, quantities and evidence are consistently separated.
- Details: identity and available value first, then a stable chart and recent transactions/sales. Collection/pack/network/trait/origin information becomes secondary, with disclosure where dense. Never conflate model estimates with exact floors.
- Navigation: the dock belongs to root destinations. Deep details use a contextual back header, not a second competing navigation rail. Preserve existing route/history contracts.
- Typography: one readable sans system, regular secondary text, restrained semibold headings, tabular financial values. Retire decorative LED numbers and their hundreds of DOM nodes per value.
- Surfaces: content is generally unboxed. Use surfaces for controls, sheets and selected state rather than wrapping every section in another card. No decorative glass or large glow behind financial information.
- Geometry: 4/8/12/16/24/32 spacing scale, 20px screen gutter, 44px controls, 44px row identity, 64px minimum row. Chart geometry remains reserved while loading.
- State: retain known statistics while changing chart periods; distinct unavailable/loading/error states; no guessed live prices. Mock gift fixtures remain local-only and identified in their provenance while live services recover.
- Accessibility: keyboard operability, visible focus, meaningful names, reduced motion and sheets that restore focus. Do not replace financial interaction with decorative motion.

## Delivery sequence and gates

1. Consolidate foundations and nested detail reading order, verify actual live render at phone width.
2. Rebuild root hierarchy, category/holding rows, filters/search and route state preservation.
3. Unify detail scaffolds and chart interactions, including selected main value, reserved geometry, caching and honest no-data behavior.
4. Finish sheets, secondary screens, states, accessibility and responsive coverage. Record every accessible control, and label unavailable flows rather than claiming coverage.
5. Full functional tests plus entire-product visual/interaction audit. Return to actual relevant Fomo views if new uncertainty arises and device access is authorized. The goal remains incomplete until the full original brief is verified.

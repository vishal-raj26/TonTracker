# TonTrack redesign coverage ledger

2026-10-04. This is a verification backlog, not a completion certificate. The full original Fomo brief remains the completion standard. Route names below come from the current index.html; dynamic detail/sheet variants come from app.js. A visited route is not necessarily polished or fully tested. Earlier evidence is in FOMO_REDESIGN_CHECKPOINT.md and FOMO_MOBILE_OBSERVATION_LOG.md.

## Route and nested-state ledger

October 4 structural correction: Home is now current-value overview → direct category inventory → moving holdings → recorded history → activity. Allocation/token movers moved to Analytics, replacing its duplicate mover cards and meter list. Actual Home→Gifts/back and Analytics mover→token/back passed. Full suite 434/434; final focused changes 26/26. Previous fixed Home order is not a requirement. See PRODUCT_EXPERIENCE_REBUILD.md; the full nested-route/state backlog remains incomplete.

Home continuation: static (non-expandable) six-category mix, automatically advancing native holdings carousel with retained total counts and interaction/reduced-motion guards, three compact recent activities and signed/validated movers implemented. 320px populated Home/no horizontal page overflow and automatic scroll changes verified. Full suite 433/433; final focused refinements 23/23. Day-one helper is tested, not yet visually verified. History freshness/coverage remains unresolved; the broader route/state gates below remain incomplete.

| Route | Observed evidence | Remaining final gates |
| --- | --- | --- |
| home | Populated wallet, holdings → detail/back, View all, 320px rows; current total matches Assets/Analytics; historical points no longer overwritten; value/source/history hierarchy, inline keyboard chart inspection and Escape reset, 44px ranges | Prioritized by user. Snapshot freshness/coverage, touch scrub/past-future emphasis, final no-fill render, allocation/performance/activity, refresh/loading/error, reduced motion |
| assets | Populated categories and top collection route, narrow layout | Empty/disconnected/loading, total change accuracy, consistent category navigation |
| tokens | Native GRAM/hGRAM loaded detail and Day/Week caching | Every sort, search/no matches, unpriced rows, narrow balances, intent prefetch, error |
| gifts | Dynamic child-trait filters, Beehive result, no matches/clear/focus, narrow search; searchable sheet and live Tab/Shift+Tab/Escape focus restoration | Every sort, filtered counts/context, loading/error/partial |
| gift-brand collection | Ice Creams → Beehive model, holding totals and contextual back; compact native preview, loaded registry art, Tab/Shift+Tab/Escape focus/scroll restoration, detail route; 320px 65px artwork | Every media/error state, long lists, refresh, long names, filtered context |
| gift-brand model mode | Beehive → individual gift/back; compact identity/value rows, estimate basis, holding summary, hidden root dock, no narrow overflow | Refresh/loading/error/partial, long-name final audit |
| stickers | Dynamic actual formats/brands, no matches/clear/focus, narrow layout | All filters/sorts, child search after shared helper change, loading/error/partial |
| sticker-brand | Goodies → Teddie Xmas, quiet row | Multi-pack/multi-owned previews, unavailable packs, refresh/loading/error |
| detail: gift | Value/chart/sales/disclosures, currency controls at 320px; estimated/current-floor/last-sale hero language and model evidence retained | Chart interaction, all metadata/media/external-link states |
| detail: sticker | Teddie Xmas value/chart unavailable/sales empty/Pack Details expanded | Pack Stats, refresh/disclosure preservation, preview overlay, currency switching and graph interaction |
| detail: native/jetton | Native independent sources and cached period loading; hGRAM populated | Main value versus chart endpoint, shared detail hierarchy, every range and scrub, optional failures |
| dns | Earlier wallet/individual damx route inspection | Canonical DNS documents must be read before edits; loading/unavailable/zero semantics, final row/detail hierarchy |
| anonymous-numbers | Earlier +888 individual route inspection | Current state/price semantics, loading/empty/error, final nested audit |
| usernames | Earlier @buygram route inspection | Estimator architecture remains separate; current state/price semantics, final nested audit |
| analytics | One populated total/chart/statistics/mix | Quiet metrics, stable graph, current value consistency, partial history, loading/error |
| watchlist | Empty state observed | Populated add/remove/open/back, wallet/cache isolation, unavailable values, saved assets no longer held |
| activity | Earlier transaction/history inspection; Home recent activity | Every filter/search/pagination, transaction sheet, empty/error/loading, preserving scroll |
| wallets | Earlier manage-wallets view | Actual source counts/totals, switch/rename/disconnect confirmation, import and wallet-specific state isolation |
| settings | Earlier sections and Price alerts → Watchlist behavior | Meaningful labels/actions, all accessible secondary controls, reduced motion, refresh states |

## Sheets and overlays

- walletSheet: source choice, Telegram and TON branches, read-only input/validation/resolution/fetch errors; no authentication submissions without appropriate user involvement.
- walletActionSheet: labels, dismiss/Escape/focus restoration, management route, external explorer destinations; disconnect must be safely verified without altering an unrelated wallet.
- tokenSortSheet: selection/expanded state/focus source tests exist; live mobile/keyboard review still required.
- txSheet: actual transaction values/direction/time/explorer, loading/failure, dismiss/focus.
- gift-pfp tray: gift and sticker modes; every media class, paging/open detail/back, keyboard/Escape/focus.
- sticker-thumb overlay: verified asset image, metadata, close/back/Escape/focus, image failures.
- importLoader: logo/video/progress exists; verify end-to-end complete/partial/error/retry behavior, no early dashboard or progress reset.
- welcome/onboarding: existing media preserved; verify responsive copy/CTA/source-sheet entry without redesigning into a disconnected prototype.

## Cross-product final gates

Typography, rows, control dimensions, surfaces, headers, navigation, scrolling, charts and states must be compared across every entry above. Verify 320px and normal phone layouts; desktop shell where applicable. Verify keyboard names/focus, reduced motion, touch target sizes, no overflow or unexpected state loss. Source assertions alone do not prove visual completeness. Run the full suite without simultaneous graph extraction after final implementation. Keep production/local reference pricing isolated and never claim an unavailable service is fixed by mock-mode UI evidence.

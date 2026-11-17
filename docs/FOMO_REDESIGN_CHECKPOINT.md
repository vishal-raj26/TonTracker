# TonTrack product redesign — Fomo mobile benchmark

## Current direction superseded — 2026-10-05 reference sheets

Read `docs/REFERENCE_UI_CHECKPOINT.md` for the active task. The user now requires a
visual-only monochrome redesign using ten attached component sheets, preserving the
existing product structure and all features. Do not resume Fomo restructuring or the
standalone App Designer experiments from the historical notes below.

## Home portfolio pie — 2026-10-05

User requested removal of the duplicate six-category Home inventory grid in favor of the earlier portfolio pie. Home now displays a compact allocation donut and category percentage legend, with total ownership retained and category navigation preserved. Unpriced holdings are explicitly excluded from the value mix, never assigned guessed slices. Assets, Analytics, moving top holdings and pricing behavior are unchanged. This supersedes the earlier Home category-grid composition only; the full redesign remains incomplete.

Verification: app.js syntax and 25 focused allocation/Home/product tests pass. AST graph refresh completed (6141 nodes, 11620 edges); no pending graph command. Updated browser DOM confirms the new mix markup and cache marker product-hierarchy-20261005-mix-1. Loaded-wallet visual verification was blocked by an existing wallet-account provider timeout during saved-wallet restoration; no successful priced-wallet visual audit is claimed. Product stylesheet marker is product-system-20261005-mix-1. Previous rollback graph session also finished; do not poll or restart it.

## User-requested rollback — 2026-10-05

Undid the October 4 searchable Assets inventory and subsequent compact detail-identity/value composition. Restored the category-based Assets screen, previous gift/sticker/identity/token detail markup, original trait placement, chart-control placement and token section ordering. Removed inventory-specific code, styles and tests. Earlier inventory-first Home/Analytics redesign, compact media dialogs, data/valuation logic and unrelated worktree changes are preserved. No Git reset, deployment or worker changes.

Verification: app.js syntax and 31 focused Home/product/detail/UI/GRAM tests pass. Cache markers now use product-hierarchy-20261005-rollback-1 and product-system-20261005-rollback-1. Full redesign remains incomplete; do not automatically reapply the reverted work. New-project product brief remains conversation-only.

Final neutral startup placeholders retain no demo prices/counts; another 19 focused tests pass. Local GET on port 5177 failed with connection refused, so no served-marker or visual verification is claimed and no server was started. AST graph refresh was launched with session 80942; poll that handle before launching another update if its completion is not recorded below.

## Latest continuation — 2026-10-04, inventory-first structural rebuild

Goal ACTIVE/INCOMPLETE. User confirmed the prior actual-device Fomo inspection is sufficient to proceed; a new device pass is no longer a prerequisite. Do not keep treating the absent device as a blocker. Original brief and complete saved Fomo observations reread; current graph/source/worktree checked. Ground-up course correction remains authoritative.

- Added docs/PRODUCT_EXPERIENCE_REBUILD.md with purpose-first screen roles, shared composition foundation, preserved data boundaries and incomplete gates. It is a design rationale, not a completion certificate.
- Replaced Home composition with separate current-value overview → native six-category inventory browser → moving notable holdings → recorded history → recent activity. Current portfolio value is no longer housed in a history graph card. Counts/value/category entry points now dominate the first viewport; history is secondary and cannot overwrite current holdings. This is an actual markup/order/interaction change, not a color/font adjustment.
- Category counts use the same actual gift/token/sticker/identity ownership inputs as allocation. Accepted totals are reused; no prices or API calls were invented. Discovery and gift-price pending states are explicit. Empty category buttons remain available; wallet reset clears the new widgets. Ownership remains visible when pricing is unavailable. DNS canonical documents read before adding the generic category consumer; valuation gates/contract/semantics unchanged.
- Moved the existing static interactive allocation and verified token movers to Analytics. Removed duplicate Analytics best/worst cards and the second allocation meter implementation; one allocation list/donut remains. Unrealized P/L and snapshot data calculations retain their prior behavior. Analytics itself still needs a full purpose-first composition audit; this is not final polish of that screen.
- Runtime: populated Home showed all six owned category counts, 319 total holdings and matching current value. Default-width category targets 88px high; no page overflow (395px document within 410px viewport). Home Gifts button → Gifts → Back to Home passed. Analytics Bullieve mover → actual detail → Back to Analytics passed. Small viewport final audit in progress below. Day-one visual state, touch scrub and June/October snapshot freshness/coverage remain incomplete.
- Tests: full suite **434/434 passed** after structural implementation. Final discovery/pricing and shared mix styling refinements: syntax plus **26/26 focused tests passed**. Served/local JS/CSS markers matched app product-hierarchy-20261004-22 / product-system-20261004-20. No server restart, API/backend/pricing contract, production worker, deployment or billing change. Graph update session98143 started after tests; poll exact handle before restarting.

Final continuation notes: 320px populated Home showed every category count/value and 319 total holdings with no horizontal overflow (305px document). A final density refinement reduces overview padding, category targets from 88px to 76px minimum and highlight cards to 96px minimum while retaining readable type/touch targets; latest focused tests still 26/26. Final browser measurements were 76.8px categories and 103.2px highlights; loaded layout visually checked, console error/warning log empty. Wallet restoration needed time after the last reload; a short observation timeout was followed by an authoritative loaded state, not treated as a failed import. Normal viewport restored, Home/tab2 handed off. Final markers app product-hierarchy-20261004-23 / product-system-20261004-21 match served/local. AST session98143 completed (6132 nodes, 11613 edges), no pending graph process. The existing optional SQL-parser warning remains; no dependency added.

Next: strengthen inventory-first composition if needed, then rebuild Assets and all nested collection/model/item/detail experiences from purpose. Do not fall back to the old Home graph/dashboard stack. Preserve compact gift previews, moving holdings and ownership counts. Whole-product route/state ledger and legacy CSS consolidation remain pending.

## Course correction — 2026-10-04, ground-up presentation redesign

Authoritative new user brief: `C:\Users\vishu\.codex\attachments\c6d5847f-e05e-470d-b39a-5f88ebe2ce6a\Pasted text.txt`. Read fully before continuing. It explicitly supersedes preservation of existing visual layouts/Home as a visual template. Preserve product functionality, APIs, calculations, data and logic; existing presentation is disposable. Earlier polish is provisional, not final design evidence.

- The existing Home is still substantially the old graph → holdings → allocation → movers → activity composition. Cleaner rows, compact cards and different typography do not constitute the requested product redesign. Reassess the composition, information ordering, containers, navigation and interaction model from purpose, not current markup. Do not let prior implementation constrain the solution.
- Next required action: focused **fresh actual Fomo mobile** screen-composition pass. Study first viewport dominance, omitted/secondary information, graph/value relationship, list beginnings, open versus contained layouts, scrolling hierarchy and quiet navigation. No transactions, trades, withdrawals, account/security changes or asset movement.
- Current blocker verified: `adb devices -l` returned an empty list; scrcpy process check returned no process; Windows Computer Use `sky.list_windows()` returned only Codex and Chrome, no Android mirror. Prior October 2 observations remain useful background, NOT evidence of a new pass. Do not fabricate new Fomo observations or start presentation implementation before the requested fresh pass.
- When device is reconnected and Fomo reopened: inspect safe relevant screens, record direct/inferred evidence; review current source/diff alongside working TonTrack; define each screen's purpose, available information/actions and ranked priorities; design new compositions before mapping existing code/data into them. Establish one new shared foundation, then Home first, all asset/nested-detail flows and remaining screens. Verify old-versus-new structure with colors/fonts held conceptually identical. Preserve useful current data-integrity/modal/cache tests even when replacing visual composition.
- Recent explicit preferences remain relevant unless contradicted: compact gift previews, visible rather than expandable portfolio mix, moving holdings with retained counts, purposeful day-one no-history experience. These are requirements, not fixed legacy section layouts.

Goal ACTIVE/INCOMPLETE; no goal pause/completion was applied. No frontend, backend, worker or deployment changes were made for this correction while the required device reference is unavailable.

## Latest continuation — 2026-10-04, compact Home with visible mix and moving holdings

Goal ACTIVE/INCOMPLETE. Latest user direction overrides the earlier expandable experiment: Portfolio mix MUST stay visible, and holdings MUST move automatically. Home remains the current priority; compact gift previews are unchanged.

- Home holdings retain all owned-asset counts (319 in the restored wallet), independently of pricing/highlight availability. A bounded 12-item, value-sorted native carousel preserves original detail routes, swipe and keyboard access. It advances every four seconds, reverses at the end, pauses on hover/focus/press and eight seconds after pointer/wheel/key interaction, and does not advance off Home, in hidden documents or with reduced motion. One timer per viewport, no clones or new requests. Connected/no-priced-highlights state retains the count and View all route.
- Portfolio mix is an always-visible section, NOT details/summary. Six categories retain values, small positive shares, owned/unavailable information and interactive selection. Compact two-column legend, small donut, quiet pricing coverage note; no expansion toggle. The 320px browser confirmed all six categories and no page overflow. Automatic scrollLeft changed between observations (1468.8 → 2203.2), not merely manual swiping.
- Home lower sections now use aligned 44px artwork, 72px mover/activity rows and consistent 14px/12px hierarchy. Three compact recent activities link to the full Activity screen; detail metadata is not removed from Activity. Movers reject null/empty/whitespace/boolean/nonfinite or unpriced changes, use actual sign/ranking, suppress duplicate single-token rows and clear stale routes on reset. Genuine observed zero remains valid. Images have neutral fallback artwork.
- Day-one/fewer-than-two-points Home hides the chart/timeframes and change badge; an intentional History starts here state replaces the empty graph. Fetch failures are distinct. Unit tests verify disconnected/no-history/failure/history transitions, but day-one visual transition remains NOT live-verified. Recorded history displays the actual snapshot date and coverage warning; current total is not overwritten. Snapshot age/coverage (~June 12 versus October 4 and ~$3K recorded versus ~$45K current) remains unresolved, not fabricated.
- Verification: full suite **433/433 passed** after static mix/autoplay implementation; final compact sizing/copy refinement **23/23 focused tests** and app.js syntax passed. GET served/local JS/CSS markers matched app product-hierarchy-20261004-21 and product CSS product-system-20261004-19 (base CSS ui-system-20261004-16). No server restart, backend contract, production worker, deployment or billing changes. AST graph update session37315 started after tests; poll this exact session before restarting graph work.

Final handoff: static mix keyboard selection and original hGRAM holding → detail → Back to Home passed in the browser. Normal viewport restored and tab2 marked for handoff. AST graph session37315 completed: 6122 nodes, 11600 edges. Existing missing optional SQL parser warning remains; no dependency added. No graph update is pending.

Next: finish Home history freshness/coverage/loading/touch scrub and final no-history/reduced-motion visual states, then continue the full nested-route ledger. Current request is not evidence that the whole-product redesign is complete. Preserve static mix, moving holdings/counts and compact gift previews.

## Latest continuation — 2026-10-04, Home priority and compact previews

Goal active/incomplete. Original brief reread. Previous permission-only reply was no progress; this continuation made source changes and runtime verification. User rejected oversized gift previews and explicitly prioritized Home; respect this direction in the next continuation.

- Gift previews retain compact centered geometry (360px maximum, 65px artwork, two-column rows), not the oversized bottom gallery. Native dialog lifecycle now contains keyboard focus, locks scroll, restores opener and prevents stale close events from disturbing a reopened viewer. Escape/Shift+Tab/Tab restoration verified live. At 320px, actual sheet 284×262px, artwork/model layers 65×65px; no full-screen gallery.
- Found and fixed two actual preview media bugs: missing initCollectibleAnimations call and legacy generic span selectors collapsing absolutely positioned backdrop/model layers. Loader initializes verified registry artwork; detached animations cleaned up. Gift preview → original detail → contextual back passed. Sticker thumbnail viewer uses the shared native lifecycle, but its populated media/error states are NOT live-verified; current Goodies detail did not expose a thumbnail row. Do not claim this coverage gate complete.
- Home now leads with portfolio value/source, removes competing Live portfolio kicker, places refresh beside the main value and separates recorded-history value/change from today's holdings total. Quiet 44px range controls replace the enclosing segmented pill; connected wallet control is neutral; removed glowing status dot and repeated rounded value-axis ticks. Chart remains unboxed and latest code removes area fill.
- Added inline selected-point readout and hairline to Home chart, with keyboard left/right/Escape support and touch-release reset. Other chart families retain their tooltip/axis behavior. Live ArrowLeft changed recorded readout to $3,037.51/date while current holdings stayed ~$45K; Escape restored Recorded value. Narrow Home had no horizontal overflow and all range targets measured 44×44px. Mouse/touch scrubbing and final no-fill render still need final visual checks.
- Important limitation: recorded history uses different pricing coverage (~$3K) and selected sample timestamp rendered June 12 despite today's October date. This is not validated current portfolio performance. Snapshot age/coverage needs deeper Home chart audit, not fabricated points. Current API/backend contracts/data remain untouched.
- Full suite **426/426** passed after Home/modal implementation. Latest focused product/chart tests **19/19** and syntax passed after final area/context changes. Current markers: app product-hierarchy-20261004-17, product CSS product-system-20261004-15, base CSS ui-system-20261004-16, chart home-chart-20261004-1. Final GET served/local markers matched; final default-width Home visually confirmed no area fill, value/source/history separation and quiet controls. Default viewport restored; tab2 marked for handoff.

Next: finish Home first (chart freshness/coverage/loading/scrub, hierarchy below chart, allocation/performance/activity, narrow/reduced-motion states), then resume whole-product route ledger. Preserve compact gift previews. Native thumbnail loaded/error states still pending. No production workers/deployment/billing changes. Prior graph session38312 completed (6091 nodes); AST graph update session35549 started after tests. Poll this exact handle before any new update.

## Latest continuation — 2026-10-04, nested gift hierarchy and design freedom

Goal active/incomplete. Original brief reread; previous continuation made actual source/verification progress. User reaffirmed freedom to change visual design, structure and UX throughout the app, not merely layer styles over the old UI. Preserve real functionality/data, not legacy composition for its own sake.

- Root/single-model/individual gift rows now prioritize identity, model/backdrop and one value/basis. Removed repeated provenance/model-estimate lines from lists; model evidence remains on the gift detail page. Mint identifier is quiet inline identity, not another badge row. Estimated list values now say Estimated, not Floor.
- Model summaries say Holding value with coverage/estimate context, replacing repeated model title and decorative open arrow. Deep gift/sticker collection/model routes now hide the root dock; contextual back stack preserved. Live gift detail → Beehive → Ice Creams → Gifts passed, and the dock returned at Gifts.
- Gift detail distinguishes Estimated value / Current floor / Last sale, preserves model evidence, omits default zero-change badge for estimates, and calls chart Value history. Local estimated history receives Estimated history context rather than Floor history; internal preview provenance remains intact.
- Centralized 72px minimum row token and border-box sizing with 12px row padding, also reused by Home holdings. Long titles/basis notes wrap; removed legacy model-count badge pill styling. Before the final tiny wrapping fixes, 320px individual rows measured ~85px (previous ~140–157px) with no horizontal overflow; no dock. Normal-width nested rows and the retained estimate detail were visually inspected.
- Full suite **420/420** passed after list/detail/navigation changes and correction of the old list-only model-evidence assertion. Latest focused product/gift/GRAM/screen checks **26/26** plus syntax passed after final copy/wrapping changes. Full final suite remains a later gate.
- Current markers app product-hierarchy-20261004-15; product CSS product-system-20261004-12; GET served/local markers matched. Final live 320px detail confirmed Estimated value, retained Model estimate, Estimated history and no overflow. Default viewport restored; browser tab2 marked for handoff. No server restart, production worker, pricing contract or deployment changes this continuation. Graph update exec38312 is running; poll this handle before another update.

Next: preview trays/thumbnail overlays lack complete modal focus/scroll handling; finish them, unify detail/chart scaffolds and active-value scrubbing, then secondary route/state coverage. Historical data coverage remains unresolved; DNS state changes require canonical documents first. Do not treat this as completion of the full redesign.

## Latest continuation — 2026-10-04, sheet keyboard and portfolio/history integrity

Goal active and incomplete. Original brief reread. Previous request made regression-test progress; missing graph process handle was revalidated through graph.json updated timestamp/node count, not restarted blindly.

- Shared collectible filter sheet now wraps Tab/Shift+Tab over visible enabled controls. Live gift test: Close → Shift+Tab → Xmas Stockings; last choice → Tab → Close; Escape closes and restores Filter gifts opener/scroll lock. Searchable sheet remains subject to the other coverage gates.
- Home headline now refreshes when allocation/pricing enrichment updates. Live Home/Assets/Analytics all matched $45,095.53 after restoration; previous missing sticker value no longer leaves a stale Home header.
- Assets no longer reads a fabricated default +0.00% from homePortfolioChange; both displays use validated range observations. Fewer than two valid points or a nonpositive baseline yields Movement unavailable. Zero change remains valid when observed.
- Removed destructive last-point overwrites in setLiveHistoryRange and pinCachedHistoryToCurrent. API history values/timestamps remain unchanged when today's prices arrive; invalid/null-value/timestamp rows are rejected. Live artificial +1389% spike dropped to API history's +0.89%. Current holdings ~45K versus historical recorded values ~3K still have different pricing coverage: added explicit recorded-history latest-value context and History change labels, not fabricated historical gift prices. End-to-end historical coverage/backend quality remains unresolved and must be audited in chart phase.
- Removed Graph preview ready debug toast wording. Current app marker product-hierarchy-20261004-12; product CSS product-system-20261004-8; GET served/local markers matched. Restarted only active project's local preview server, exec55212, using existing production-guarded preview launcher; no Railway/worker changes.
- Full suite **419/419** passed after history-value preservation, before last context/copy edits. Latest focused product/browsing/portfolio tests **21/21** and syntax passed after context changes. Last copy/marker change syntax passed; final whole-product suite remains a gate.

Final live context check: 320px history note width ~265px, no horizontal overflow; Home/Assets/Analytics matched $45,359.24 after later enrichment. Default viewport restored and browser tab2 marked for handoff. Graph update exec94501 is running; poll before another update.

Next: consolidate dense single-gift/model rows and remaining preview overlays, then implement shared chart interaction/coverage semantics (not merely recolor). Identity states require canonical DNS documents first. Coverage ledger still contains many unverified final gates; do not mark the overall goal complete.

## Latest request — 2026-10-04, no visible mock-price wording

- Audited gift/detail provenance and app markup: current visible labels are Reference and Floor history; internal mock identifiers remain for cache isolation and production guards. Temporary gift prices remain local preview data, not restored live pricing.
- Added regression coverage for old cached Mock prices / Mock UI preview / UI Preview provenance and absence of the old banner. Gift preview tests **7/7** and app syntax passed. No pricing, backend or UI-layout changes in this request.
- Previous searchable-filter-sheet continuation is implemented in app/index/product CSS and was browser tested for gift model selection, sticker format selection, empty choices, closing/focus restoration and 320px overflow. Full suite was 415/415 before final small palette/scroll/CSS fixes; focused tests passed afterward. Final keyboard audit found Shift+Tab from the close button can leave the dialog: fix and verify focus wrapping next. Do not treat the filter-sheet or overall redesign as complete.
- Current markers: app product-hierarchy-20261004-8; product CSS product-system-20261004-6. Graph update running as exec session 61310; check completion before another update.

## Latest continuation — 2026-10-04, collectible browsing and honest summary states

Goal remains active and incomplete. Original attachment reread; previous continuation classified progress from actual source changes and live nested validation. A route/state coverage backlog now exists in `docs/FOMO_REDESIGN_COVERAGE.md`; do not mistake visited routes for completed final audit gates.

- Gift/sticker filter options now derive from actual groups and child holdings, rather than sample Diamond Ring/Hypnotoad options. Child traits/attributes/direct values match; colon-bearing values are not truncated. Unknown status is not classified as Listed. Selection survives refresh/removal rather than silently broadening results.
- Search uses shared member text including formats, editions, identifiers and trait arrays. Filters intentionally return matching collections/brands, not a fabricated subset valuation; result counts explicitly say in matching collections/brands. Keep this distinction when implementing richer filters.
- Added meaningful no-match state with Clear search and filters, resetting both controls and returning focus to search. Search fields no longer squeeze between count/coverage badges: counts are below the input with polite status. Coverage counts actual priced/estimated gifts, replacing misleading fetched/valued debugging text.
- Summary banners no longer invent default zero P/L; P/L appears only when priced groups all have known basis/P/L, while nonzero recorded daily change remains compact metadata. Individual performance information retained. No pricing API/backend contract changed.
- Browser verified Beehive child filter returns Ice Creams (75 gifts in one matching collection); impossible query → empty → clear restores all 59 collections and focuses giftSearch. At 320px search width ~195px, no horizontal overflow. Sticker dynamic formats/brands and empty/reset/focus passed. Default viewport restored. Final shared search-helper refactor afterward passed behavior tests, not a separate browser reload; verify child search again in final audit.
- Full suite **412/412** passed before final shared-search refactor; final syntax plus browsing/product tests **13/13** passed. Newly added test/collectible-browsing.test.js covers real extracted behavior for child fields/traits, status, colon values, escaped dynamic options, selection preservation, search and recovery states. Latest complete suite still needs rerun after future changes.
- Served markers match active index: app product-hierarchy-20261004-6; product CSS product-system-20261004-4. No worker/deploy/billing/server restart changes.

Next: replace hundreds of native gift filter choices with a searchable shared filter sheet and verify all sorting paths; reduce dense individual metadata and finish preview overlays. Then fix main financial value/history semantics, implement the shared chart experience, identity state presentation after reading canonical DNS docs, and finish every pending coverage-ledger gate. Final overall redesign remains unproven.

Graph maintenance: `graphify update .` is running as exec session **23838**, started after tests completed. Poll this handle before starting another graph update. No other test/server sessions are pending.

## Latest continuation — 2026-10-04, Assets and collection row hierarchy

Goal remains active and incomplete; original attachment reread. Previous turn was progress (authoritative root UI changes and browser evidence), not a blocker.

- Assets now has one prominent total and two quiet metadata columns; removed the decorative non-action arrow. Removed hardcoded initial asset count/value/fictional top holding; top holding stays hidden until populated, then retains collection/detail routing.
- Gift/sticker collections and models now use shared left-art/text/right-value rows with 44px art, restrained 14px values and shared metadata. Collection totals say Holding value (including partial/estimated constituent information), not a single Floor. Collection summaries no longer inherit a misleading Floor source heading. Root gift rows show actual model count; nested model rows lead with model name and backdrop count, not the first child's backdrop presented as a group identity.
- Removed duplicate aggregate estimate pills/model estimates; individual estimate information remains available. Gift row performance is compact metadata only when an actual daily delta or known cost basis/P/L exists; unsupported default zero P/L is not shown. Summary banners still have unsupported zero performance and need audit. No backend valuation contract, ingestion or calculation changed.
- Contextual back labels use saved route titles, including same-screen collection → model navigation. Browser verified Back to Goodies, Back to Ice Creams and Back to Gifts, and actual back restores the correct preceding route.
- Browser: Assets → Stickers → Goodies → Teddie Xmas detail → Pack Details expanded Format/Edition/Owned; chart unavailable and sales empty states remain truthful; dock hidden in detail. Assets → Gifts → Ice Creams → Beehive → Back to Ice Creams verified after final source changes. At 320px, no horizontal overflow in collection/model rows. Dense individual rows still reach 141–157px due to long provenance/model-estimate metadata; consolidate secondary details further rather than accepting this as final polish. Default viewport restored.
- Full suite passed 405/405 then 406/406 after performance metadata work. Final collection/model copy changes afterward passed syntax and 19 focused tests; latest product tests 7/7 include actual extracted-function behavior for aggregate notes, route titles, unsupported P/L and collection identity. Full suite remains a final future gate after the remaining redesign.
- Served markers matched active workspace: app product-hierarchy-20261004-5, product CSS product-system-20261004-3. No worker/deployment/billing/server-start changes.

Next: complete collection search/filter/sort (gift filter options are still hardcoded examples; trait filters currently inspect only group traits), preview sheets, responsive dense individual rows and quiet summary states. Then fix Home/Assets value mismatch and enrichment-induced performance jumps, complete chart interactions/state preservation, identity states (read canonical DNS docs first), all remaining screens/nested states and whole-product audit. Do not claim completion based on these focused passes.

Graph: sessions 75935 and 24207 completed. Latest graph has 6051 nodes/11493 edges; no pending graph process. Optional tree_sitter_sql missing is an existing graph limitation, not a reason to install dependencies for this UI task.

## Latest continuation — 2026-10-04, stationary holdings and Analytics hierarchy

Goal remains active and incomplete. Previous label-removal turn verified existing work; this continuation changes authoritative UI structure. The full original attachment was reread before proceeding.

- Replaced Home's duplicated moving gallery with five stationary holding rows ordered by value across all eligible wallet asset categories. Candidate deduplication/real artwork/detail routes remain; removed the earlier category-round-robin truncation before ranking. Added View all → Assets. Values and metadata use shared tabular typography and 44px artwork / 72px rows.
- Removed the second Analytics total and its obsolete DOM write. The existing chart, snapshot state, performers, P/L and allocation remain working.
- Actual browser check exposed inherited three-row grid and oversized viewport from the old carousel. Corrected both, plus oversized legacy artwork. Default viewport rows measured 350×72px; 320px viewport rows measured ~265×72px with no horizontal overflow. Default viewport restored; tab retained for continuation.
- Browser verified Home holding → Citrus gift detail → contextual back restores Home; View all → Assets; Analytics shows one total and populated chart/statistics/mix. Detail back action works but its static accessible name still says Back to assets even when returning to Home: fix during shared navigation pass.
- Full Node suite passed **403/403**, log `.tmp/product-system-full-test.log`, without graph extraction competing for CPU. After the final candidate flattening/CSS corrections, syntax plus focused Home/product tests passed **8/8**. Full suite should be rerun after further implementation, not treated as final whole-product completion evidence.
- GET / JS/CSS markers matched active index: app `product-hierarchy-20261004-3`, product CSS `product-system-20261004-2`. No server relaunch, deployment, worker or billing changes.

Next: finish Assets category/collection holding semantics and Analytics quiet metrics; verify sticker detail/disclosures/media; unify contextual back names, sheets/search/filter and state preservation. Then implement chart interaction/value consistency and identity state presentation (read canonical DNS docs first), remaining nested flows, responsive/accessibility audit and final whole-product verification. Home headline currently differs from summed allocation/Assets by sticker value; investigate value presentation rather than hiding the discrepancy. Mock-enabled historical portfolio movement visibly includes enrichment jumps; do not treat that chart as proof of accurate performance.

Graph maintenance: older session 53869 completed before this continuation. New `graphify update .` is running as exec session **75935**; poll that handle before starting any other graph update.

## Latest implementation — 2026-10-04, shared foundations and nested detail order

Goal remains **active and incomplete**. Original full brief read from attachment `1ad72d20-0adb-4b28-8fda-e4420bfa5faa/pasted-text-1.txt`; do not narrow completion to these initial changes. Previous continuation produced authoritative edits and live evidence (progress), not a wait or blocker.

- Latest user addition implemented: no visible mock-price/UI-preview wording. Fixture marketplace labels are neutral `Reference`; floor history says `Floor history`; internal `preview`/source/API header markers and production/loopback guards remain unchanged. Cache namespace bumped to v3 so earlier labels cannot restore. Restarted from the exact active workspace and verified served markers plus API labels. Browser collection → preview sheet → individual detail showed neutral labels; rendered body had no `mock`/`UI preview` text. Image-preview sheet labels remain because they describe artwork previews, not prices.
- Final 320px check: both currency buttons have 44px height and identical vertical position; no horizontal overflow. Default viewport restored. Sticker-specific final hierarchy verification remains pending.
- Final concurrent full-suite rerun: 401/402 passed; the existing wall-clock wallet presentation test exceeded its strict 150ms threshold while graph extraction and tests competed for CPU. Isolated rerun passed in 33ms without changing its assertion. This is NOT a green final full-suite claim; rerun the full suite without simultaneous graph extraction as a final gate. After the visible-label change, 14/14 focused gift/product/loading tests passed. Preserve this outstanding gate.

- Product direction is recorded in `docs/FOMO_PRODUCT_DESIGN_DIRECTION.md`, translated from actual Fomo observations rather than website screenshots. Root hierarchy, chart interactions, remaining sheets/secondary states and final audit are still pending.
- Added `styles-product-system.css` as centralized portfolio typography/spacing/control/surface foundations, loaded after legacy layers. Transitional specificity bridges remain; consolidate/remove superseded legacy rules as migration advances. Onboarding media/flows untouched.
- `portfolio-system` body opt-in disables the terminal LED MutationObserver and numeric DOM expansion. Financial values remain readable tabular text. Shared page gutters, headers, rows, controls, focus and reduced-motion rules introduced.
- Gift/sticker detail hierarchy helper keeps all existing real sections, moves value before traits, chart and recent sales immediately after the hero, then puts collection/pack/demand/origin metadata in state-preserving native disclosures. Deep asset details hide the root dock and retain contextual back routing.
- Actual Top asset route audit exposed group totals being opened as a single gift floor alongside one item's chart. Gift/sticker top holdings now route to collection/brand pages; native/jetton/identity top holdings still route to details.
- Additional live audit: loaded hGRAM detail after its skeleton settled; gift preview tray → Beehive #261069 → gift detail; populated Analytics; Settings → Price alerts (currently goes to Watchlist); Settings → Manage wallets. Remaining defects include incorrect collection-total 'Floor' labels, stale chart-derived main token values, duplicated Analytics totals, developer-facing copy, wallet summary count/value discrepancies and inconsistent sheet focus/back labels.
- Browser verified the corrected Top asset → Ice Creams collection route, gift preview navigation, value → chart → sales reading order, Collection Stats expansion with actual existing content, hidden dock, removed decorative hero pseudoelements and charcoal background. At 320px: no horizontal overflow, chart/header fit; currency controls stacked vertically and were corrected afterward. Final narrow-control recheck is pending. Default viewport restored.
- Full suite passed **401/401** after fixing two extracted-function VM harnesses to test both live/mock cache namespaces. Log `.tmp/product-system-full-test.log`. Then bounded token warmup to two leaders rather than 24; additional assets warm on hover/focus, with shared request dedupe retained. Latest focused loading/product tests passed **8/8**, including this new behavior; final full-suite rerun after the last prefetch change remains a final audit gate.
- Server remains local mock-gift mode only; served JS/CSS markers matched active index after new stylesheet/version markers. D1 valuation service errors remain real, unresolved external-data limitations, not a UI completion claim. No worker, billing, deployment or plan changes this continuation.

Exact next work: recheck the final narrow currency controls and a sticker detail/disclosure; finish accessible nested media/sheets/filters/connection states; then implement Home/Assets/Analytics structure and quieter holding rows (not merely these foundation overrides). Complete shared chart scrubbing and state preservation, identity state presentation (read both DNS canonical documents first), all responsive/accessibility states, full test rerun and entire-product visual audit. Never declare the full redesign complete from green source assertions.

Pending verification command: `graphify update .` (PowerShell via saved interpreter), exec session **53869**, confirmed running and AST extraction finished. Poll the same handle before starting another update. After it completes, run the final full Node suite without simultaneous graph extraction; do not restart work solely because polling times out. Narrow currency controls are now verified as described above; next live route is sticker brand/pack detail and its disclosure/media states.

## Latest continuation — 2026-10-04

The Fomo research recorded below is complete to the user's stopping point. The full product redesign remains **incomplete**; do not repeat older pre-Fomo steps as if they were current.

- Removed the global yellow UI-preview banner as requested, retaining local mock-gift opt-in, isolated caches and API/chart provenance. No production mock deployment or Railway changes.
- Continued populated live audit: Assets → Stickers → Goodies → Teddie Xmas #3 pack/detail; DNS → damx.ton; Anonymous Numbers → +88803917624; Usernames → @buygram; Tokens → native GRAM → Day/Week. Earlier gift collection → model → individual detail coverage remains valid. Wait for asynchronous data to settle, including GRAM chart periods, before assessing loaded hierarchy.
- Remaining observed issues: duplicated category/detail totals and containers, differing sticker hierarchy, unpriced identity roots showing zero-valued summaries, duplicate token refresh controls, and chart-specific loading metrics blanking during period changes. DNS valuation changes require reading both canonical DNS documents first. Missing valuation evidence must never be presented as a verified zero price.
- First loading fix implemented: contract/range cache keys no longer depend on changing chart prices; foreground and prefetch requests share the same promise; rejected requests are evicted; previously loaded market/network statistics stay visible during chart-period loading; native GRAM chart/market/network sources run concurrently. Chart data is still period-specific and stale responses remain guarded.
- Verification: app.js/server.js syntax checks; 17/17 focused tests passed (token loading including optional-source failure, GRAM presentation, mock gifts, cleanup pause). Active server restarted from this exact workspace; GET / JS/CSS markers matched index.html and confirmed banner removal with mock mode still enabled. Browser verified loaded GRAM Day, retained market/network statistics during Week loading, completed weekly data, and Day → Week cache revisits without blanking chart metrics. No measured end-to-end speed claim yet.

Next: finish remaining populated nested routes (jetton details, other sticker/media and gift tray paths, sheets/modals), record loading/error/empty and responsive behavior, synthesize the redesign structure from actual Fomo observations, then implement shared hierarchy/navigation/chart/components. Re-audit the entire product afterward. Do not call this first performance fix or source inspection completion of the redesign.

Date: 2026-10-02 (Asia/Colombo)
Status: **Fomo observation session completed to the user's requested stopping point; TonTrack redesign implementation pending.**

## Latest Fomo observation — 2026-10-02

The user authorized studying the open real Fomo Android app while D1 awaited reset, then stopped further exploration with “I think that's enough.” Actual scrcpy/ADB observation has now occurred and supersedes the older pre-Fomo pause and no-observation statements below. Read `docs/FOMO_MOBILE_OBSERVATION_LOG.md` for the detailed screen map, shared-system observations, directly verified chart scrubbing, nested profile/position/clan/history/settings flows, and explicit coverage gaps. No financial transaction, asset movement, follow/like/invitation, profile edit or security/notification change was submitted. No TonTrack redesign implementation was made during this observation session.

Next work: synthesize the observed model against TonTrack's actual product; finish the populated TonTrack nested-route audit before committing the redesign structure. D1 root-cause query changes are deployed but post-reset consumption and live pricing remain unverified; see `docs/D1_ROW_READ_CHECKPOINT.md`. Preserve those verification gaps. Do not resume Fomo device input unless the user requests it.

## Goal and boundaries

Implement the user's complete product-redesign brief in the real functioning TonTrack application. First understand TonTrack; then extensively study the actual Fomo Android application mirrored through scrcpy. Fomo's mobile experience, not its website or internet screenshots, is the primary benchmark. Transfer design/interaction intelligence, not proprietary code, assets, branding, trading or social features.

Never transact, buy, sell, withdraw, or move assets in Fomo. Do not decompile it or extract proprietary binaries/source/bundled assets. Safe visual navigation, charts, search, profiles, read-only details and sheets are in scope. ADB may support visual/state investigation.

After studying both products, reconsider TonTrack's structure, navigation, grouping, density and hierarchy—not merely its theme. Centralize typography, spacing, surfaces, radii, icons, rows, financial values, buttons, tabs, sheets, charts and states. Improve chart dimensions, placement, timeframe switching, scrubbing, selected values, loading, caching and stability. Preserve working backend/data/API/calculation/authentication behavior; never replace real data with fake screenshot data. Improve navigation/state preservation, rendering, image stability, loading and responsive behavior. Validate repeatedly against the real Fomo app and revisit every TonTrack screen, nested route and state before calling the work complete.

The previous Home-as-immutable-standard requirement is superseded for this redesign: the user expressly allows rethinking Home and the entire product after research.

## Resume order

1. Finish and verify the in-progress asset-discovery repair below. Do not report it fixed based on edits alone.
2. Remap TonTrack with actual populated holdings. Inspect **every nested Assets screen**, not just category roots. Record inaccessible states explicitly; do not pretend a code read equals a live interaction.
3. Complete TonTrack current-state audit: screens/routes, components, API/data dependencies, loading/error/empty/selected states, charts, navigation/back/scroll preservation, modals, settings and performance.
4. Only then begin the first Android/Fomo observation. The user asked to pause just before this stage. No Fomo observation or interaction has occurred yet.
5. Extensively explore Fomo safely: primary/secondary/context navigation, asset/profile details, charts/timeframes/scrubbing, search, menus/sheets, back/tab state preservation, scrolling, loading and motion. Separate directly interacted, visually observed, externally researched and inferred findings.
6. Build a recurring design/interaction model; compare it against TonTrack's actual purpose and data. Document product direction before implementation.
7. Refactor shared design system; rework structure/navigation, major experiences, charts, secondary screens/flows and all nested views.
8. Run focused/full tests and responsive/accessibility/performance checks. Interact with the redesigned real app, return to the relevant real Fomo views whenever uncertain, and refine the entire product until cohesive. Do not mark complete while it is merely an old UI with a new skin.

## Current workspace and audit

- Sole active repo: `C:\Users\vishu\Documents\New project\ton-portfolio-chart-platform`.
- Branch: `codex/chart-platform-rebuild`; extensive existing dirty worktree. Preserve unrelated changes. No commits/deployment made for this task.
- Vanilla JS/HTML/CSS, Node server; `app.js` rendering/navigation, `index.html` route shells, three layered stylesheets, `terminal-system.js` display treatment, Chart.js wrapper `chart-platform.js`.
- Server started via `node server.js` in the absolute active directory; terminal session at pause: `54965`. It still runs the **pre-edit** server code until restarted. Local JS/CSS version markers matched active `index.html` on startup. Recheck on resume; do not assume a session survives.
- Browser: in-app browser ID `2`, audit tab `1`, URL `http://127.0.0.1:5177/`. Read-only saved wallet restored automatically as `damx.ton`, address `UQDZKXvosTl0BsTpEqSg1kZi51daw5Bik4tMhz7JN9lV3HPq`. Do not assume this equals a previously resolved address from older sessions.
- Inspected live: Home portfolio/chart/highlights/allocation/activity; Assets category hub; token list; GRAM detail and week timeframe; Analytics; empty Watchlist; Settings; Wallets; wallet action sheet; full Activity and transaction detail sheet; Gifts and Stickers root empty screens; DNS/number/username root loading screens.
- Observed issues (not design decisions yet): repeated portfolio totals, competing containers, oversized centered detail hero, uneven chart structures, cluttered sort/filter/coverage metadata, some static/demo-like gift filter options, dot-matrix financial hierarchy competing with headings, bottom-nav selected-indicator alignment/overflow, transient overly dim screen appearance. Investigate rather than assume each cause.
- Complete nested route inventory from current source: `home`, `assets`, `tokens`, `gifts`, `gift-brand` (collection and separate `gift-model-group` route mode), `stickers`, `sticker-brand` (brand → pack), `dns`, `anonymous-numbers`, `usernames`, `detail` (native token, jetton, gift, sticker, each identity type), `analytics`, `watchlist`, `activity`, `wallets`, `settings`. Also wallet connection/import states, token-sort popover, wallet actions, transaction sheet, gift/sticker media/PFP trays and detail-specific charts/sections.
- Collection/model/individual gift and sticker routes and identity details were **not live-inspected yet** because ownership was missing/loading. They must be remapped after the repair. Code renderers include `renderGiftBrand`, `renderGiftModelGroup`, `renderGiftIndividualItem`, `renderStickerBrand`, `renderStickerBrandItem`, `renderIdentityAssetDetail`, `renderGiftDetailPage`, `renderStickerDetailPage`, `renderAssetDetail`.

## Asset-loading repair: implemented edits, NOT VERIFIED

User explicitly interrupted the audit to request fixing missing gifts/other assets and mapping again. No redesign edits have been made.

Evidence:

- Local `GET /api/collectibles?address=UQDZKXvosTl0BsTpEqSg1kZi51daw5Bik4tMhz7JN9lV3HPq` returned HTTP 200, all categories empty, and error `TonAPI key is not configured; TonAPI key is not configured; toncenter-wallet-nfts timed out after 12000ms`.
- Direct public TonAPI `/v2/accounts/<same address>/nfts?limit=1000&indirect_ownership=true` returned HTTP 200 with **310 NFTs**, including Telegram Usernames, TON DNS Domains and gift collections. This is real discovery evidence, not mock data. Do not classify every NFT as a gift/sticker.
- `walletNftsByType()` disabled both TonAPI ownership reads without a key. Remaining TonCenter discovery timed out. `updateCollectiblesFromGetgems()` interpreted empty payload rows without rejecting `payload.error`, producing misleading no-assets states.

Unverified edits currently in active worktree:

- `server.js::walletNftsByType`: without a key, skip the redundant direct-only query using fulfilled empty direct result and run indirect+direct public ownership via existing paced TonAPI queue (`immediate: Boolean(tonApiKey)`), bounded at 20 seconds. Authenticated direct request remains bounded at 10 seconds; independent TonCenter request remains 12 seconds. Indirect query includes direct ownership; verify coverage/pagination and queue pressure before claiming robustness.
- `app.js::fetchWalletCollectiblesPayload`: reject `payload.error` immediately so shared verified-cache fallback or explicit error state is used instead of authoritative empty rows. Ensure legitimate partial ownership results are not discarded and every caller handles the result consistently.
- No syntax checks, new regression tests, browser verification, post-edit server restart, or graph update have run for these edits. The earlier 381-test pass belongs to the **previous** import-crash fix, not these edits.

Exact next implementation checks:

- Inspect/test no-key NFT discovery, provider timeout/rate limits, successful empty ownership vs discovery failure, same-wallet cache retention, wallet switch isolation, and pricing failures not hiding owned NFTs.
- `test/wallet-token-coverage.test.js` currently contains source assertions for the three concurrent NFT-provider results; preserve/update these deliberately and add executable regressions rather than only regex checks.
- Assess full request latency: frontend collectible timeout 30 seconds, public ownership bound 20 seconds plus price/valuation enrichment. `walletNftsByType` currently awaits `tonUsdRate()` before discovery; avoid pricing latency consuming ownership budget. Do not extend every timeout blindly or generate guessed prices.
- Existing public queue is paced 4.2 seconds without a key. Determine whether background traffic can starve ownership. Verify discovered 310 NFTs and nested category counts with actual API and UI, not just source edits.
- Server `getCollectibles()` already uses bounded 5-second gift pricing and 4-second DNS/username valuation fallbacks to classified assets. Remote failures must leave ownership visible and values honestly unavailable.
- Read canonical TON DNS source/implementation documents before changing DNS discovery/UI states. These were read during this turn, though some tool output was truncated; re-read any missing ranges on resume. Do not alter estimator rules/calibration for a discovery fix.
- Run `node --check server.js`, `node --check app.js`, focused tests and full `node --unhandled-rejections=strict --test test/*.test.js` as appropriate.
- Stop listener 5177 and restart `node server.js` from absolute active project before testing changed backend. Request root and compare JS/CSS version markers with `index.html` before reporting live.
- Run `graphify update .` after code verification; no API/LLM cost for AST update.

## Railway: read-only evidence, no changes

The user noted many Railway services are turned off. Do **not** resume services, deploy, alter subscriptions or incur usage charges without new explicit authorization. Historical permission to resume username ingestion alone is not blanket permission for all services.

`railway status --json` for the linked project reported zero active deployments for: `dns-d1-ingest-cron`, `telegram-floor-worker`, `Postgres`, `lockin-trade-bot`, `TonTracker`, `overflowing-enjoyment`, `gallant-charisma`. Latest deployments for `dns-d1-ingest-cron`, `TonTracker`, `gallant-charisma` were FAILED/stopped; others had no latest status shown. This describes the linked project only, not every Railway project/account service.

Remote Cloudflare identity baseline/evidence requests returned HTTP 500 during startup. This is separate from NFT ownership discovery. Do not blame every Cloudflare failure on Railway without tracing dependencies. Stopped workers can affect freshness/pricing; they must not make ownership disappear.

## Android/Fomo access: discovered only, not observed

- Computer Use skill initialized `@oai/sky` in `node_repl`; `sky.list_apps()` returned one running scrcpy app/window.
- Returned app ID: `process:C:\Users\vishu\AppData\Local\Microsoft\WinGet\Packages\Genymobile.scrcpy_Microsoft.Winget.Source_8wekyb3d8bbwe\scrcpy-win64-v4.1\scrcpy.exe`.
- Returned window ID `198302`, title `AC2001`. Re-discover current returned app/window before acting; IDs may change.
- No `sky.get_window_state`, activation, click, drag, keyboard input, ADB or Fomo screenshot was performed. Pause is exactly before actual Android inspection.
- `adb` was not on PATH when checked; an existing scrcpy installation may contain it. Do not install/decompile anything merely to study UI.
- Skills used: graphify (existing graph), userinterface-wiki, Computer Use. Read required Windows guidance/API/confirmation documents and current browser documentation on resume. Do not automate terminal apps via Computer Use.

## Completion status

## Latest continuation: ownership verified; pricing blocked by D1 quota

This section supersedes the earlier unverified repair and immediate-pause notes. The user clarified that work should continue on TonTrack and pause only immediately before actual Fomo inspection. No Fomo observation has occurred. TonTrack nested-route audit is still incomplete.

- NFT discovery now uses the public paced indirect-ownership request without a key, preserves supported holdings when optional valuation fails, canonicalizes NFT addresses to prevent duplicate holdings, and treats successful empty discovery separately from provider failures.
- Frontend collectible error payloads now use same-wallet verified-cache fallback instead of clearing holdings. Three executable regressions cover canonical deduplication, wallet-cache isolation and public no-key discovery.
- Syntax checks for server.js and app.js and focused 34/34 wallet tests passed. Full strict unhandled-rejection suite passed 384/384. Graphify AST update completed (5958 nodes, 11384 edges).
- Active server was restarted from the absolute active workspace; HTTP root JS/CSS markers matched index.html. Current terminal session: 19918, port 5177.
- Actual current wallet ownership API and UI show 250 gifts, 5 stickers, 9 DNS domains, 21 usernames and 1 anonymous number, with no canonical duplicate NFT contracts. Ownership is verified; pricing is NOT fixed.
- Pricing diagnosis: POST /collection-combos returns HTTP 500 / Cloudflare error 1101 while /health returns 200. Read-only Wrangler tail confirmed exception: D1 free-tier daily row-read limit exceeded; provider instructs waiting until midnight UTC or upgrading. Tail session 69864 was stopped. No Railway services, subscriptions or production deployments were changed.
- Local getCollectibles also returns unpriced classified gifts after its 5-second valuation deadline while background lookup continues, leaving missing floorStatus interpreted as loading by the frontend. This needs explicit terminal/recovery handling; do not fabricate prices, reuse stale prices as live, or relax backdrop listing gates.
- Next: repair quota/error propagation and bounded price refresh behavior, investigate excessive repeated collection/alias/detail reads and caching/index efficiency. Live price verification cannot pass while the provider quota remains exhausted. Any paid-plan change requires explicit user direction. Then finish populated nested asset-screen audit and pause BEFORE observing the Android/Fomo app.

**Incomplete.** The user revoked the premature pause: continue TonTrack repair and baseline audit, then pause immediately before Fomo inspection. Ownership repair is verified; live pricing remains blocked by the confirmed D1 quota failure. Real Fomo research has not started, the design model is not decided, and redesigned UI is not implemented. Resume from the latest continuation above, not from an old estimator goal or handover.

## 2026-10-02 pricing and alert continuation

- User asked to turn off `usecert-alerts` and fix all asset-price displays. Cloudflare dashboard: deleted its sole every-minute cron trigger, saved, reloaded, and verified **No cron triggers configured**. Worker and account plan remain intact; no Railway changes.
- `server.js`: public TonAPI account fallback now allows wallet balance imports without a key; removed hardcoded 3.12 TON/USD fallback. `app.js` starts with no guessed TON rate and guards GRAM conversions when the rate is unavailable. Live `/api/wallet` after first restart showed 175.88165424 TON, verified TON/USD 1.57, 46 jettons, 25 accepted jetton prices. Unpriced jettons remain unavailable rather than fabricated.
- Gift pricing: unavailable timeout now has an explicit terminal status; registry collection/direct reads run concurrently; stale exact floors are rejected; healing and sales-target writes do not run when the registry read is unavailable; failed registry reads receive a 30-second cooldown. The gift deadline is 8 seconds and unresolved gift responses re-cache for 60 seconds instead of five minutes. These edits need a **second server restart** before live verification.
- Sticker pricing: July 2026 snapshot remains usable for classification/media but cannot present a current floor; only snapshots with a verified `updatedAt` in the last hour may price assets. Live sticker detail lookup for Pepeton/PEPALGAR returned no current floor, so displaying unavailable is correct; do not substitute a collection/name-only or stale price.
- Live `/api/collectibles` after first restart showed 250 gifts, 5 stickers, 9 DNS, 21 usernames, 1 anonymous number; all gift/sticker/identity prices unavailable. This is **not fixed**: D1 registry still returns 500/error 1101 due 222.66M/5M daily reads at last dashboard check. Both current D1-backed pricing and production verification remain blocked until quota reset or an authorized capacity change. The identity-ingestion knowledge queue has expensive market-priority scans every minute; root-cause mitigation/deployment still pending. Do not claim the full pricing request completed.
- Focused syntax and 55 asset-related tests passed after latest edits; full strict suite was started and requires final result. Run `graphify update .` after tests. Restart only the active workspace's port-5177 server, compare root JS/CSS markers to `index.html`, then recheck live wallet/collectibles. Preserve all unrelated dirty files.
- Final local verification: strict full suite **384/384 passed**, graphify update succeeded (5960 nodes/11387 edges), and the server was restarted from the active workspace on port 5177 (terminal session `24783`). Root JS/CSS markers match `index.html`. Live wallet response now returned 175.88165424 TON, TON/USD 1.58, 46 jettons and 25 accepted jetton prices. Collectibles response still returned all 250 gifts as explicitly unavailable, plus 5 stickers, 9 DNS, 21 usernames and 1 number. Reloaded UI Assets category shows the token value and counts for unavailable categories (no stale sticker total); Gifts shows `Price unavailable` while 250 gifts remain navigable. Full live pricing remains incomplete due the external D1 quota outage. Do not mistake passing tests for live D1 verification.
## User-authorized pre-Fomo presentation restoration — 2026-10-05

This is the latest direction and supersedes the Fomo redesign implementation plan below. User confirmed restoring the whole application's pre-Fomo UI while retaining later wallet, pricing and backend fixes. Do not reapply Fomo or Vaulta design work automatically.

- Recoverable frontend backup: `.tmp/ui-restore-before-fomo-20261005/` contains the eight original JS/HTML/CSS files before this restoration.
- Restored the original Git-recorded Home composition (graph → featured carousel → allocation → movers → activity) and Analytics composition; retained the pre-Fomo terminal/product-v2 styling and existing August/September consistency fixes. No clean October 2 commit exists: these are selective presentation restorations, not a wholesale checkout of old application logic.
- Disabled the Fomo `portfolio-system` body opt-in and its stylesheet; retained the stylesheet on disk. Legacy LED values now render again. Native collectible sort/filter selects restored. Gift/sticker details no longer get reordered or wrapped in disclosures. Existing rendering, model-estimate evidence and data guards remain intact.
- Retained current imports, cached/provider requests, estimates, history integrity, exact gift identity rules, asset counts, accessible modal lifecycle and financial unavailable states. Added only a small legacy-compatible modal/control CSS bridge. Home retains the truthful snapshot coverage note, rather than undoing a data-accuracy fix to mimic older misleading chart context.
- Home mover selector restored to Home after its Analytics-only relocation. Analytics displays the accurate aggregate holding count and current total using the retained current data inputs.
- No server, API, worker, Cloudflare, Railway, pricing contract or deployment code changed. Existing local server reused; GET JS/CSS markers matched the active `index.html`. Final cache namespace: `pre-fomo-20261005-2`.
- Verification: syntax passed; final focused checks **37/37**, prior UI check **44/44**, full Node suite **439/439**. Five assertions requiring the now-rejected Fomo composition were updated to assert the requested original composition; data and interaction tests remain active. Optional Fomo disclosure behavior is still unit-tested behind its opt-in.
- Browser directly verified loaded original Home and Analytics, Assets → Gifts with native selectors, and Crystal Balls → Electric Shock → expanded collectible detail. Unavailable gift prices remain a real upstream limitation; no invented replacement prices. This was a focused restoration check, not a new all-route design audit.
- Graph refresh started as session **38132** after the full suite; await its completion before another update. No goal completion is inferred from this UI rollback.


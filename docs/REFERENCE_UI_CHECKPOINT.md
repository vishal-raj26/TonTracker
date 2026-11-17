# Reference-sheet UI pass — 2026-10-05

## Latest scoped correction — Today and Recent activity, 2026-10-07

### Structural reconstruction after user rejected nested cards

- Today is now one split comparison surface: best/weakest label, prominent actual signed percentage, asset identity beneath, central divider. Existing per-asset click/keyboard destinations and single/unavailable-token behavior remain. Rebuilt generated content order, not just lighting. Accessible labels preserve full names despite visible truncation.
- Recent activity is now a continuous ledger inside one section with separator lines; row borders, background shells and individual radii removed. Home empty state is a centered status composition, not a nested card. Full Activity data/formatting untouched.
- Focused tests 20/20 and app syntax passed. First live review exposed old important row-shell styles; explicitly retired those for Today. Final CSS -13/app -12 matched the served active-project markers. Corrected live review at 393px confirmed two 128px unboxed comparison halves (no background image, radius or shadow), central divider and centered activity empty state. At 320px both outer cards fit the 280px content width with no component/document overflow. Today opened the actual CANNABIS detail and View more opened Activity; returned Home and reset viewport. Activity was unavailable in this final live run, so loaded transaction formatting is covered by focused tests and the earlier live ledger review, not a fresh loaded-state claim. No backend changes or fake graph/data.

### Follow-up after user rejected the plain treatment

- Replaced the unboxed Home timeline/plain mover shells with Sheet 04-inspired layered section surfaces and darker inset rows. Gradient border rims, top-left highlights, inset shadows and raised glass artwork wells now distinguish outer/inner surfaces; compact layout and data/navigation unchanged. CSS version -11 supersedes -10; app remains -10.
- Focused Home/reference tests 20/20 passed, including a new construction check. Actual wallet rendered and personally inspected at 393px; 320px row/page bounds showed no overflow (movers ~79px, activity 76px). Viewport reset. Source font/pixel identity is not claimed. No backend changes or invented charts/values.

- User requested reconstruction of these two Home sections and allowed a new design. Today now uses compact full-width mover rows with 40px artwork, real signed percentage right-aligned and existing detail actions. Home activity now uses an unboxed connected timeline; its empty state has a small icon, Wallet activity title and actual status, without the redundant Synced claim. Full Activity styling/data remains unchanged.
- Syntax and focused Home/reference tests passed 19/19, including compact empty-state and exact transaction value preservation. Live loaded wallet reviewed at 393px and 320px: no horizontal/component overflow; mover rows approximately 79px and activity rows 80px. View more opened the full Activity screen, then returned Home. Viewport override reset. Existing unavailable upstream prices remain unavailable; no backend changes.
- Local server restarted from the active absolute workspace after the prior process stopped; served CSS/app version markers -10 matched active index. Browser's old error-page tab could not be recovered; a clean local tab was opened and retained on Home. Broader app reconstruction is still incomplete.

## Latest implementation continuation — 2026-10-07

IN PROGRESS, not visually complete. Black and white are base colors only; the user's latest clarification allows colored gradients, lighting and accents. This supersedes monochrome-only requirements in the historical records below.

Completed in the active worktree: ten-sheet source register and 18-component crop/measurement atlas (`docs/reference-ui/atlas-spec.json`, generated `atlas/`); Inter/Manrope live font comparison; owned Home markup and source-sized hero (353×193), featured rows (80px/48px art), chart plot (157px), and shared dock (353×79). Home's legacy selectors in the product/terminal styles now exclude `data-ref-owned`. The burgundy hero uses a clipped text-free region of the original supplied sheet 04, with live accessible HTML values and existing Wallets/Refresh actions. Generated fold draft was rejected and is not used by the application. Existing history, allocation/counts, moving carousel, movers and activity remain.

Verification so far: app/atlas/chart syntax passed; focused reference/product/restoration tests 23/23 passed, and Home/reference follow-up tests 21/21 passed after updating old markup selectors and the readout test harness. Served frontend markers matched the active index. Live loaded Home confirms the burgundy hero (353×193), gold chart (353×157), 128px featured section and 353×79 dock. Inherited heading/badge/legend spacing was corrected. No pricing, API, valuation or worker behavior changed.

Code graph updated successfully (7,343 nodes); its tool warns that SQL parser support is missing and some community names need refresh. Full regression rerun finished with the sole failure in the old Home readout test harness (it started before that test was fixed); output is `.tmp/reference-ui-regression-20261007.log`. The corrected harness subsequently passed in the 21/21 focused run. Run `npm test` again after the next implementation milestone before claiming a fresh full pass. The first full run also exposed two stale exact-opening-tag selectors, now corrected without weakening section/order assertions.

Next: finish Home visual gate (including chart interaction/callouts, source geometry and mobile sizing), then migrate the remaining screens and ALL nested asset details using the reconstruction plan. Full regression suite and graph update remain pending. Do not treat the previous pass's test or visual claims below as completion of this reconstruction.

### Implementation resumed — shared charts and Analytics

Shared charts now draw separate source value/date pills and the dashed selection marker from the selected real observation, including zero; the redundant native tooltip is disabled in the reference system. Axis/tooltip typography uses the fitted Inter family. Category summaries use the allowed burgundy hero material; icon wells and controls now share translucent surfaces and inset highlights. Range controls are separate rounded rectangles rather than a nested capsule.

Analytics graph markup is now owned by the reference system: its historical selectors were retired in product/terminal CSS, its plot uses the 157px source height and the four existing metric cards remain in their two-column grid. Analytics adds existing timestamp/value formatters to shared chart presentation. No new screen or feature was added. Focused chart/reference/product/Home checks: 34/34 passed. Full suite rerun is active; log `.tmp/reference-ui-regression-20261007.log`.

Independent critic could not access this session's in-app browser and is reviewing source/geometry only. Main-agent live pixel verification is still required; do not record its review as an independent rendered-screen audit.

### Verified shared-component milestone

Full suite passed **447/447** (`.tmp/reference-ui-regression-20261007-final.log`). Subsequent small presentation fixes passed their focused suites: 23/23 chart/Home/reference and 19/19 reference/product checks. These fix the Home callout's redundant "portfolio" suffix/GRAM formatting, Analytics' inherited green metadata pill, source row weight and the gift change badge when there is no verified floor.

Live checks at a 393×852 browser viewport: Home keyboard chart selection displayed the actual selected date/value with separate source pills; carousel card/viewport widths matched (338.39/338.40 with the desktop scrollbar gutter then present), with no document overflow. Analytics plotted at 157px with four 132px metric cards in two columns and no overflow. Assets category navigation, Gifts → B-Day Candles collection → Choco Wax individual gift worked. Individual gift retained compact 96px media, traits, model estimate, Collection Stats, supply/ownership, history, sales, demand and origin. Live exact gift floors remain unavailable; do not claim priced-state verification from this wallet.

Critic source review found carousel viewport sizing and narrow artwork-column defects; fixed with a carousel inline-size container/100cqw cards and consistent 48px narrow grid columns. Dock materials now include source-style highlights and the violet light on the existing central Analytics destination. The critic could not independently inspect live pixels. Latest root-scrollbar styling removes the desktop gutter to allow a true 393/353 source comparison; this final geometry change needs live recheck.

Still incomplete: every remaining nested asset/detail family and overlay visual audit, 320–430 responsive audit, final reference comparison and legacy ownership cleanup. Resume from this milestone, not from the prior plan-only entry.

## Latest continuation — 2026-10-07 research and reconstruction plan

The user rejected the current visual fidelity and requested proper research and a plan before more implementation. All ten sheets were re-opened; the current app and all 16 screen containers/dynamic detail families were mapped. No application code was changed in this research turn.

**Current implementation plan:** `REFERENCE_UI_RECONSTRUCTION_PLAN.md`. This supersedes the earlier override-first method and visual-completion assumptions below. The new pass is **NOT IMPLEMENTED / NOT COMPLETE**. It requires a canonical source-crop/measurement atlas, font/material calibration, real hero-art reconstruction, component markup reconstruction, and staged removal of legacy visual ownership. Home is the first visual gate; all nested asset and overlay states have separate checklist entries.

Next step: produce the atlas and lock canonical geometry/type/material targets, then reconstruct Home and compare against the selected source crops before rolling out. The research plan documents source conflicts and which unseen states need composition from matched primitives. Prior test passes remain historical functional evidence only, not proof of visual accuracy. See the plan's final verification section for safe test commands.

Planning verification: all 16 current screen keys represented; all 10 sheets registered; 18 component contracts and 45 screen/state checkpoints. Independent read-only plan critique found no blocking issue; its renderer-traceability improvement was incorporated. App tests were not rerun for documentation-only changes. Browser returned to Home; no wallet settings changed.

## Current brief / source of truth

**New request: exact component reproduction, not interpretation.** See
`REFERENCE_UI_BRIEF.md` for the approved measurement/conflict/verification rules.
The previous pass below is historical verification, not proof that the new
exact-reproduction pass is complete.

The user's ten October 5 reference sheets govern visual presentation, not product structure.
Preserve all existing screens, sections, features, data contracts and real financial states.
No trading execution, deposits, withdrawals, chatbot, new health/risk scores, or product restructuring.
Monochrome palette, graphite material, 20px gutters, 24px large cards, 16px inner surfaces,
white selected pills, outline icons, clear typography and restrained chart presentation.

The previous pre-Fomo restoration is the layout baseline. The `portfolio-system` opt-in
must remain off: it changes collectible detail grouping. No Fomo detail reordering is enabled.

## Component mapping

| Existing area | Reference equivalent | Preserved content / behavior |
| --- | --- | --- |
| Home | Portfolio hero, chart, cards, section rhythm | History/ranges/refresh, featured carousel, allocation donut, movers, activity |
| Assets | Portfolio metrics + asset rows | All six category routes and counts |
| Tokens | Summary + compact asset rows | Real logos, balances, sorting, refresh, token details |
| Gifts / gift collection / individual gift | Summary, filters, asset cards, metric/chart cards | All traits/filter options, layered media, floor rules, estimates, stats, supply, sales, origin |
| Stickers / brand / individual pack | Same visual component family | Existing formats, search, brands, previews, pack/supply/market data |
| DNS / numbers / usernames + details | Summary, asset rows, detail/metric cards | Existing valuation states/calculations and explanations unchanged |
| Analytics | Hero, chart, half-width metric cards | Existing four metrics and portfolio exposure |
| Activity + transaction sheet | Summary, filters, rows, sheet | Existing transactions, search, historical Swap filter (not execution) |
| Watchlist | Summary + asset rows + empty state | Add/remove existing items |
| Wallets / settings / connection sheets | Cards, rows, pill buttons, controls | Existing connection, import, preferences, explorer/disconnect actions |
| Preview dialogs / sort / filter sheets | Elevated surface, coherent controls | Native dialog and existing keyboard/close behavior |
| Welcome / import | Existing media with shared type/controls | Original welcome art and import video/progress, no replacement assets |

## Implementation

- New `styles-reference-ui.css` is scoped to `body.reference-ui`, loaded last.
- Existing Manrope retained deliberately: already available, legible numerals, no new font dependency.
  No claim of exact reference font identification or Apple-font fidelity.
- Decorative LED value renderer bypassed for this system; real values remain normal accessible text.
- Structural markup, API/data pipelines and calculations retained. Existing detail media retained.
- Backup: `.tmp/reference-ui-before-20261005/` (four frontend files before changes).

## Verification / continuation

Implemented the shared presentation across the mapped areas. Two live review rounds were
self-reviewed (not an independent critic or native-device evaluation).

- Round 1: Home/Assets/token list and GRAM detail (waited for real chart), gift collection,
  model and individual gift, Analytics. Corrected oversized unavailable labels, older chart
  controls, hero orbit decoration, numerical tracking and inconsistent icon strokes.
- Round 2 at **375 CSS pixels**: Home, Watchlist, Settings, Wallets, all three identity lists
  and individual details, sticker list/brand/individual pack, Activity. Read-only DOM checks
  found no viewport overflow or escaping content on the checked routes. Corrected early
  identity-name truncation, currency label wrapping and legacy selector specificity.
- At **320 CSS pixels**: welcome and TON connection sheet verified; document has no horizontal
  overflow. Final loaded-wallet audit at this width is **not verified**: account providers timed
  out after 4000ms during restoration and manual retry. Do not claim every screen verified at 320.
- Existing preview/filter-dialog tests pass. Transaction sheet and additional sticker-preview
  states were not re-opened live in this pass; native dialog behavior retained and tested.
- Current real gifts/identity market pricing was unavailable during inspection. Sticker prices
  appeared on an earlier successful import but later provider reads were pending/unavailable.
  No live pricing success or invented preview data is claimed.
- Syntax: app.js, terminal-system.js, chart-platform.js passed.
- Final full Node suite: **443/443 passed**, zero failures, exit 0, ~70.7s
  (`.tmp/reference-ui-verified.log`). Four reference tests include exact chart observation
  preservation, monochrome tooltip/line options and dashed selection behavior.
- Final AST graph update completed: **7257 nodes / 15103 edges**, exit 0
  (`.tmp/reference-ui-graph.log`). Existing optional SQL parser remains unavailable; 22 SQL
  files are not represented by AST extraction. No dependencies installed to change that.
- Final root HTTP request matched every active-workspace JS/CSS version marker. Browser
  loaded CSS version 4 and parsed 133 rules. Normal viewport restored. Last stylesheet
  refinements were not fully re-audited with loaded wallet data because provider restoration
  timed out; no full final provider-backed visual verification is claimed.

Latest CSS marker: `reference-20261005-4`; app/chart JS markers `reference-20261005-2`.
No production services, backend, APIs, valuation calculations, workers or dependencies changed.
Current UI work is implemented, with the loaded-wallet 320px/final provider-backed visual check
remaining limited by external data availability. Resume from this worktree, not older design goals.
No pending commands or tool sessions remain. When provider availability returns, revisit final
Home/Analytics, long identity names, unavailable collection summaries, token/gift/sticker detail
controls and sheets at 320px and 375px before calling the visual audit fully complete.

## Exact-reproduction pass — October 5 continuation (INCOMPLETE)

This section supersedes the earlier pass's completion wording. The user requires
component-for-component reproduction, not interpretation. All ten attached sheets
were personally viewed. `REFERENCE_UI_BRIEF.md` records measurement priority,
content mapping and the explicit unknowns. Markup reconstruction is authorized;
existing routes, features and financial behavior must remain intact.

### Implemented in the active worktree

- Shared collectible row construction now covers collection/model/individual gift,
  sticker brand/pack and loading rows. Routing IDs and preview actions remain intact.
  Normal rows measure 80px high, with 20px horizontal padding, 48px art, 16px art
  radius, 24px row radius and 20px gaps. Longer real content may expand rather than clip.
- 393px canvas maximum, 20px gutters, upper-lit layered graphite materials,
  quieter regular-weight financial headings, consistent metadata and unavailable text.
- Floating graphite navigation with dark circular selected state, white 24px icons
  and accessible labels; existing five destinations preserved. Width uses viewport
  content width rather than overflowing into the desktop scrollbar.
- Thin white unfilled charts, hidden value axis, rounded graphite callouts with
  markers and dashed point-selection guide. Recorded values and callbacks preserved.
- Gift/sticker detail heroes now use left-aligned content and right-side 96px art;
  corrected the legacy 174px artwork stage that overflowed its 96px grid column.
- Native token hero uses left-aligned price/name and right-side 48px logo.
  Dynamic token markup uses `.token-detail-logo`, not the old `#detailIcon` alone.
  The final selector correction needs the final rendered token check after restoration:
  the last reload did not restore the wallet and returned to the welcome screen.

### Verified / limitations

- Loaded Assets category rows measured 353×80px on the default canvas.
- Gifts → Top Hats → Antiquity → individual Top Hat reopened. Final art/stage
  measured 96×96px inside a 353px hero; clipping fixed and visually confirmed.
  Collection stats, supply, ownership, history, sales, demand and origin remain.
- Stickers → Nyan Cat → Party Pack reopened and visually reviewed. Pack details,
  chart, statistics, about, supply, market activity and sales remain reachable.
- GRAM detail opened with real history and network/activity data. Its first new
  hero screenshot revealed the dynamic-logo selector problem, corrected afterward.
- Analytics reopened with real history and existing metric/exposure sections.
- Wallet provider was intermittent: first restoration returned tokens only; later
  restoration returned 512 holdings. No mock prices were introduced by this pass.
- Normal viewport restored. Narrow test had 362px usable document width, not 377px
  usable width; no horizontal overflow on the measured GRAM page. Do not claim
  every route verified at 320px or a completed full responsive audit.
- Full suite **446/446 passed**, zero failures, exit 0, ~70s:
  `.tmp/reference-exact-checked.log`. Earlier full runs passed 445 before adding
  the detail-geometry regression test. Focused reference tests pass.
- Served JS/CSS markers matched active index.html via root HTTP request.
  CSS marker `reference-20261005-5`; app/chart markers `reference-20261005-3`.
- Graph update succeeded, 7265 nodes / 15117 edges; optional SQL parser remains
  missing. No dependencies, production workers or deployment settings changed.
- Final post-edit graph update: **7269 nodes / 15121 edges**, exit 0
  (`.tmp/reference-exact-end-graph.log`). Final focused reference suite 7/7 passes.
  No pending tool sessions. Connection sheet closed, normal viewport left restored.
- Test-command incident: an initial unscoped `node --test` discovered existing
  scratch diagnostics, including Telegram login/session persistence. It was stopped
  with Ctrl+C; `.telegram-session` was refreshed by that diagnostic. Do not delete
  or expose it. Use **npm test** (test/*.test.js) only, not bare node --test.

### Exact next work (do not restart the prior pass)

1. Finish the rendered token logo check after the current wallet restoration.
2. Audit all sixteen screen containers and nested route/state families again against
   the ten-sheet specification. Earlier pass checks are not new exact-pass proof.
   Remaining live checks include identity details, transaction/preview/filter sheets,
   Watchlist, Settings/Wallets and loaded-wallet 320px responsive states.
3. Compare financial decimal/unit hierarchy, chart callouts/interaction, control
   geometry and every legacy override. Current financial decimals still use full-size
   text; exact source font is unknown (Manrope retained as an explicit substitute).
4. Revisit chart/metric dimensions and surfaces at equal usable canvas width.
   No complete exact-visual final audit, pixel identity or independent critique claimed.
# Navbar correction — 2026-10-07

- User rejected the simulated navbar as inaccurate. This targeted correction supersedes the earlier dock treatment.
- Replaced the CSS orb approximation/chart overlay with a masked crop of the actual orb from supplied Sheet 06 (`assets/branding/reference-nav-orb.png`, source crop 475,494 / 85×82). No generated imagery.
- Dock now uses five equal grid columns, 4px horizontal inset, 79px height, quieter source-like charcoal lighting and a black selected well. Simplified Assets/Watchlist outline glyphs; all five destinations and accessible labels remain unchanged.
- Live browser verified: 393px viewport gives 353×79px dock, no horizontal overflow; 320px viewport gives 280×79px dock and each button remains over 54px wide. Clicked all five destinations successfully and returned Home. Source orb loaded correctly. Focused reference tests: 9/9 passed.
- This is a checked navbar correction, not a claim of exact full-app pixel equivalence or completion of the all-screen reconstruction. Remaining nested-page audit in the previous checkpoint still applies.

# Home card reconstruction — 2026-10-07

- User asked to reconstruct the remaining Home cards first. Scope is Home only; no new product features or backend/data-flow changes.
- Sheet 05/09 chart construction: reconstructed the existing recorded-history region as a layered burgundy/dark chart card, with reference selectors above its live readout, gold 157px plot, truthful coverage note and quiet refresh/source footer. Day-one/error content remains an intentional no-chart state.
- Sheet 03 asset construction: featured carousel retains moving/keyboard/reduced-motion behavior, 80px rows, 48px/16px artwork wells, 16px main text/value and 24px outer radius.
- Sheet 04/07 portfolio metric construction: allocation now has a prominent existing valued-holdings total, actual interactive donut at its right and six category entries in a two-column legend below. Counts, loading/unavailable pricing, selection and all categories remain. No invented health/risk scores or synthetic charts.
- Sheet 04/07 metric pair: Today cards rebuilt with 145px height, quiet 32px artwork wells, 32px actual change value and matching layered surfaces. Hidden image fallbacks and hidden second cards explicitly remain hidden. No-data state spans the pair as one honest status card.
- Sheet 03/06 rows/actions: Home activity changed from inherited flex to 80px grid rows with 48px artwork wells, separated metadata/timestamp, right-aligned real amounts and 20px card gaps. "View more" + chevron replaces the oversized heading icon button and opens the same Activity destination.
- Verification so far: syntax check passed; complete regression run 449/449 passed (before final allocation CSS and the additional activity-content test). Current focused tests 18/18 passed. Live initial rebuilt chart and lower Today/activity views were personally inspected; rows measured 80px. Final allocation/mobile checks follow before reporting completion.
- Self-review: reviewed actual rendered Home against supplied Sheets 03/04/05/06/07/09. Not an independently scored critic or a pixel-perfect overlay proof. All-app/nested-screen reconstruction remains incomplete.

# Allocation segmented-column update — 2026-10-07

- New user steering explicitly requests the Portfolio Health segmented-bar treatment and supplies a close-up. This supersedes the earlier retained-pie layout below.
- Allocation remains allocation (not a new health/risk feature): its actual valued total/selected category value above six equal segmented columns, gray unfilled segments, gold-to-white filled segments, small category labels, actual holding counts and compact values/unavailable dashes below.
- Gold fill height is the actual category value / sum of positive valued categories. Unpriced categories have no fabricated fill. Selection retains existing click/keyboard behavior, full accessible category/count/value/share labels and existing unavailable states. Clicking the total resets selection.
- Legacy donut renderer remains available outside this Home reference presentation. No price, valuation, API or ingestion changes.
- Focused verification: 19/19 tests passed, including exact 60/40 shares, refresh to 20/30/50, clearing all fills when prices disappear, selected state and unpriced category preservation. Full regression suite passed 451/451 (`.tmp/reference-home-allocation-20261007-final.log`); focused checks reran after the final mask/count corrections.
- Live 393px inspection confirmed the rounded segment mask, real 100% token fill with unpriced categories gray, unavailable Gift selection (header dash, not fabricated zero), and keyboard Token selection. Loading-price skeletons stay inside columns and known counts remain visible. Final 320/375/430px checks passed without page/label overflow after compact-label corrections; viewport override reset. Active served app/CSS markers matched index; final CSS marker is reference-20261007-9, app marker -7. No backend/worker changes.
- Live-data limitation observed during reload: upstream Toncenter inventory/activity sometimes reports unavailable, and one automatic wallet restoration returned to the welcome gate. An earlier loaded wallet was visually verified, but this Home UI task does not resolve upstream pricing/import availability. Do not misreport unavailable asset prices as verified.
- The broader all-app/nested-screen reconstruction is still incomplete. This is a scoped Home milestone, not pixel-perfect equivalence or completion of the full redesign.


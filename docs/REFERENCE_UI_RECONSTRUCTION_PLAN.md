# TonTrack — reference-sheet reconstruction plan

Date: 2026-10-07. Status: reconstruction in progress; Home/shared foundation implemented, visual gate and remaining screens incomplete. See `REFERENCE_UI_CHECKPOINT.md` for verified progress and exact next steps.

**Latest palette correction during execution:** the user clarified that black and white are base colors only. Colored gradients, lighting and accents are allowed. Preserve the source hero's burgundy gradient and use appropriate source accents; monochrome crops remain an analysis aid, not a mandatory production conversion. This correction supersedes monochrome-only wording below.

This plan supersedes the implementation method and visual-completion claims of the previous reference pass. It does not supersede financial/data rules or change the product scope. The ten October 5 sheets are the source design, not general inspiration. The earlier Fomo and Vaulta directions are not additional sources to mix into this pass.

## 1. Outcome and boundaries

Reconstruct the existing interface using the source components' geometry, typography, materials, light, icon treatment and internal composition. Keep TonTrack's screens, navigation destinations, sections, interactions, information, backend, API contracts and calculations. Rebuilding frontend markup is permitted and necessary; rebuilding the product is not.

Keep black, white and dark gray as the base. Preserve source burgundy/purple gradients, colored lighting and accents where appropriate, including their tonal range, folds, highlights, translucency and depth. Keep genuine asset artwork in its original colors. Positive/negative financial states may retain functional color and must also be understandable without color.

No swap execution, deposits, withdrawals, buy/sell, chatbot, trading signals or invented health/risk scores. An existing historical Swap transaction/filter is portfolio activity, not a new trading feature, and stays.

“Exact” means a named source component, reproduced with locked measurements and a documented monochrome conversion—not choosing a vaguely related style. Literal pixel identity to every sheet simultaneously cannot be guaranteed: the sheets contain conflicting variants, omit font/effect specifications, and show different content and colors. Resolve each conflict once in a component specification. Do not quietly substitute a convenient design or claim an unidentified font or recreated illustration is the original.

## 2. Evidence gathered and why the last pass is insufficient

All ten original attachments were opened and visually examined in this research pass. The active repository and current browser were inspected, including Home, Assets, TON DNS list/detail, Settings and Wallets. All 16 screen containers and the dynamic detail/overlay render paths were mapped in source. Other routes have code-level coverage here, not a claim that every conditional state was freshly opened this turn.

Current implementation findings:

- `index.html` loads five application style files: `styles.css`, `styles-product-v2.css`, `styles-terminal-system.css`, `styles-ui-restoration.css`, and `styles-reference-ui.css`.
- The reference stylesheet contains 353 `!important` declarations. This is evidence of competing ownership, not proof by itself of a rendering bug. Keeping old construction and overriding its paint has left the old proportions intact.
- In the inspected mobile rendering, the Home balance/history group was about 514px tall, Featured assets 265px, and Allocation 427px. The source's compact balance hero is a fundamentally different composition. These are one observed viewport/state, not universal heights.
- Most surfaces currently use a similar graphite panel. The references instead distinguish satin hero, almost-black rows, metric cards, translucent controls, white pills, icon wells and glass navigation.
- The source hero's cropped sculptural fold is absent. A generic radial gradient cannot reproduce that object or its lighting.
- Manrope is presently used without a demonstrated glyph/metric match. The reference's lighter balance, smaller baseline-aligned fraction, row labels and quiet metadata need separate typography roles.
- Source inspection found inline visual markup and multiple independent detail renderers. A global radius/padding change cannot reconstruct gift, sticker, identity and token detail composition consistently.
- A live identity detail still shows a large centered image/name/value stack with an extra content inset. Settings retains a bold, divider-heavy group. These are not the source row/card constructions.
- Prior Node test passes prove the covered behavior, not reference fidelity. They are not visual acceptance evidence.

Do not assign an invented percentage of visual similarity. Use component-level evidence and specific defects.

## 3. Source register: all ten sheets and their authority

Original directory: `C:/Users/vishu/Downloads/`.

| Sheet / filename suffix | Canonical source panels | Application use |
| --- | --- | --- |
| 01 — `06_45_54 PM-1.png` | Visual Foundation: Typography, Surface hierarchy, Radius | Global type roles, layered surfaces, card/control radii; device frame is not app UI |
| 02 — `06_45_55 PM-2.png` | Greeting/header; Portfolio value hierarchy; Home full screen | Wallet header composition, balance/fraction alignment, Home reading order within existing sections |
| 03 — `06_45_55 PM-3.png` | Asset list section; Icon container; Row specifications | Canonical standard asset row across tokens, collectible/identity lists and watchlist |
| 04 — `06_45_56 PM-4.png` | Portfolio hero card; Compact asset cards; Metric and alert cards | Canonical hero shape/light/fold; card materials and nested hierarchy |
| 05 — `06_45_57 PM-5.png` | Chart area; Line styling; Value callouts; Selected day; Vertical marker | Actual chart rendering, crosshair/callout/date treatment and analytics value hierarchy |
| 06 — `06_45_57 PM-6.png` | Bottom navigation; Icon buttons; Pill buttons; Tabs; Segmented controls; Section headers | Canonical dock, buttons, filter/range controls and header action construction |
| 07 — `06_45_58 PM-7.png` | Portfolio health; Risk score; Concentration alert; Score/status | Existing metric/status presentation only; no imported AI/risk product semantics |
| 08 — `06_45_59 PM-8.png` | Content width; Vertical rhythm; Half-width cards; Spacing/grouping | Canvas/gutters and relationships between groups; component-specific dimensions win conflicts |
| 09 — `06_46_00 PM-9.png` | Home and Analytics full-screen compositions | Final assembled-screen comparison, not a reason to delete TonTrack content |
| 10 — `06_46_01 PM-10.png` | Bottom-nav and angled component close-ups | Secondary material/light reference only; exclude phone hardware, hands, rocks and promotional environment |

Full filenames are `ChatGPT Image Oct 5, 2026, <suffix>`.

### Source extraction deliverable, before implementation

Create a source atlas with a manifest entry for every component below: original filename, panel name, crop rectangle, native dimensions, normalized CSS dimensions, evidence type, monochrome conversion and conflicts. Preserve original sheets unchanged. Include both the component crop and its screen context; a crop alone can hide incorrect outer spacing.

Use these evidence labels:

- **A — annotated:** explicit measurement printed in the sheet.
- **M — measured:** obtained from the selected, normalized crop, with source bounds saved.
- **F — fitted:** unspecified font/effect reconstructed by rendered comparison, not presented as a measured source value.
- **C — composed:** necessary TonTrack view/state absent from the sheets; assemble exclusively from matched source primitives.
- **X — excluded:** reference-only feature or marketing device/environment.

No production implementation should proceed with “looks roughly right” in place of this manifest. The present plan has not yet produced the measured crop atlas or a font match; those are the first execution deliverables.

## 4. Resolve conflicting measurements explicitly

| Question | Decision |
| --- | --- |
| Base frame/content | 393px canvas, 353px content, 20px gutters (A, 01/08). Normalize screenshots to the actual layout width, not browser window width including scrollbar. |
| Standard asset row | 80px high, 20px horizontal content padding, 48×48px artwork, 16px artwork radius, 24px outer radius (A, 03). |
| Row gap: 16 or 20? | Use 20px for the Sheet 03 asset-list component. Sheet 08's 16px item label does not override the dedicated row specification. Do not impose row spacing on compact metadata tables. |
| “5-point grid” vs 16/24/32 | Follow specific dimensions. Do not round all measurements to multiples of five. |
| Two 166px cards + 20px gap | With 353px content, calculate 166.5px each. Treat 166px annotation as rounded, not a reason for a 1px alignment drift. |
| Hero variants | Sheet 04 Portfolio hero card is canonical for construction; Sheet 02 governs balance typography/header and Sheet 09 composition. Crop-fit the chosen hero rather than average incompatible variants. Initial visual estimate is roughly 190–205px high at 353px width; this is NOT a measured final dimension. |
| Segments with/without outer capsule | Sheet 06 Segmented controls is canonical: individual translucent pills and white selected pill. Do not preserve an extra black outer capsule merely because current markup contains one. |
| Navigation variants | Sheet 06 Bottom navigation is canonical. Preserve five existing TonTrack destinations and their order. Match capsule geometry, icon wells, selection and material; do not create an AI route. |
| Purple central orb | No standalone AI feature/orb button. Transfer specular light and selected-icon emphasis to the existing navigation control, with correct semantic icon. This is a declared content-mapping exception, not permission to flatten the dock. |
| Decorative hero actions | Reference Deposit labels/actions are X. Apply button construction only to existing equivalent actions, keeping their real availability. Do not add dummy buttons or duplicate actions to fill the source layout. |
| Typography / blur / shadows | F until font metrics and effect stacks are compared to source crops. Never claim a specific original font or CSS value can be read exactly from a raster sheet. |
| Rows with long content | 80px is the canonical two-line state. Preserve full accessible names and useful data; allow a documented content-driven variant where unavoidable. Do not make every row tall pre-emptively. |

## 5. Component reconstruction contracts

Each contract needs a source crop, markup anatomy, tokens, normal/pressed/selected/disabled state, responsive variant, and a rendered comparison. Dimensions marked F below are provisional until the atlas/calibration gate.

| ID | Component and canonical source | Required construction, not just color |
| --- | --- | --- |
| V01 | Canvas / light field — 01, 09 | Black page; controlled upper graphite luminance with directional falloff; no repeated gray rectangles or decorative full-page haze. Single shared horizontal content grid. |
| V02 | Type / financial values — 01, 02 | Distinct display, section, row, label and metadata roles. Balance integer and fraction separated visually but preserved as one accessible value. Fit glyph shape, weight, width, baseline, line height and tracking. Do not retain bold labels everywhere. |
| V03 | Header — 02 | Source avatar/icon-well proportions, two-line identity and right-side control; map existing wallet identity/connection and back/detail controls. Maintain the same optical alignment across screens. No invented notification button. |
| V04 | Portfolio hero — 04 | Rounded clipped satin surface; directional gradient; subtle bright edge/inner highlight; right-cropped sculptural fold with real highlight/shadow geometry; deliberate balance/action placement. Not a giant chart container. |
| V05 | Standard asset row — 03 | 80px/20px/48px/24px contract; near-black tonal gradient, hairline rim, rounded icon well; left title/units stack, right value/change stack aligned to the same baselines. Three-column grid with min-width rules, not arbitrary nested flex spacers. |
| V06 | Artwork / icon wells — 03, 06 | Correct 48px asset wells and separately fitted action wells, top-left sheen, soft inner edge, centered optical image bounds; preserve actual token logos and verified gift/sticker artwork. No letter placeholders when valid artwork exists. |
| V07 | Metric cards — 04, 07 | Full/half-width variants with matching edge/light, compact title and quiet info icon, prominent truthful metric, and existing visualization below. Correct inner/outer surface hierarchy. |
| V08 | Alert / status card — 04, 07 | Leading icon well, title/copy, source primary/secondary pill construction where existing actions exist. Preserve explanatory financial status. Do not add a health score or a new alert just to use the card. |
| V09 | Buttons — 06 | White subtly shaded primary pill, translucent dark secondary pill, fitted icon-only control. Match height, silhouette, rim, icon spacing, typography and press response. Disabled is visibly distinct and semantically disabled. |
| V10 | Filters / tabs / selectors — 06 | Individual rounded glass pills; white selected with dark text; identical geometry across currency, ranges, collectible filters and activity filters. Long groups scroll within their own track without page overflow. |
| V11 | Section header — 06 | Source section title/action baseline, sizing and whitespace. Existing actions remain; remove accidental double eyebrow/title spacing through reconstruction, without dropping useful information. |
| V12 | Bottom navigation — 06 | Floating translucent capsule, correct height/inset measured from crop, upper rim, inner light and soft cast shadow; five evenly distributed optical icon centers and source selection well. Real background is visible through glass. Reserve bottom content clearance. |
| V13 | Charts — 05 | Thin line treatment, source chart/value proportions, restrained plot background, no default bulky axes/area fill; dashed vertical marker, round selected point, pill value with dot, selected-date pill, fitted time controls. Keep actual data semantics. |
| V14 | Existing allocation / supporting visualizations — 07 | Preserve Home donut and selection behavior; transfer source card, labels, metric hierarchy and monochrome contrast. Use source bar/gauge marks only for an existing compatible measure; never invent a new risk/health statistic. |
| V15 | Sheets / dialogs / menus — C using 04/06 | Exact matched surfaces, typography, buttons and controls assembled around current content. Consistent header, close target, safe-area padding, scrolling, focus return and backdrop. Do not claim the sheet itself appears in the references. |
| V16 | Search / form / preferences — C using 01/06 | Match dark input/control material and type; retain labels, validation, provider choices and keyboard behavior. No fake reference form or removed settings. |
| V17 | Loading / empty / failure — C using 01/04/06 | Reserve real component geometry; truthful text and retry actions; existing content remains visible during refresh where already supported. No fabricated chart, value or sales. |
| V18 | Preview / media — C using 04/06 | Compact existing gift media; correct artwork clipping and independent preview surface; preserve local layered gifts, sticker animation/image variants and fallback images. No enlarged ornamental gift takeover. |

### 5.1 Typography calibration

1. Extract canonical text samples: `$8,000.00`, `Assets`, `Bitcoin`, units, percentages, `1W`, plus glyphs a/g/1/4.
2. Compare available licensed font candidates against the same samples at the same normalized size; compare glyph outlines and widths, not font names or reputation. Manrope is a candidate, not a mandatory answer.
3. Lock regular/medium/display weights, line heights and letter spacing per role. Rough 12–14px metadata, 14–16px row content and 20–22px section titles are starting fits, not claimed annotations.
4. Use tabular numerals where changing columns must stay aligned; verify the display balance's visual fit separately. Preserve existing precision, rounding rules and currency switching. CSS numeric variants support this without changing the financial value ([MDN](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/font-variant-numeric)).
5. Wait for font readiness before visual comparison; do not judge a fallback-font screenshot. Self-host only appropriately licensed files if needed. Do not download Apple fonts as a shortcut.

### 5.2 Materials and assets: the missing work

Build separate material recipes, not one universal gray background:

- **Hero satin:** base tonal gradient + independently positioned light + clipped folded form + rim/inner highlight + restrained shadow.
- **Asset/metric surface:** near-black face + very low-amplitude directional sheen + subtle edge; different luminance from icon wells.
- **Translucent control:** alpha surface + visible underlay + highlight/rim, without applying opacity to its text.
- **White pill:** bright face + small tonal falloff and controlled edge; not an unshaded white rectangle.
- **Dock:** real backdrop translucency + darker inner layer + upper light edge + floating shadow, with text/icons fully opaque.
- **Icon well / selected glyph:** compact specular/highlight treatment matching the crop, not a global drop-shadow on every icon.

For each material record positions, grayscale samples, stop locations, alpha, shadow offsets/spread/blur and compositing order. Sample broad face/edge/highlight regions, not antialiased text or compression pixels. Convert the reference's color to a grayscale target while retaining relative light/dark relationships; do not merely replace every burgundy with #111.

The hero fold needs a dedicated decorative asset. First check for an available original asset; none has been identified in the inspected project. If unavailable, recreate the observed form and lighting as a local cutout/illustration, fit its silhouette and crop against the source, and label it a reconstruction. A generated complete screen, generic blob, CSS radial glow, or screenshot baked behind live text is not acceptable. Keep text, controls and data in HTML. Existing welcome/import media and asset art stay intact.

Use code-native SVG for interface glyphs and simple geometry. Match viewbox, optical bounds, line thickness, cap/join and filled/outlined selected variant per source. The older all-dotted Vaulta-icon request is not this reference's icon system; do not mix it in. Keep dot/bar motifs only where the current sheets show a relevant visualization.

True frosted glass requires partially transparent surfaces. Ancestor opacity/filter choices can change the backdrop being sampled, so verify the dock/overlay in context, not on an isolated black swatch ([MDN backdrop-filter](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backdrop-filter)). Avoid expensive blur on every row.

### 5.3 Chart reconstruction without new calculations

Retain Chart.js and the existing data adapters. Reconstruct the chart wrapper/value/control/callout layer, not the pricing pipeline.

- Match plot height, clear margins, value baseline, line stroke, point size and timeframe spacing to Sheet 05. Reserve chart size during loading to prevent layout shifts.
- Use the existing real series only. The source's two lines are not permission to fabricate a comparison series.
- Keep recorded timestamps and extrema accurate. Do not manufacture points, smooth through gaps misleadingly, or overshoot observed financial values just to resemble the source curve.
- Make the selected timestamp/value, dashed cursor, point and date pill share one selection state. Clamp labels at both edges and avoid collisions.
- Reuse or extend existing tooltip plumbing. Chart.js supports external HTML tooltips, allowing the actual reference pill construction instead of the default canvas box ([Chart.js](https://www.chartjs.org/docs/latest/configuration/tooltip.html)).
- Preserve current keyboard inspection and support pointer/touch selection without trapping normal vertical scroll. Clear selection predictably on exit; preserve range on unrelated rerenders.
- Preserve chart instances and data caching where possible; a range press must not rebuild the entire page. Loading, empty, one observation, partial history and refresh failure need explicit states.
- Day one: show the real balance and a compact history-not-yet-available state; no fake trend or large empty graph. Once sufficient recorded points exist, use the matched plot variant. Preserve useful refresh/range behavior.
- Motion is not specified by still images. Retain sensible existing transitions; add only measured, subtle feedback where needed and respect reduced motion. Do not invent “source-accurate” physics.

## 6. Implementation architecture: one owner per component

This remains vanilla JavaScript, HTML and CSS. No React migration, backend rewrite, route redesign or dependency-heavy component framework.

| File / area | Planned change | Must remain unchanged |
| --- | --- | --- |
| `index.html` | Reconstruct existing header, Home groups, summary/section wrappers, dock and dialogs with semantic visual slots | Screen IDs, destinations, data hooks, feature availability |
| `styles-reference-ui.css` | Replace override pile with authoritative tokens, material recipes, component classes and state/responsive variants | Existing behavior selectors until migrated deliberately |
| Four legacy stylesheets | Inventory applicable selectors; retire each migrated component's old visual ownership; remove redundant links only once all dependent views/states are migrated | Unmigrated behavior/utility styles during transition |
| `app.js` render functions | Shared markup helpers for rows, values, icon wells, metrics and section titles; migrate every dynamic detail branch | Data selection, sort/filter semantics, wallet isolation, identity matching, pricing rules |
| `chart-platform.js` and chart rendering in `app.js` | Source-shaped wrapper/tooltips/selection/appearance; share options without altering observations | Real data, timestamps, currency meaning and existing chart controls |
| `terminal-system.js` | Audit visual mutation hooks; stop obsolete decoration from rewriting migrated DOM | Relevant nonvisual behavior; no blind whole-file deletion |
| Local frontend assets | Licensed/calibrated font if needed; decorative fold; source-matched interface SVGs | Verified logos, gift registry/media, welcome art and import video |
| `test/` | Focused behavior tests when render/event contracts change; visual fixtures and measurement checks | Existing regression coverage; no production mock-price injection |

Migration steps per component:

1. Record every HTML and dynamic-renderer caller and its event/ID contract.
2. Build the reference anatomy using new, clearly owned component classes in the existing view. Avoid shadow DOM or framework boundaries that break delegated events.
3. Replace inherited/inline layout rules for that component; do not append a sixth stylesheet or another blanket `!important` patch.
4. Verify computed styles for canonical and nested usages; check which rule wins. CSS layers are not a magic fix while unlayered legacy styles still own those properties.
5. Remove its obsolete visual rules only after equivalent states are covered. Keep a migration ledger for remaining legacy selectors.
6. At the end, retain one intentional visual system plus necessary base/behavior utilities. No active historical theme should still decide card geometry or type.

Specific render families already found: collectible grids/rows and grouped gifts; featured carousel; identity rows/detail; generic collectible detail; dedicated gift detail; sticker pack detail; token hero/chart/metrics; native TON network panels; analytics; transaction rows/sheet; connection and import overlays. Updating only `index.html` will miss most of these.

### Renderer-to-checklist traceability

These are current `app.js` entry points, not proposed new architecture. During migration, follow each entry's helper calls and conditional DOM branches; keep the ledger updated if names move.

| Checklist family | Existing entry points / anchors |
| --- | --- |
| Navigation and detail dispatch | `showScreen`, `applyNavigationRoute`, `renderAssetDetail`; all `data-screen` containers in `index.html` |
| Shared collectible lists | `renderCollectibleGrids`, `renderGiftGrid`, `renderStickerGrid`, `renderReferenceCollectibleRow`, `renderGiftCard`, `renderStickerCard` |
| Gift collection → model → individual | `renderGiftBrand`, `renderGiftBrandItem`, `renderGiftModelGroup`, `renderGiftIndividualItem`, `renderGiftDetailPage`, `renderGiftDemandBlock`, `renderGiftSalesRows` |
| Gift and shared previews | `openGiftPfpTray`, `openProductPreview`; preview item event handlers and close/back paths |
| Sticker brand → pack → preview | `renderStickerBrand`, `renderStickerBrandItem`, `renderStickerDetailPage`, `renderStickerDetailSkeleton`, `renderStickerDetailSalesRows`, `openStickerThumbOverlay` |
| Identity lists and all evidence branches | `renderIdentityAssetRows`, `renderIdentityAssetScreens`, `renderIdentityAssetDetail` |
| Generic NFT fallback | `renderCollectibleDetail`, reached through `renderAssetDetail` |
| Native/jetton token detail | `renderTokenDetail`, `renderTokenHero`, `renderTokenChartControls`, `renderTokenChartMetrics`, `renderTokenMetricGrid`, `renderTokenActivity`; inspect native-network and holder/pressure helpers called by this family |
| Token list and delayed/empty states | `renderTokenSummary`, `renderTokenRows`, `renderTokenLogo`, `renderTokenLoadingState`, `renderTokenEmptyState` |
| Portfolio and Analytics | `renderPortfolioGraph`, `renderAnalyticsChart`, `renderAnalyticsBreakdown`; Home section mounts in `index.html` |
| Watchlist and transactions | `renderWatchlist`, `renderActivityRows`, `renderTxSheet`; Activity filter/search handlers |
| Filters and connection | `renderCollectibleFilterSheet`, `openCollectibleFilterSheet`, `renderWalletState`, `openWalletSheet`, `openWalletActionSheet`; connection/import mounts in `index.html` |

## 7. Screen and nested-state implementation ledger

All boxes start unchecked for this new reconstruction pass. Historical work is not automatically a pass. Source anchors are current function/ID names; line numbers may move.

| Screen container | Reference construction to apply | Mandatory content / nested coverage | Completion |
| --- | --- | --- | --- |
| `home` | V02–V05, V07, V11–V14 | Wallet header; balance/history; range/refresh/status; Featured moving carousel; allocation donut/selection/counts; Today movers; Recent activity | [ ] |
| `assets` | V04/V07 summary + V05 category rows | All six categories, counts, totals/unavailable; current top asset and routes | [ ] |
| `tokens` | V07 summary + V05 rows + V10 sort | Native TON/GRAM and jettons; image fallback; balances; sort/refresh; every detail variant | [ ] |
| `gifts` | V07 summary, V10/V16 filters/search, V05 rows | Grouping, existing format controls, all trait filters, sort, search, collection entry | [ ] |
| `gift-brand` | V07 collection summary, V05/V18 items | Collection → model group → individual gift; current model/backdrop/serial information, previews | [ ] |
| `stickers` | Same source families as gifts, not gift semantics | Brand/pack discovery, sort/filter/search, existing display formats | [ ] |
| `sticker-brand` | V07 summary, V05 pack rows, V18 previews | Brand → pack → sticker/media preview; price/status/supply data | [ ] |
| `dns` | V07 summary, V16 search, V05 rows | Domain identities and truthful valuation states → identity detail | [ ] |
| `anonymous-numbers` | Same identity-list construction | Number formatting, count/value/status → number detail | [ ] |
| `usernames` | Same identity-list construction | Username identity/value/status → username detail and evidence branches | [ ] |
| `analytics` | V02/V07/V10/V13/V14, Sheet 09 composition | Existing portfolio chart, four metrics, exposure; no new risk/AI score | [ ] |
| `watchlist` | V07 summary + V05 rows + V17 | Existing add/remove, asset routing, populated and empty states | [ ] |
| `activity` | V07 summary + V10/V16 + V05 data-row variant | All current transaction types; search/filter; historical Swap; transaction sheet | [ ] |
| `detail` | Relevant V02/V04–V10/V13/V18 composition | ALL conditional families below, not one token and one gift only | [ ] |
| `wallets` | V07/V08 connection/source cards + V09 | Existing providers, imported sources, counts, statuses, management navigation | [ ] |
| `settings` | V03/V07/V09/V10/V16 | Currency, alerts, privacy, refresh, theme description, attribution, disconnect affordance | [ ] |

### Detail families — separate acceptance entries

- [ ] Native TON/GRAM: logo/name/balance/price, current controls, chart, period high/low/swing, holdings, market metrics, native network panel, recent activity.
- [ ] Jetton: same shared construction; actual market data, optional buy/sell-pressure information where already present (informational, not execution), holder concentration, contract identity, watchlist/explorer.
- [ ] Token chart loading, delayed success, unavailable/no chart, existing-cached refresh and missing-logo fallback. Wait for slow live details before judging loaded layout.
- [ ] Gift collection list and collection summary.
- [ ] Gift model group and individual rows; do not lose backdrop/model differentiation.
- [ ] Individual gift compact media, title/serial, trait chips, exact floor/allowed estimate states, price/history, sales, demand, origin.
- [ ] Gift conditional collection statistics: minted/upgraded/unupgraded/burned, supply and on-chain/Telegram ownership.
- [ ] Gift model/individual preview tray, close/back and preview-to-detail entry.
- [ ] Sticker brand summary and pack list.
- [ ] Sticker pack hero, pack details, floor/history, statistics, supply/market/about and recent sales.
- [ ] Sticker thumbnail/media preview overlay; animation/static/failed media states.
- [ ] TON DNS detail: identity, estimated range/confidence/comparables/date when present, verified current asks/bids, details and explanation.
- [ ] Username detail: same identity construction plus historical-sale anchor, comparable evidence/reasons, freshness-dependent current-market branch.
- [ ] Anonymous-number detail: existing identity/valuation/details, without forcing username-specific evidence into it.
- [ ] Generic NFT/collectible fallback detail: artwork/traits/notes, floor, cost basis, P&L, quick-sell estimate where already present, chart, sales and market. There is no need to invent a new NFT tab.
- [ ] Every detail's unpriced/evaluating/failed/partial/loaded states; real financial uncertainty remains visible.

### Overlays and secondary flows — separate acceptance entries

- [ ] Welcome/entry: original media, connect entry, visual type/control fit.
- [ ] Connection method chooser.
- [ ] Telegram connection view and existing status/error handling.
- [ ] TON wallet view: Tonkeeper, MyWallet, QR/provider paths and read-only address/DNS import form.
- [ ] Import progress: original positioned video, TonTrack logo, progress bar, actual stages and failure/retry; never early completion or invented progress data.
- [ ] Wallet actions: manage, Tonviewer/Tonscan/existing explorer links, disconnect. Audit affordances; do not disconnect during visual inspection.
- [ ] Sort popover: value/name/change and current ordering state.
- [ ] Collectible filter dialog: every applicable group, selected/unselected, clear/reset and empty results.
- [ ] Transaction sheet: all rendered fields, explorer, close/back; long identifiers and two-asset swaps.
- [ ] Watchlist buttons: initial, active, removal feedback and accessible labels.
- [ ] Settings control variants and existing explanatory/toast behavior. No invented settings pages.
- [ ] Toast, section status, retry, back-to-top, privacy-hidden values and disabled controls.
- [ ] Long scroll, back navigation, preserved filter/range/scroll state, keyboard focus/escape and content behind the dock.

Before marking the ledger complete, scan current navigation/event handlers again for new or overlooked reachable branches. A screen-container count alone is not complete coverage.

## 8. Home-first execution and rollout gates

### Phase 0 — lock the source, not another concept

Produce the normalized crop atlas/manifest, annotated versus fitted measurements, font comparison and grayscale material swatches. Inventory source assets and current render/event dependencies. No three-direction exploration, Fomo reinspection or unrelated web moodboards.

**Exit:** Every V01–V18 has a canonical source or explicit C/X label; major fitted dimensions/assets are recorded. No unresolved source choice is silently pushed into CSS.

### Phase 1 — reconstruct the shared foundations and prove Home

Implement actual production primitives: material recipes, financial typography, asset row, icon well, buttons, range selector, metric card and dock. Compare a production component with identical test-only text to its source crop so different content cannot hide alignment defects. This is calibration, not a disconnected prototype or fake live portfolio.

Reconstruct Home in its existing section order:

1. Source header geometry with real wallet identity and connection control.
2. Source compact hero with fold/light and correct balance fraction/label hierarchy. Place existing actions deliberately; no Deposit placeholders.
3. Keep the existing history graph in the same Home balance/history area, but give it the Sheet 05 chart construction and compact stable space rather than stretch the source balance card into the current 514px slab. Separating visual sub-surfaces does not create a new feature or route. Day-one state is compact and truthful.
4. Preserve Featured as a moving carousel; use source card/row construction for the items and measured title/track spacing. Retain reduced-motion support and user navigation.
5. Preserve allocation donut, holding counts, legend and selection. Fit the source metric-card hierarchy; do not replace the donut with a fabricated health chart.
6. Apply half-width metric/card construction to existing Today movers; source row construction to Recent activity with its current content and action.
7. Reconstruct floating nav completely, including material, selection well, icon shape/position and bottom content clearance.

**Exit:** Reference-versus-render crops exist for hero, row, controls, dock and chart, plus a complete Home screenshot. Correct silhouette, type and materials before propagating. A passing test suite alone cannot unlock the next phase.

The reference Home contains fewer/different sections than TonTrack. Keeping TonTrack's chart, carousel, donut, movers and activity means its complete page cannot have the identical height/composition of the reference's three-asset mockup. The exact targets are the mapped component constructions and their spacing relationships; do not delete existing sections to force a full-screen screenshot match. Record any content-driven composition difference alongside the comparison.

### Phase 2 — assets and every nested detail

Migrate category lists, tokens, gift grouping/detail/preview, sticker grouping/detail/preview, all identity lists/details, and generic NFT fallback using the accepted primitives. Remove each renderer's legacy visual decisions and extra wrappers while preserving its data/event contracts.

**Exit:** Every detail-family checkbox has loaded and unavailable/partial coverage; all branches use the same accepted value/row/control/card rules. A gift screenshot does not validate DNS, usernames or token network panels.

### Phase 3 — remaining tabs and flows

Reconstruct Analytics against Sheet 09/05, then Activity/transaction sheet, Watchlist, Settings, Wallets, connection, filters, menus, welcome and import. Unshown source views use C components, not a separate visual style.

**Exit:** All 16 screens and the secondary-flow ledger are accounted for. Navigation and existing user actions still work; no data feature silently removed to fit a screenshot.

### Phase 4 — remove legacy visual ownership and verify

Finish retiring migrated theme rules, inline styles and visual mutators. Verify there is one authoritative construction per component family. Run targeted behavior checks, the standard test suite and responsive/visual comparison. Record remaining mismatches and fix them; do not normalize the existing mismatch into a new baseline.

**Exit:** Acceptance checks below pass and the checkpoint contains the evidence and any genuinely blocked states. Blocked live data is not a visual pass; use explicitly isolated test fixtures for state coverage and record live verification separately.

## 9. Verification method and acceptance criteria

### Visual comparison

- Normalize source crops to the 393px canvas/353px content system without stretching their aspect ratio. Remove device hardware/marketing perspective from component targets; use straight-on specification panels as primary.
- Capture production components at the same CSS scale, browser zoom, device pixel ratio and font readiness. Note scrollbar effects on layout width. Do not compare a 353px reference row to an arbitrary desktop-width row.
- Use side-by-side, 50% overlay and difference images for geometry; compare material crops and grayscale luminance profiles separately. Ignore text/content differences only in a documented mask; never mask borders, spacing, icon placement or wrong card proportions.
- Annotated geometry: target within 1 CSS pixel at the canonical viewport. Crop-derived measurements: initially within 2 CSS pixels, then tighten after source bounds are stable. These are proposed engineering tolerances, not claims that the raster source contains precise hidden CSS.
- Verify type baselines, line breaks, numeral widths, fraction scale, row value edge and icon optical centers. Compare highlights/shadows and nested surfaces, not only bounding boxes.
- Keep known limitations (font identity, recreated fold, source-only features) in a deviation register. No hidden exceptions and no invented “95% match” score.
- Use automatic snapshots for regression only after the initial reference match is accepted. A screenshot baseline of the current inaccurate app would merely preserve the error. Stable environment matters because rendering varies by OS/browser/fonts ([Playwright visual comparisons](https://playwright.dev/docs/test-snapshots)).

### Responsive and interaction checks

- Canonical 393px, then 320/360/375/430px and a wide desktop viewport. Preserve current desktop behavior unless a visual fit requires a documented responsive variant.
- Long asset names, unusually small/large values, USD/GRAM, privacy mode, long addresses, multiline errors and multilingual names must not overflow or overlap.
- Minimum practical touch areas and visible focus; keyboard access to dock, tabs, forms and charts. Thin source glyphs do not justify tiny click targets.
- Every top-level destination and nested branch, back/close, filter/sort/search, timeframe, chart scrub, carousel, donut selection, watchlist and transaction entry.
- Loading → loaded, refresh with cache, empty collection, no results, unavailable pricing, error/retry and delayed token detail. No placeholder financial data in the real app.
- Sticky/floating elements must not cover the last row, modal action or safe area. Dialog body scroll is independent; focus returns to its trigger.
- Respect reduced motion; ensure hover/press/selected/disabled states do not shift layout.

### Code checks and continuity

- Focused syntax checks after JavaScript changes; targeted existing tests for changed render/event contracts. Do not add superficial string-presence tests as proof of visual quality.
- Use `npm test` (`node --test test/*.test.js`) for the full suite. Never bare `node --test`, which can collect scratch scripts outside the intended test directory.
- After code changes, run `graphify update .` using the installed Python module fallback if necessary.
- Server work stays in the active repository; if restarted, stop the existing 5177 listener first and verify served JS/CSS markers against this repository's `index.html`.
- Update `REFERENCE_UI_CHECKPOINT.md` after each phase: changed files, migrated families, source target, screenshots/comparisons, test commands/results, unresolved defects and exact next step.
- No workers, Railway/Cloudflare settings, pricing models, wallet caches, import completion rules or API contracts are changed by this visual pass.

## 10. Definition of done

The pass is complete only when all route/detail/overlay entries are checked with evidence; the source atlas and deviation register are current; source components match geometry AND typography AND material; useful content/functionality remains; responsive and interaction checks pass; and no old visual system still dictates an unmigrated view.

For each component, answer: “Which specific source crop is this reproducing, and where is the rendered comparison?” If there is no answer, it is not finished.

This research turn changes documentation only. Next execution step: create the canonical crop/measurement atlas and calibrate typography/materials, then reconstruct and verify Home before the all-app rollout.

### Plan verification record

- Checked the ledger against all 16 current `data-screen` containers: none missing.
- Source register covers 10 sheets; reconstruction contracts cover 18 component families; implementation ledger contains 45 screen/state checkpoints.
- An independent read-only plan critique found no blocking coverage/scope issue and requested direct renderer traceability; the mapping above incorporates that correction.
- This is plan review, not a visual score or verification of an implemented redesign. No application tests were rerun because this turn changed documentation only.

# TonTrack Product Design System

Status: Approved planning baseline  
Scope: Every product surface after onboarding  
Last updated: 2026-07-22

This document is the source of truth for the TonTrack product redesign. Future UI work must follow it unless a later product decision explicitly updates this file.

## 1. Product Promise

TonTrack gives one trustworthy view of assets held across Telegram and TON wallets. The interface should make a mixed portfolio feel coherent without hiding uncertainty in the underlying market data.

The product must feel:

- Calm enough to inspect financial data for several minutes.
- Distinctive enough to feel native to TonTrack rather than a generic crypto dashboard.
- Fast enough that navigation and filtering feel immediate.
- Honest about verified, estimated, stale, loading, and unavailable values.
- Flexible enough to accept future asset categories without redesigning the shell.

## 2. Non-Negotiable Boundaries

### Onboarding is frozen

The finalized onboarding flow, its background video, composition, copy, logo, wallet connection behavior, and selectors are outside this redesign. Post-onboarding CSS must be scoped so it cannot alter `.wallet-gate` or its descendants.

### Functionality is preserved

- Do not change backend endpoints, response formats, storage, scanners, or pricing rules for visual work.
- Preserve the existing screen names, element IDs, `data-*` hooks, navigation stack, one-step back behavior, swipe navigation, scroll restoration, wallet import, Telegram import, charts, filters, and detail loaders.
- Existing live data always wins over mock or decorative content.
- A redesign may reorganize presentation but may not silently remove a working capability.

### Financial data remains explicit

- Never present estimated data as a verified floor.
- Never use zero as a substitute for missing data.
- Keep source, freshness, and estimate states legible without overwhelming the main value.
- Do not invent portfolio history before snapshots exist.

## 3. Design Philosophy

### The physical scene

TonTrack should feel like opening a private collection in a dark gallery: the room is quiet and nearly monochrome, while each owned asset provides its own light and color.

### Direction: Monochrome terminal gallery, living data

Black and white form the permanent product identity. Asset artwork, verified marketplace marks, chart direction, and semantic states supply controlled color. The interface does not decorate empty space with color; color explains ownership, state, source, or movement.

The design is not glassmorphism, neon crypto, or a stack of floating cards. Depth comes from contrast, scale, overlap, selective light, and strong spatial grouping.
### Display language: LED matrix

TonTrack uses a real circular LED dot matrix as a functional display layer, not as a novelty font.

- Use the LED matrix for root-screen names, primary portfolio totals, category totals, important counts, chart headline values, and directional display arrows.
- Use condensed technical labels for structural metadata such as `Portfolio value`, `Total assets`, `Wallet`, `View`, `Categories`, ranges, and timestamps.
- Keep asset names, descriptions, navigation labels, form copy, traits, sources, and explanatory text in Manrope.
- Detail-page chrome remains readable Manrope; the asset's primary price may use the LED matrix.
- LED values must be generated from the live DOM value and rerender whenever that value changes. Never duplicate or freeze financial data for visual styling.
- Dotted outline icons are reserved for category/navigation cues and compact status tiles. Asset artwork and marketplace marks retain their verified media.
- The LED treatment must remain legible at 360px and fall back to plain text if JavaScript is unavailable.

This hierarchy applies to every post-onboarding screen and shared sheet. Onboarding remains unchanged.

### Core principles

1. Value first. The user should understand total value, asset composition, and meaningful movement within seconds.
2. Art gets room. Gifts and stickers are visual objects, not tiny database rows on their detail pages.
3. Density has rhythm. Lists may be dense, but section spacing and type hierarchy keep them readable.
4. One fact, one home. The same value or descriptor should not be repeated in adjacent sections.
5. Progressive disclosure. Show the decision-making data first; reveal market depth and metadata lower on the page.
6. Motion explains state. Navigation, expansion, loading, and selection may move. Decoration does not.
7. Familiar controls. Standard back buttons, tabs, filters, sheets, lists, and chart controls should feel immediately usable.

## 4. Visual Language

### Color strategy

Use a restrained monochrome base with semantic and contextual color.

```css
--tt-bg: oklch(0.115 0.004 260);
--tt-surface-1: oklch(0.155 0.005 260);
--tt-surface-2: oklch(0.195 0.006 260);
--tt-surface-3: oklch(0.235 0.007 260);
--tt-ink: oklch(0.965 0.004 95);
--tt-ink-soft: oklch(0.76 0.006 95);
--tt-ink-muted: oklch(0.61 0.006 95);
--tt-line: color-mix(in oklch, var(--tt-ink) 11%, transparent);
--tt-positive: oklch(0.79 0.14 157);
--tt-negative: oklch(0.72 0.17 25);
--tt-warning: oklch(0.82 0.13 88);
--tt-info: oklch(0.72 0.13 252);
```

Rules:

- White is used for primary values and key labels, not every piece of text.
- Surfaces differ primarily by lightness, not colored tint.
- Positive/negative color always has a textual or icon equivalent.
- Asset-derived color is allowed inside media heroes, artwork backplates, tiny category indicators, and chart fills tied to that asset.
- Marketplace logos retain their official colors.
- Avoid gradients on text. Gradients are reserved for lighting behind asset media and chart-area fades.

### Typography

Use Manrope across the product to remain aligned with onboarding and avoid another font request. Product labels and controls use disciplined weights rather than display styling.

```text
Display value     40/42, 700, -0.035em
Screen title      28/32, 700, -0.025em
Section title     18/23, 700, -0.015em
Row title         15/20, 650
Body              14/20, 450
Supporting        12/17, 500
Micro             11/15, 600
```

- Use `font-variant-numeric: tabular-nums` for money, balances, percentages, dates, chart labels, and counts.
- Use sentence case. Avoid repeated uppercase eyebrows.
- Balance short headings and use pretty wrapping for explanatory text.
- Values use no more precision than the underlying data justifies.

### Spacing and sizing

Base spacing scale: 4, 8, 12, 16, 20, 24, 32, 40, 48.

- Primary screen gutter: 18px on compact phones, 20px at 390px and above.
- Section gap: 28-32px.
- Related label/value gap: 4-8px.
- Row minimum height: 68px.
- Tap target minimum: 44x44px.
- Bottom content clearance must account for the floating dock and safe-area inset.

### Shape

- Content panels: 14-16px radius.
- Compact controls and media tiles: 10-12px radius.
- Pills: full radius only for tags, segmented controls, and compact statuses.
- Sheets: 18px top corners.
- Avoid nested rounded containers. Use spacing, dividers, or tonal changes inside a parent surface.

### Depth and light

- Default screens are flat against the black stage.
- Surface elevation is expressed with one tonal step and, only when needed, a short low-blur shadow.
- Asset heroes may use a blurred color field derived from verified artwork/backdrop data. The artwork remains crisp above it.
- Do not use decorative glass blur on scrolling cards.

### Iconography and media

- Keep the existing Lucide family for interface icons.
- Interface icons are 18-22px with consistent stroke weight.
- Token, gift, sticker, wallet, and marketplace artwork use verified existing sources only.
- Gift lists use static registered artwork. Animated gift media is reserved for the detail hero.
- Sticker animation lifecycle must stop offscreen and respect reduced motion.
- Every media frame has a stable aspect ratio and fallback before loading begins.

## 5. Product Shell and Navigation

### App stage

- Primary design target: Telegram mobile webview from 360-430px wide.
- On wider screens, center a maximum 430px product stage rather than stretching mobile lists into desktop tables.
- Respect top and bottom safe areas.
- Keep the current floating five-item dock because it exposes the product structure well: Home, Assets, Analytics, Watchlist, Settings.

### Floating dock

- Near-black solid surface, thin adaptive boundary, no heavy blur.
- Inactive items show icons only or quiet labels depending on available width.
- Active item uses a white compact island with black icon and label.
- Dock never obscures the last interactive item.
- Selection changes in 180-220ms. No dock entrance choreography after onboarding.

### Headers

- Root screens: left-aligned title with one relevant action on the right.
- Nested screens: back, centered or optically centered title, one contextual action.
- Header becomes subtly solid when content scrolls beneath it.
- Preserve exact one-step navigation and per-screen scroll restoration.

## 6. Component Strategy

Build a small reusable visual vocabulary while retaining existing DOM hooks.

### Foundation components

- `AppHeader`: root and nested variants.
- `FloatingDock`: five primary destinations and active state.
- `MetricLockup`: label, main value, delta, freshness.
- `SectionHeader`: title plus optional text or icon action.
- `AssetRow`: media, identity, supporting line, value, delta/status.
- `CollectionRow`: media stack, collection summary, holdings count, total.
- `StatusBadge`: verified, estimated, stale, loading, unavailable, listed.
- `SegmentedControl`: compact mutually exclusive choices.
- `FilterSheet`: sort and filter controls in a bottom sheet.
- `SearchField`: consistent search behavior and count slot.
- `ChartFrame`: loading, ready, insufficient-history, unavailable, and error states.
- `MediaHero`: token, gift, and sticker variants.
- `TraitChip` and `TraitRow`: readable rarity and exact trait values.
- `ActivityRow`: icon/media, event, context, amount, time.
- `DataList`: label/value rows for collection and market statistics.
- `Skeleton`: geometry-matched placeholders that never cause layout shift.
- `InlineNotice`: brief unavailable, stale, or partial-data explanation.

### State contract

Every data-bearing component supports:

- Loading: stable skeleton, no fake value.
- Ready: verified data and source where relevant.
- Estimated: real estimated value plus one `Estimated` badge.
- Stale: last known value plus timestamp; never block the screen.
- Partial: available data plus a concise missing-count explanation.
- Empty: explain what will appear and what action enables it.
- Unavailable: use an em dash or `Unavailable`, never `$0.00`.
- Error: concise reason and explicit retry when retry is meaningful.

## 7. Interaction and Motion

### Timing

- Press feedback: 120-150ms.
- Small state changes: 180-220ms.
- Screen transitions and sheets: 200-260ms.
- Linear easing is allowed only for determinate progress.
- Use ease-out for entrances, ease-in for exits, and ease-in-out for view changes.

### Navigation transitions

Use the View Transition API as progressive enhancement around the existing `showScreen`/navigation stack. Unsupported webviews must retain instant navigation.

- Forward: subtle 12-16px directional shift plus crossfade.
- Back: mirrored direction, restoring the exact prior scroll position.
- Detail artwork may use a shared-element transition only when the source and destination media are already loaded.
- Swipe navigation remains interruptible and must never capture gestures that begin on charts, sheets, controls, or horizontal scrollers.

### Feedback

- Every tap responds visually within 100ms.
- Use skeletons for network waits and determinate progress for wallet import.
- Filter/sort changes update the count immediately.
- Refresh actions communicate started, updated, partial, or failed states without clearing usable stale data.

### Reduced motion

- Disable shared-element and directional motion under `prefers-reduced-motion`.
- Preserve short opacity feedback and all state meaning.
- Do not autoplay decorative animation when reduced motion is requested.

## 8. Performance and Technology

The redesign stays in the existing vanilla JavaScript, HTML, and CSS architecture. Do not migrate to React or add Framer Motion solely for transitions.

Use modern native capabilities as progressive enhancements:

- CSS custom properties and OKLCH for the token system.
- Container queries for reusable rows and media heroes.
- `document.startViewTransition()` for supported same-document navigation.
- `content-visibility: auto` and `contain-intrinsic-size` only for long static lists where it will not delay required media initialization.
- Intersection Observer for expensive media/animation lifecycle.
- Existing Chart.js and Lottie integrations; do not introduce replacements without a measurable benefit.

Performance rules:

- Never animate layout-heavy properties during scrolling.
- Limit live blur and large shadows on mobile.
- Eagerly prepare visible asset media after import; do not make first display depend on hover.
- Pause offscreen Lottie/video playback.
- Keep one visible chart canvas active per screen.
- Reserve media dimensions to avoid cumulative layout shift.
- Use intent-based prefetch only where a detail request has noticeable latency.

## 9. Content Principles

- Use direct labels: `Portfolio value`, `Floor`, `Last sale`, `Holdings`, `Updated 4m ago`.
- Avoid promotional copy after onboarding; the user is now working with their portfolio.
- Do not repeat `Floor`, `Estimated`, source, model, or collection text multiple times inside the same visual group.
- Prefer concise explanations attached to a state instead of generic paragraphs.
- Use `Estimated` only in the badge. Supporting copy can explain methodology in an optional disclosure, not every row.
- Use pluralization from actual counts.

## 10. Screen-by-Screen Direction

### Home

Purpose: answer `What is my portfolio worth, what changed, and what needs my attention?`

Order:

1. Compact identity/header with wallet/source action.
2. Portfolio value lockup with 24h delta and freshness.
3. Portfolio history directly beneath the value.
4. Allocation summary.
5. Best and weakest performers.
6. Recent activity with a route to the complete timeline.

History-first state:

- When fewer than two snapshots exist, do not draw a fake line.
- Show a calm `History starts here` state with the first saved point, snapshot time, and a short explanation that the chart builds automatically.
- Replace the state with the chart without changing the panel height once enough points exist.

Home removes repeated totals, decorative sample activity, and any block that does not help a decision. Connecting an additional TON wallet remains available from the header/source control and continues in the background.

### Assets

Purpose: show the composition of everything currently tracked.

- Start with total value and item count in one compact lockup.
- Present asset categories as strong full-width rows, not identical dashboard cards.
- Each row uses a small artwork mosaic or representative verified asset, category value, holding count, and data state.
- Retain TON Tokens, Telegram Gifts, and Stickers while allowing future categories to use the same row contract.
- End with the highest-value individual asset only when verified data exists.

### TON Tokens

Purpose: compare liquid holdings quickly.

- Sticky summary with total value and compact sort action.
- Search is introduced when the list warrants it.
- Rows prioritize token logo/name, balance, fiat value, unit price, and 24h move.
- Use tabular numbers and right alignment for values.
- Suspicious or unverified tokens remain visually secondary and clearly labeled.

### Gifts

Purpose: scan a potentially large collection without hiding pricing quality.

- Total gift value, count, and known/estimated coverage appear in one concise header area.
- Search is primary; sort/filter open a dedicated bottom sheet instead of occupying two permanent select boxes.
- Default view groups identical collection/model holdings where that reduces repetition.
- Rows/cards show static verified artwork, collection, model, count, value, and one status/source line.
- Estimated items carry one badge. Unpriced items remain present and sortable.
- Use rendering containment for long static lists only after media URLs are assigned.

### Gift Collection / Model Group

Purpose: move from collection-level value to individual holdings.

- Collection identity and aggregate value form a compact top summary.
- Model groups appear before individual gifts when multiple holdings share a model.
- Individual rows preserve exact backdrop and symbol identity without repeating collection text.
- Back navigation returns to the exact prior position in Gifts.

### Stickers

Purpose: scan sticker collections with equal visual quality but separate semantics from gifts.

- Use the same structural rhythm as Gifts, not the same asset classification logic.
- Summary includes total value, pack/item count, and pricing coverage.
- Search plus filter sheet replaces persistent dual selects.
- List media uses verified static previews; animated previews play only in focused/detail contexts.
- Creator, format, edition, and pack identity replace gift-specific traits.

### Sticker Brand

Purpose: inspect a pack/brand and its owned sticker instances.

- Brand visual and aggregate value lead.
- Rows show edition/format distinctions and exact owned quantities.
- No gift language, traits, or pricing assumptions are reused here.

### Asset Detail Template

Purpose: let one asset feel valuable while making its market evidence understandable.

Shared order:

1. Header with back, `Asset Detail`, and one market/external action.
2. Large media hero using verified artwork and contextual light.
3. Identity, primary value, change, and one state/source line.
4. Asset-specific traits or holding position.
5. Floor/performance chart.
6. Recent sales/activity.
7. Collection/network statistics.

The hero may occupy 42-52% of the first viewport, but essential value and state must remain visible without excessive scrolling.

#### Gift detail

- Animated registered model in the hero; verified backdrop palette and symbol layer.
- Collection, model, backdrop, and symbol appear once.
- `Estimated` appears only as a badge when applicable.
- Chart represents this exact pricing/estimate history contract, never a visually similar unrelated combo.
- Recent sales default to the most exact available scope and clearly label any broader scope.
- Collection stats are separated from exact-variant data.

#### Sticker detail

- Animated or video sticker media receives the hero focus.
- Show pack, creator, format, edition, owned quantity, verified floor, history, and relevant market activity.
- Thumbnail/fullscreen affordance remains available without obscuring the primary interaction.

#### Token detail

- Token logo and position value replace the collectible stage.
- Show balance, unit price, 24h change, chart, liquidity/holder/network metrics already available from existing data.
- Do not force collectible terminology into token screens.

#### Future asset types

Use the same hero/data sequence while supplying their own metadata module. Never classify a new asset as a gift or sticker just to reuse visual code.

### Analytics

Purpose: explain portfolio movement over time.

- Primary chart leads, with range controls integrated into the chart header.
- If history is insufficient, use the same first-snapshot state as Home.
- Follow with contribution by asset type, top/worst contributors, unrealized PnL, and snapshot coverage.
- Avoid a grid of equally weighted statistic cards; use one dominant chart and ranked data rows.

### Watchlist

Purpose: monitor assets not necessarily owned.

- Search/add action in the header.
- Rows show current verified value, alert condition, and state.
- Empty state explains what can be followed and offers one primary add action.
- Alert editing occurs inline or in a focused sheet, not a generic modal.

### Activity

Purpose: provide a complete chronological record.

- Search and a compact event-type segmented control lead.
- Use a date-grouped timeline rather than generic holding cards.
- Every row shows direction/event, asset, counterparty context when available, amount/value, and time.
- Transaction details remain in the existing transaction sheet with TONScan access.

### Wallets and Sources

Purpose: make Telegram and TON wallet coverage understandable.

- Present Telegram and connected TON wallets as sources, each with connection state, sync state, asset count, and actions.
- `Add source` is the primary action.
- Connecting a TON wallet after Telegram login must retain and merge both source portfolios exactly as today.
- Address import remains clearly marked read-only.

### Settings

Purpose: control display, privacy, refresh, alerts, and connected sources.

- Group settings into Portfolio, Appearance, Notifications, Sources, and Support.
- Use native-looking rows, current value on the trailing edge, and clear destructive styling for disconnect.
- Currency remains an inline segmented choice.
- Credits remain visible but secondary.

### Shared Sheets and Loaders

- Wallet/source selection uses the existing bottom-sheet flow with a clearer route hierarchy.
- Sort/filter sheets show current selections, result count, reset, and apply actions.
- Import loader retains real progress semantics and engaging stage copy without fake completion.
- Sheets use the same header, spacing, radius, backdrop, and motion vocabulary.

## 11. Responsive and Accessibility Contract

- Support 320px minimum width without horizontal page scrolling.
- Test primary layouts at 360x800, 390x844, 430x932, and a centered wide-screen stage.
- Respect `env(safe-area-inset-*)` on headers, sheets, and the dock.
- Body text contrast is at least 4.5:1; large text and non-text controls at least 3:1.
- Focus is visible for keyboard/web use and never removed without replacement.
- Semantic buttons remain buttons; links that open markets remain links or explicitly labeled external actions.
- Status must not rely on color alone.
- Charts include accessible labels and textual summary values.
- Dynamic updates use restrained `aria-live` regions.

## 12. Implementation Architecture

### CSS isolation

- Add a dedicated post-onboarding stylesheet loaded after the current stylesheet.
- Scope it beneath `.app-frame.has-wallet` or a dedicated product-shell class.
- Do not place onboarding selectors in the new stylesheet.
- Introduce tokens first, then migrate one screen at a time.
- Remove superseded legacy rules only after the final screen is accepted.

### JavaScript strategy

- Keep current render functions and API calls.
- Prefer adding stable semantic classes during each screen migration instead of changing data contracts.
- Wrap navigation updates with an optional View Transition helper while preserving the current stack and scroll logic.
- Keep visual state derivation separate from price/source selection logic.
- Do not duplicate gift media, floor, estimate, or Telegram/wallet import pipelines.

### Review cadence

Each screen is completed and reviewed before the next begins:

1. Confirm existing data and interactions on that screen.
2. Implement its structure and visual states using shared tokens/components.
3. Run focused syntax and behavior checks.
4. User visually inspects the live screen.
5. Record any approved deviation in this document.
6. Move to the next screen only after acceptance.

## 13. Migration Order

1. Foundation and Home, including product shell, header, dock, and first-snapshot history state.
2. Assets overview.
3. TON Tokens list.
4. Gifts list.
5. Gift Collection / Model Group.
6. Stickers list.
7. Sticker Brand.
8. Gift detail.
9. Sticker detail.
10. Token detail.
11. Analytics.
12. Watchlist.
13. Activity and transaction sheet.
14. Wallets, source connection sheet, and Settings.
15. Global accessibility, reduced motion, responsiveness, and performance pass.
16. Remove superseded post-onboarding legacy styles and document final component inventory.

The first implementation target is Home. Shared shell pieces introduced there must be reusable, but no other screen should be visually migrated incidentally.

## 14. Definition of Done Per Screen

A screen is complete only when:

- Its existing live functionality and navigation still work.
- Loading, ready, estimated, stale, partial, empty, unavailable, and error states relevant to it are designed.
- No fake financial value appears while data is missing.
- Touch targets, focus, contrast, safe areas, and reduced motion are handled.
- It works at the target mobile widths without horizontal scrolling.
- Media does not wait for hover to start required loading.
- The bottom dock does not cover content.
- Visual inspection is accepted before the next screen begins.

## 15. Research Basis

The technology choices intentionally use progressive enhancement:

- The View Transition API supports same-document transitions and can fall back safely where unsupported.
- Container queries let components adapt to their container rather than hard-coded page assumptions.
- CSS containment and `content-visibility` can reduce rendering cost for long lists, but must not delay required media initialization.

Primary references:

- MDN: View Transition API
- MDN: CSS container queries
- MDN: `content-visibility` and CSS containment


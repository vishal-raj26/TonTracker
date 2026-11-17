# TonTrack — reference reproduction brief

## Current implementation plan

See `REFERENCE_UI_RECONSTRUCTION_PLAN.md` (2026-10-07) for the all-ten-sheet source register, canonical component decisions, material/asset/type reconstruction method, complete route/detail/overlay ledger and visual acceptance gates. The user requested planning first; the reconstruction described there is not yet implemented. It replaces the prior override-first execution approach while preserving this brief's product boundaries.

## Approved direction

2026-10-07 palette clarification: black and white are the base, not a ban on color. Source gradients, colored light and accents may be reproduced. Earlier monochrome-only requirements below are superseded by this clarification.

Reproduce the ten attached October 5 UI reference sheets as the source design,
not inspiration. Replace visuals component-for-component in the existing TON
portfolio tracker. Insert TonTrack's existing content into the corresponding
reference construction; do not invent trading, swap, deposit, withdrawal, AI,
signals, risk scores or other product features. Preserve screens, nested views,
sections, navigation destinations, actions, real data and business logic.

Copy proportions, padding, icon containers, text/value alignment, radii, surface
layering, borders, lighting, gradients, glass, shadows, controls and selected
states. Translate burgundy/purple material to black/white/graphite, preserving
depth rather than making a flat black skin. Keep verified asset artwork.

## Measurement and verification rule — approved October 5

Use the annotated measurements wherever provided. When sheets conflict,
prioritize the component specification sheet over screen compositions and
marketing shots. Maintain a reference-to-component checklist covering every
existing screen and nested view. Compare rendered components side by side at
the same viewport width, correcting measurable differences before completion.
If a detail cannot be determined from the images, identify the uncertainty
rather than silently substituting your own design.

## Authoritative dimensions

- Canvas: 393px; content 353px; horizontal gutters 20px (sheets 01, 08).
- Top padding 24px; card spacing 20px; section spacing 32px; inner spacing 16px.
- Compact row: 80px; horizontal padding 20px; vertical list gap 20px (sheet 03).
- Row/art: 24px / 16px radii; artwork 48×48px (sheet 03).
- Large card 24px; medium surface 16px; controls fully rounded (sheets 01, 06).
- Half-width cards: (available content width − 20px) / 2 (sheet 08).

80px is the normal two-line row, not a license to clip real long names, financial
states or useful metadata. Document any content-driven expansion. At narrower
widths preserve hierarchy and touch targets without hiding functionality.

## Explicit uncertainties

The sheets do not identify a licensed font or specify CSS blur/shadow/gradient
stops, navigation height, motion, or tooltip runtime behavior. These require
rendered matching and are not measured facts. Existing Manrope is a temporary
font substitute, not a claim of exact font identity. Do not download Apple fonts.
Do not add a glowing AI orb where no equivalent feature exists. Retain accessible
navigation names even when the reference's visible navigation is icon-only.

## Coverage and continuation

All ten local attachments were opened and visually inspected in this pass:
01 foundations; 02 Home/hero; 03 rows; 04 card construction; 05 charts;
06 controls/navigation; 07 status/metric details; 08 dimensions/spacing;
09 combined compositions; 10 lighting and product presentation. Sheet 10's
phone hardware, rocks and photographic environment are not app components.
Sheets 07/09's risk/AI/health features have no existing equivalent and are
not added. Their surface, value and layout construction applies to existing metrics.

The user additionally authorized reconstructing card/section/component markup
wherever needed for visual fidelity. Existing content, actions and underlying
data behavior remain the preservation contract; CSS-only editing is not a limit.

The route/component ledger and verification status live in
`REFERENCE_UI_CHECKPOINT.md`. An implementation entry is not visual verification.
Record actual checks separately; do not mark the full pass complete while any
nested route, data state or responsive comparison remains unverified.

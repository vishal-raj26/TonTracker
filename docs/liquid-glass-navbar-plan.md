# Liquid Glass Navbar Plan

Status: deferred until requested.

## Goal

Replace the current blur-based navbar treatment with a genuine liquid-glass
selection lens while preserving the existing five-tab navigation, routes,
icons, labels, touch behavior, and black-and-white TonTrack identity.

## Visual Direction

- Use one moving selection lens. Never render a stationary active pill and a
  second animated layer.
- Keep the dock near-black and restrained.
- Make the lens milky and translucent rather than opaque white.
- Refraction, not blur, must create the glass effect.
- Keep the selected icon and label legible without turning the destination
  tab white before the lens arrives.
- Use only subtle edge color separation; the result remains monochrome.

## Rendering Technique

1. Create a highlighted copy of the navbar options as the refraction target.
2. Clip that target to the moving lens.
3. Bend its pixels with an SVG `feDisplacementMap`.
4. Add a directional rim light and specular highlight inside the same lens.
5. Use ordinary `backdrop-filter` only as a small supporting effect.
6. Keep a simple translucent-pill fallback for unsupported environments.

The displacement map is the core optical effect. It should be generated from
the lens geometry and reused while the lens only changes position.

## Motion

- The existing active lens moves to the selected tab.
- The leading edge stretches slightly in the direction of travel.
- The trailing edge compresses slightly.
- The lens settles with a controlled spring and no exaggerated bounce.
- The destination icon and label switch to their selected treatment only as
  the lens visually reaches them.
- Motion must remain interruptible when the user taps another tab quickly.
- Respect `prefers-reduced-motion`.

## Performance Rules

- Apply refraction only to the active lens, never the full navbar or page.
- Move the lens with compositor-friendly transforms.
- Do not regenerate the displacement map during simple translation.
- Precompute or cache neutral, left-stretched, and right-stretched maps.
- Pause optical animation when the lens is stationary.
- Avoid WebGL unless SVG filtering proves unreliable in a supported Telegram
  WebView.
- Test Telegram Desktop, Android WebView, and iOS WebView before release.

## Implementation Order

1. Build the refraction target and SVG lens in isolation.
2. Replace the current indicator without changing navigation behavior.
3. Connect the existing tab position calculation to the new lens.
4. Add velocity-aware deformation and the specular rim.
5. Add reduced-motion and unsupported-browser fallbacks.
6. Test rapid taps, resize, safe-area behavior, and every tab transition.
7. Tune opacity and refraction against real app content.

## Acceptance Criteria

- There is exactly one visible active lens.
- Content beneath the lens visibly bends instead of merely blurring.

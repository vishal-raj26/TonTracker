# Wallet import recovery — 2026-09-30

## Implemented and verified

- Local `Failed to fetch` was caused by Node exiting on an unhandled AbortError from the optional Tonkeeper jetton image registry. Wallet import now attaches its empty-image-registry fallback immediately, before waiting for account/inventory discovery. Required account failures still propagate.
- Wallet jetton discovery no longer disables public TonAPI reads solely because `TONAPI_KEY` is absent. Unauthenticated inventory reads use the existing queue, paced at 4.2 seconds. Authenticated requests retain their existing behavior. Provider failures remain partial/unavailable, not authoritative empty inventories.
- Regression tests execute the real wallet-import function with controlled dependencies: image timeout before successful core discovery, and late image timeout after account failure. Both exercise public inventory discovery without a key.
- `node --check server.js` passed.
- `node --unhandled-rejections=strict --test test/wallet-token-coverage.test.js`: 31/31 passed.
- `node --unhandled-rejections=strict --test test/*.test.js`: 381/381 passed.
- Live local `GET /api/wallet?address=damx.ton&refresh=1`: HTTP 200, 45 nonzero jettons, TonAPI and TonCenter inventory providers both ready, no cached-inventory fallback. Health remained HTTP 200 after import.
- Server started from the sole active project. All served JS/CSS query-version markers matched this project's `index.html`.

## Limits / not claimed fixed

- No TonAPI key was configured or invented. Public reads remain subject to upstream rate limits; this is not a guarantee of permanent provider availability.
- Background DNS/username registry requests returned HTTP 500 during the live check. These remote valuation failures are separate from the repaired local import crash and remain unresolved. Do not claim live collectible valuation verification.
- No production workers, deployment, subscription, or estimator calibration were changed.

## Next step if wallet import fails again

Check the active server's terminal and `/api/health` first. Distinguish upstream partial inventory/valuation failures from a local process exit. Preserve this import fix and its tests; do not restart completed username-estimator work from older handovers.

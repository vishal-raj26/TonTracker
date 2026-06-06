# Repo Plugin Setup

This repo works best with three Codex plugins/capabilities kept in the regular loop:

1. Browser
2. Computer Use
3. Spreadsheets

They are already available in this Codex environment, so there is no extra install step inside the repo. This file is the repo-specific setup and usage guide.

## Why these three

This project is a live-data Telegram Mini App prototype with:

- a large frontend surface in `app.js`
- a large backend integration layer in `server.js`
- many third-party market and wallet sources
- lots of tunnel/browser/mobile verification work

That means the biggest wins come from:

- verifying real rendering in-browser
- checking desktop/mobile-like behavior when the in-app browser is not enough
- comparing live wallet/token/gift/sticker results in structured tables

## 1. Browser

Use Browser first for this repo.

Best uses here:

- open `http://127.0.0.1:5177`
- verify post-edit UI states
- inspect token/gift/sticker detail pages
- confirm loading states, wallet import states, and section hydration
- spot stale cache behavior after `app.js?v=...` bumps

Default Browser checks for this repo:

1. Home screen loads
2. Assets screen loads
3. TON Tokens screen renders priced rows
4. Gifts screen renders inventory and prices
5. Stickers screen renders grouped items and prices
6. Gift/sticker/token detail pages open without blocking

Use Browser whenever a change touches:

- `app.js`
- `index.html`
- `styles.css`

## 2. Computer Use

Use Computer Use when the problem is not just “what the DOM says,” but “what the user actually experiences on desktop/mobile browser surfaces.”

Best uses here:

- tunnel pages
- Cloudflare / localtunnel / browser warning pages
- mobile-ish browser checks
- screenshots from external tools/sites
- visual regressions that need a real browser window

Use Computer Use instead of Browser when:

- the in-app browser gets stuck
- a tunnel warning page must be bypassed visually
- a site behaves differently in a full desktop browser
- you need to inspect screenshots or window-level behavior

## 3. Spreadsheets

Use Spreadsheets for accuracy audits.

Best uses here:

- compare app holdings vs TonScan
- compare token prices vs DexScreener / Tonkeeper / Thermos / see.tg
- track missing tokens, gifts, and stickers by wallet
- monitor price-source disagreements
- tune token filtering thresholds

Recommended audit sheets:

### Wallet Audit

Columns:

- wallet
- asset type
- name
- symbol
- app balance
- source balance
- app price
- source price
- app value
- source value
- source used
- issue

### Collectibles Coverage

Columns:

- wallet
- collection
- kind
- detected in app
- detected on source
- price available
- source
- grouped correctly
- notes

### Token Quality Review

Columns:

- wallet
- token
- verified
- liquidity usd
- volume 24h
- txns 24h
- app status
- reason blocked
- final decision

## Repo-specific checkpoints

Useful repo endpoints/files to keep in mind:

- health endpoint: `/api/health`
- wallet snapshots: `data/wallet-snapshots.json`
- history cache: `data/history-cache/`
- collectibles registry: `data/telegram-collectibles-registry.json`
- sticker registry: `data/sticker-collections-registry.json`
- manifest: `/tonconnect-manifest.json`

## Practical workflow for this repo

### UI change workflow

1. Edit code
2. Open with Browser
3. Verify the affected screen
4. If behavior is tunnel/mobile/browser-specific, switch to Computer Use

### Data accuracy workflow

1. Pull one wallet in app
2. Compare against external source screenshots/pages
3. Track discrepancies in a spreadsheet
4. Fix one rule/source issue
5. Re-verify in Browser

### Tunnel/debug workflow

1. Verify local app first in Browser
2. Use Computer Use for tunnel pages and bad-gateway style failures
3. Re-check app state after tunnel opens

## Recommendation for next setup step

After these three, the highest-value custom repo tool would be:

- a `ton-audit` personal plugin/workflow that compares wallet output across app + sources in one pass

That is the best next automation for this codebase.

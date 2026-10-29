"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles-terminal-system.css"), "utf8");
const terminal = fs.readFileSync(path.join(root, "terminal-system.js"), "utf8");

test("all static header icon controls have accessible names", () => {
  const headers = [...html.matchAll(/<header class="page-header"[^>]*>([\s\S]*?)<\/header>/g)].map((match) => match[1]);
  assert.ok(headers.length >= 14);
  for (const header of headers) {
    const buttons = [...header.matchAll(/<button class="icon-button"([^>]*)>/g)];
    for (const [, attributes] of buttons) assert.match(attributes, /aria-label="[^"]+"/);
  }
});

test("informational detail cues are not rendered as dead buttons", () => {
  assert.doesNotMatch(html, /<button[^>]*>Exact Variant<\/button>/);
  assert.doesNotMatch(html, /<button[^>]*>Live<\/button>/);
  assert.match(html, /aria-label="Open market listing"[^>]*hidden/);
  assert.match(app, /panel\.querySelector\("\.section-heading \.text-action"\)/);
});

test("token sort synchronizes expanded state and restores focus", () => {
  assert.match(html, /data-token-sort-open[^>]*aria-expanded="false"/);
  assert.match(app, /openTokenSortSheet\(\)[\s\S]*?aria-expanded", "true"/);
  assert.match(app, /closeTokenSortSheet\(\)[\s\S]*?aria-expanded", "false"[\s\S]*?restoreOverlayFocus\(\)/);
  const watchlistBody = app.match(/function renderWatchlist\(\) \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.doesNotMatch(watchlistBody, /sheet\.querySelector/);
});

test("token sort uses the shared Home surface instead of the legacy purple popover", () => {
  assert.match(styles, /\.token-sort-popover\{overflow:hidden;border:1px solid var\(--terminal-line-strong\);border-radius:14px;background:#090909/);
  assert.match(styles, /\.token-sort-popover button:is\(:hover,\.is-active\)\{background:rgba\(110,227,166,.08\);color:var\(--terminal-positive\)/);
});

test("ready feedback never covers page titles on narrow screens", () => {
  assert.match(styles, /\.section-ready-toast\{top:auto;bottom:calc\(94px \+ env\(safe-area-inset-bottom\)\)/);
  assert.match(styles, /background:rgba\(9,9,9,.94\);color:var\(--ui-text\)/);
});

test("Home-derived geometry wins in connected and disconnected states", () => {
  assert.match(styles, /\.app-frame\.has-wallet,[\s\S]*?--screen-gutter:18px/);
  assert.match(styles, /\.app-frame:is\(\.has-wallet,\.is-home-screen\) \.screen,[\s\S]*?padding-bottom:var\(--dock-clearance\)/);
  assert.match(styles, /grid-template-columns:44px minmax\(0,1fr\) minmax\(44px,auto\)/);
  assert.match(styles, /Connected-state product rules are more specific/);
  assert.match(styles, /border-bottom:1px solid var\(--terminal-line\);[\s\S]*?border-radius:0;[\s\S]*?background:transparent/);
});

test("narrow headers preserve readable titles and usable controls", () => {
  assert.match(styles, /@media\(max-width:359px\)\{[\s\S]*?grid-template-columns:40px minmax\(0,1fr\) minmax\(40px,auto\)/);
  assert.match(styles, /\.page-header>h1\{font-size:18px\}/);
  assert.match(styles, /\.page-header>h1\.is-compact-title\{font-size:15px\}/);
});

test("every route uses one readable page-title system", () => {
  assert.match(terminal, /const TITLE_SELECTORS = \[\];/);
  assert.match(styles, /\.page-header\{min-height:44px;margin:0 0 20px/);
  assert.match(styles, /\.page-header h1\{font-size:22px;font-weight:700;line-height:1\.15/);
});

test("dot-matrix display is reserved for numeric measurements", () => {
  assert.match(terminal, /variant === 'value' && !\/\[0-9\]\/\.test\(text\)/);
  assert.match(terminal, /element\.classList\.remove\('dot-matrix-text', 'dot-matrix-value'\)/);
});

test("identity measurements share the horizontal numeric display contract", () => {
  assert.match(styles, /\[data-screen="dns"\],\[data-screen="anonymous-numbers"\],\[data-screen="usernames"\]\) \.dot-matrix-text\{display:flex!important;flex-flow:row nowrap/);
  assert.match(terminal, /\[data-screen="usernames"\] \.identity-summary-card h2/);
});

test("settings expose real state instead of an unsupported theme toggle", () => {
  assert.match(html, /Privacy mode: Off/);
  assert.match(html, /Refresh frequency: Off/);
  assert.match(html, /Theme: TonTrack dark/);
  assert.doesNotMatch(html, /data-settings-theme/);
  assert.match(app, /Privacy mode: \$\{enabled \? "On" : "Off"\}/);
});

test("wallet sources use guarded counts and the shared connected treatment", () => {
  assert.match(app, /const totalAssets = tokenCount \+ nftCount \+ dnsCount \+ usernameCount \+ anonymousNumberCount/);
  assert.match(app, /totalAssets === 1 \? "asset" : "assets"/);
  assert.match(app, /const identitySummary = \[/);
  assert.doesNotMatch(app, /data\.summary\.tokenCount \+ data\.summary\.nftCount/);
  assert.match(styles, /\[data-screen="wallets"\] \.connect-panel button\.is-connected\{border-color:rgba\(110,227,166/);
  assert.match(app, /saveWalletAssetSnapshot\(liveWalletData\);\s*updateWalletScreen\(liveWalletData, Number\(liveWalletData\.summary\?\.totalUsd/);
});

test("shared asset totals include every visible identity category", () => {
  assert.match(app, /const holdings = walletHoldingCount\(tokens\)/);
  assert.match(app, /function walletHoldingCount\(tokens = latestVisibleTokens\)/);
  assert.match(app, /Object\.values\(holdings\)\.reduce\(\(sum, count\) => sum \+ count, 0\)\} tracked assets/);
});

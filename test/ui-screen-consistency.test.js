"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.join(__dirname, "..");
const legacyCss = fs.readFileSync(path.join(root, "styles-terminal-system.css"), "utf8");
// Historical theme assertions still check its retained construction, while the
// raw selectors must exclude the reconstructed Analytics screen.
const css = legacyCss.replaceAll('[data-screen="analytics"]:not([data-ref-owned])', '[data-screen="analytics"]');
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

test("legacy section construction remains available but cannot restyle owned Analytics", () => {
  assert.doesNotMatch(legacyCss, /\[data-screen="analytics"\](?!:not\(\[data-ref-owned\]\))/);
  assert.match(css, /Analytics and Activity use Home's flat, data-first section rhythm/);
  assert.match(css, /body\.product-v2 \.app-frame :is\(\[data-screen="analytics"\],\[data-screen="activity"\]\)>\.page-header\s*\{/);
  assert.match(css, /\[data-screen="analytics"\] :is\(\.graph-card,\.utility-card\)[\s\S]*?border-bottom:1px solid var\(--terminal-line\)/);
  assert.match(css, /\[data-screen="analytics"\] \.insight-grid article[\s\S]*?background:transparent/);
  assert.match(css, /\[data-screen="activity"\] \.activity-overview[\s\S]*?border-radius:0/);
  assert.match(css, /\[data-screen="activity"\] \.activity-row[\s\S]*?border-bottom:1px solid var\(--terminal-line\)/);
  assert.match(css, /body\.product-v2 \.app-frame \[data-screen="analytics"\] :is\(\.utility-hero,\.graph-card,\.insight-grid,\.utility-card\)[\s\S]*?border-radius:26px/);
  assert.match(css, /body\.product-v2 \.app-frame \[data-screen="analytics"\] :is\(\.utility-hero,\.graph-card,\.insight-grid,\.utility-card\)[\s\S]*?background:linear-gradient/);
  assert.match(css, /body\.product-v2 \.app-frame \[data-screen="analytics"\] :is\(\.utility-hero,\.graph-card,\.insight-grid,\.utility-card\)[\s\S]*?box-shadow:inset/);
  assert.match(css, /\[data-screen="analytics"\][^\n]*\.dot-matrix-text/);
  assert.match(css, /body\.product-v2 \.app-frame:is\(\.has-wallet,\.is-home-screen\) :is\(\[data-screen="gifts"\],\[data-screen="stickers"\]\) \.control-bar\{[\s\S]*?display:grid!important/);
  assert.match(css, /\.app-frame \.tx-sheet\{left:50%;right:auto;width:min\(390px,100vw\)/);
  assert.match(css, /\.app-frame \.wallet-action-panel\{width:100%;min-width:0/);
});

test("analytics and activity retain their usable controls and visible data regions", () => {
  assert.match(html, /data-screen="analytics"[\s\S]*?id="analyticsPortfolioValue"[\s\S]*?id="analyticsBreakdown"/);
  assert.match(html, /data-screen="activity"[\s\S]*?id="activityTotalCount"[\s\S]*?id="activitySearch"[\s\S]*?data-activity-filter="All"/);
  assert.match(html, /class="wallet-action-panel" role="dialog" aria-modal="true" aria-labelledby="walletActionTitle"/);
  assert.match(html, /class="tx-sheet-panel" role="dialog" aria-modal="true" aria-labelledby="txAmountTitle"/);
  assert.match(html, /role="button" tabindex="0" data-screen-target="stickers"/);
});

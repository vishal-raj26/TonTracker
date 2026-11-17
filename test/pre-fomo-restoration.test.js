"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = name => fs.readFileSync(path.join(__dirname, "..", name), "utf8");
test("reference presentation preserves legacy layout without the Fomo structure opt-in", () => {
  const html = read("index.html");
  assert.match(html, /<body class="product-v2 reference-ui">/);
  assert.match(html, /styles-reference-ui\.css/);
  assert.doesNotMatch(html, /href="\.\/styles-product-system\.css/);
  assert.match(html, /styles-terminal-system\.css\?v=pre-fomo/);
  assert.match(html, /styles-ui-restoration\.css/);
});
test("Home restores graph, featured assets, allocation and movers in original order", () => {
  const html = read("index.html").match(/<main[^>]+data-screen="home"[^>]*>[\s\S]*?<\/main>/)[0];
  const hooks = ['class="graph-card"', 'class="featured-collectibles"', 'class="allocation-card"', 'class="home-section movement-panel"', 'class="panel activity-panel'];
  hooks.forEach((hook, i) => { assert.ok(html.includes(hook), hook); if (i) assert.ok(html.indexOf(hooks[i - 1]) < html.indexOf(hook)); });
  assert.doesNotMatch(html, /home-inventory|portfolio-overview|home-allocation-pie/);
  assert.match(html, /Portfolio value over time/);
});
test("legacy Analytics and native collectible filters retain their functional hooks", () => {
  const html = read("index.html");
  const analytics = html.match(/<main[^>]+data-screen="analytics"[^>]*>[\s\S]*?<\/main>/)[0];
  assert.match(analytics, /Best performer/); assert.match(analytics, /Weakest performer/);
  assert.match(analytics, /class="utility-breakdown" id="analyticsBreakdown"/);
  for (const id of ["giftFilter", "stickerFilter"]) {
    assert.match(html, new RegExp('<select id="' + id + '">'));
    assert.doesNotMatch(html, new RegExp('<select id="' + id + '" hidden'));
  }
});
test("expanded collectible composition is restored without reverting data fixes", () => {
  const app = read("app.js");
  assert.match(app, /function applyCollectibleDetailHierarchy\(mount, assetId\) \{[\s\S]*?if \(!document.body.classList.contains\("portfolio-system"\)\) return;/);
  assert.match(app, /function updatePortfolioChartReadout/);
  assert.match(app, /function rangePnl/);
  assert.match(app, /function openProductPreview/);
  assert.match(app, /const collectiblePayloadRequests = new Map/);
});

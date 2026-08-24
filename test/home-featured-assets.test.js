const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles-terminal-system.css"), "utf8");

test("places featured assets between portfolio history and allocation", () => {
  const graph = html.indexOf('<section class="graph-card">');
  const featured = html.indexOf('<section class="featured-collectibles"');
  const allocation = html.indexOf('<section class="allocation-card">');
  assert.ok(graph >= 0 && graph < featured);
  assert.ok(featured < allocation);
});

test("hides the history footprint until two real points exist", () => {
  assert.match(app, /const hasHistory = points\.length >= 2;/);
  assert.match(app, /graph\.classList\.toggle\("is-history-hidden", !hasHistory\);/);
  assert.match(styles, /\.graph-card\.is-history-hidden :is\(\.value-graph,\.portfolio-chart-footer\)\{\s*display:none;/);
});

test("builds featured candidates from every current wallet asset source", () => {
  assert.match(app, /\["gift", groupedAssetChildren\(giftAssets\)\]/);
  assert.match(app, /\["sticker", groupedAssetChildren\(stickerAssets\)\]/);
  assert.match(app, /\["token", latestVisibleTokens\]/);
  assert.match(app, /\["ton_dns", dnsAssets\]/);
  assert.match(app, /\["anonymous_number", anonymousNumberAssets\]/);
});

test("keeps a bounded seamless loop and routes cards through existing details", () => {
  assert.match(app, /const FEATURED_ASSET_LIMIT = 18;/);
  assert.match(app, /renderFeaturedAssetCard\(candidate, false\)/);
  assert.match(app, /target\.classList\.contains\("featured-asset-card"\) && openFeaturedAsset\(target\)/);
  assert.match(styles, /@keyframes featured-assets-flow\{\s*to\{transform:translate3d\(-50%,0,0\)\}/);
});

test("keeps the featured carousel edge-to-edge without horizontal padding", () => {
  assert.match(styles, /\.featured-collectibles-viewport\{[\s\S]*?margin-inline:calc\(var\(--screen-gutter\) \* -1\);/);
  assert.match(styles, /\.featured-collectibles-sequence\{[\s\S]*?margin-right:10px;\s*padding:0;/);
});

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const styles = fs.readFileSync(path.join(root, "styles-terminal-system.css"), "utf8");
const productStyles = fs.readFileSync(path.join(root, "styles-product-system.css"), "utf8");

test("restored Home orders graph, featured assets, allocation and movement before activity", () => {
  const home = html.match(/<main[^>]+data-screen="home"[^>]*>[\s\S]*?<\/main>/)?.[0] || "";
  const hooks = ['class="graph-card"', 'class="featured-collectibles"', 'class="allocation-card"', 'class="home-section movement-panel"', 'class="panel activity-panel'];
  hooks.forEach((hook, i) => { assert.ok(home.includes(hook)); if (i) assert.ok(home.indexOf(hooks[i-1]) < home.indexOf(hook)); });
  assert.doesNotMatch(home, /portfolio-overview|home-inventory|homeAllocationPie/);
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
  assert.doesNotMatch(app, /dnsAssets|anonymousNumberAssets|usernameAssets/);
});

test("renders a bounded swipeable preview in value order without losing detail routes", () => {
  const track = { innerHTML: "", replaceChildren() { this.innerHTML = ""; } };
  const viewport = { dataset: {}, addEventListener() {} };
  const section = { hidden: true, querySelector: (selector) => selector.includes("viewport") ? viewport : track };
  let candidates = Array.from({ length: 15 }, (_, index) => ({ assetId: `asset-${index}`, valueUsd: index }));
  const source = app.slice(app.indexOf("function renderFeaturedCollectibles()"), app.indexOf("function openFeaturedAsset("));
  vm.runInNewContext(`${source}; renderFeaturedCollectibles();`, {
    document: { querySelector: () => section }, window: { setInterval() {} }, walletConnected: false, telegramConnected: false, HOME_HOLDING_LIMIT: 12, scheduleCollectibleMediaViewportSync() {},
    featuredAssetCandidates: () => candidates,
    renderFeaturedAssetCard: (candidate) => `<button data-asset="${candidate.assetId}"></button>`,
    initCollectibleAnimations() {},
  });
  assert.equal(section.hidden, false);
  assert.equal((track.innerHTML.match(/<button/g) || []).length, 12);
  assert.deepEqual([...track.innerHTML.matchAll(/data-asset="([^"]+)"/g)].map((m) => m[1]), Array.from({length:12},(_,i)=>`asset-${14-i}`));
  assert.doesNotMatch(track.innerHTML, /aria-hidden|sequence/);
  candidates = [];
  vm.runInNewContext(`${source}; renderFeaturedCollectibles();`, {
    document: { querySelector: () => section }, walletConnected: false, telegramConnected: false, HOME_HOLDING_LIMIT: 12,
    featuredAssetCandidates: () => candidates,
  });
  assert.equal(section.hidden, true);
  assert.equal(track.innerHTML, "");
  vm.runInNewContext(`${source}; renderFeaturedCollectibles();`, {
    document: { querySelector: () => section }, walletConnected: true, telegramConnected: false, HOME_HOLDING_LIMIT: 12,
    featuredAssetCandidates: () => [],
  });
  assert.equal(section.hidden, false);
  assert.match(track.innerHTML, /No priced highlights yet/);
  assert.match(app, /target\.classList\.contains\("featured-asset-card"\) && openFeaturedAsset\(target\)/);
});

test("holdings autoplay advances, reverses and pauses for interaction, hidden screens and reduced motion", () => {
  let tick, reduced = false, active = true, interacting = false, now = 10000;
  const listeners = {};
  const viewport = { scrollLeft: 0, scrollWidth: 1000, clientWidth: 300,
    addEventListener: (event, fn) => { listeners[event] = fn; },
    matches: () => interacting,
    querySelectorAll: () => [{ offsetLeft: 0 }, { offsetLeft: 280 }],
    scrollTo: options => { assert.equal(options.behavior, "smooth"); viewport.scrollLeft = options.left; } };
  const document = { hidden: false };
  const section = { hidden: false, closest: () => active };
  const source = app.slice(app.indexOf("function bindHomeHoldingsAutoplay("), app.indexOf("function openFeaturedAsset("));
  vm.runInNewContext(`${source}; bindHomeHoldingsAutoplay(viewport, section);`, {
    viewport, section, document, Date: { now: () => now },
    window: { setInterval: (fn, ms) => { tick = fn; assert.equal(ms, 4000); }, matchMedia: () => ({ matches: reduced }) },
  });
  tick(); assert.equal(viewport.scrollLeft, 280);
  interacting = true; tick(); assert.equal(viewport.scrollLeft, 280);
  interacting = false; reduced = true; tick(); assert.equal(viewport.scrollLeft, 280);
  reduced = false; active = false; tick(); assert.equal(viewport.scrollLeft, 280);
  active = true; document.hidden = true; tick(); assert.equal(viewport.scrollLeft, 280);
  document.hidden = false; listeners.pointerdown(); tick(); assert.equal(viewport.scrollLeft, 280);
  now += 8001; viewport.scrollLeft = 700; tick(); assert.equal(viewport.scrollLeft, 420);
});

test("restored featured cards retain the original ranking cue and Analytics composition", () => {
  assert.match(html, /id="featuredCollectiblesTitle">Featured assets/);
  assert.match(html, /aria-label="Live portfolio ranking"/);
  assert.match(html, /class="featured-collectibles-viewport"/);
  const analytics = html.match(/<main[^>]+data-screen="analytics"[^>]*>[\s\S]*?<\/main>/)?.[0] || "";
  assert.equal((analytics.match(/metric-skeleton-large/g) || []).length, 2);
  assert.match(analytics, /Best performer/); assert.match(analytics, /Weakest performer/);
  assert.match(analytics, /class="utility-breakdown" id="analyticsBreakdown"/);
});


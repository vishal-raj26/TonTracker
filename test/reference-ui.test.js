"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const read = name => fs.readFileSync(path.join(__dirname, "..", name), "utf8");

test("reference system has a black/white base presentation layer loaded last", () => {
  const html = read("index.html"), css = read("styles-reference-ui.css");
  assert.ok(html.indexOf("styles-reference-ui.css") > html.indexOf("styles-ui-restoration.css"));
  for (const color of ["#080808", "#111111", "#181818", "#272727", "#ffffff", "#a0a0a0"]) assert.ok(css.includes(color));
  assert.match(css, /--ref-gutter: 20px/);
  assert.match(css, /--ref-radius: 24px/);
  assert.match(css, /prefers-reduced-motion/);
  assert.match(css, /focus-visible/);
  assert.doesNotMatch(css, /display:\s*none[^\n]*\.screen/);
});

test("sheet 03 measurements and all collectible depths share one row construction", () => {
  const css = read("styles-reference-ui.css"), source = read("app.js");
  for (const token of ["--ref-row-height: 80px", "--ref-row-padding: 20px", "--ref-art-size: 48px", "max-width: 393px"]) assert.ok(css.includes(token));
  assert.match(css, /padding: 15px var\(--ref-row-padding\)/);
  assert.match(css, /gap: var\(--ref-card-gap\)/);
  assert.match(css, /reference-row-value[\s\S]*text-align: right/);
  for (const [name, next] of [["renderGiftCard", "renderGiftBrand"], ["renderGiftBrandItem", "renderGiftModelGroup"], ["renderGiftIndividualItem", "giftBrandModelNumber"], ["renderStickerCard", "renderCollectiblePriceSkeletonCard"], ["renderStickerBrandItem", "marketSourceLabel"], ["renderCollectiblePriceSkeletonCard", "collectibleArtHtml"]]) {
    assert.match(source.slice(source.indexOf(`function ${name}(`), source.indexOf(`function ${next}(`)), /renderReferenceCollectibleRow\(asset,/);
  }
});

test("reference rows preserve identity, preview actions, values and unavailable/loading states", () => {
  const source = read("app.js");
  const fn = source.slice(source.indexOf("function renderReferenceCollectibleRow("), source.indexOf("function renderGiftCard("));
  const c = vm.createContext({ document: { body: { classList: { contains: () => true } } },
    escapeHtml: value => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;") });
  vm.runInContext(fn, c);
  const options = { target: "detail", title: "Gift <name>", secondary: "Model · Backdrop", count: "3 gifts",
    art: '<button data-gift-pfp-tray="collection">Preview</button>', value: "$123.45", note: "Holding value", performance: '<div class="holding-performance">24h change</div>' };
  const row = c.renderReferenceCollectibleRow({ id: 'gift"1', floorUsd: 123.45 }, options);
  for (const text of ['data-asset="gift&quot;1"', 'data-screen-target="detail"', "Gift &lt;name>", "Model · Backdrop", "3 gifts", "$123.45", "Holding value", "data-gift-pfp-tray", "24h change"]) assert.ok(row.includes(text));
  assert.doesNotMatch(row, /is-value-unavailable|metric-skeleton/);
  const unavailable = c.renderReferenceCollectibleRow({ id: "gift" }, { ...options, value: "Price unavailable", note: "No verified price" });
  assert.match(unavailable, /is-value-unavailable/);
  assert.match(unavailable, /No verified price/);
  const loading = c.renderReferenceCollectibleRow({ id: "gift" }, { ...options, loading: true });
  assert.match(loading, /Price loading/);
  assert.match(loading, /metric-skeleton/);
  assert.doesNotMatch(loading, /\$123\.45/);
});

test("reference values remain accessible text, including zero and unavailable states", () => {
  const source = read("app.js");
  const fn = source.slice(source.indexOf("function renderDotMatrixText("), source.indexOf("function walletHoldingCount("));
  const element = { textContent: "", querySelector: () => null, dataset: { dotText: "OLD" }, classList: { remove() {} }, removeAttribute() {} };
  const context = vm.createContext({ document: { body: { classList: { contains: c => c === "reference-ui" } } } });
  vm.runInContext(fn + ";this.render = renderDotMatrixText", context);
  for (const value of ["$4,837.03", "Unavailable", 0]) {
    context.render(element, value);
    assert.equal(element.textContent, String(value));
    assert.equal(element.dataset.dotText, undefined);
  }
  assert.match(read("terminal-system.js"), /classList\.contains\("reference-ui"\)\) return/);
});

test("balance typography preserves the complete formatted financial value and accessible label", () => {
  const source = read("app.js");
  const helper = source.slice(source.indexOf("function renderReferenceFinancialValue("), source.indexOf("function resetPortfolioHeader("));
  const c = vm.createContext({ escapeHtml: value => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;") });
  vm.runInContext(helper, c);
  for (const value of ["$0.00", "$123,456.78", "12.34 GRAM"]) {
    const attributes = {};
    const element = { setAttribute: (key, text) => { attributes[key] = text; } };
    c.renderReferenceFinancialValue(element, value);
    assert.equal(attributes["aria-label"], value);
    assert.equal(element.innerHTML.replace(/<[^>]+>/g, ""), value);
    assert.match(element.innerHTML, /reference-value-fraction/);
  }
  const element = { setAttribute() {} };
  c.renderReferenceFinancialValue(element, "Unavailable");
  assert.equal(element.textContent, "Unavailable");
});

test("detail artwork fits its reference grid and token hero uses the same reading order", () => {
  const css = read("styles-reference-ui.css");
  const stage = css.slice(css.indexOf('.gift-detail-hero-inner > :is(.gift-detail-art-stage'), css.indexOf('.gift-detail-hero-inner :is(.gift-detail-hero-art'));
  for (const rule of ['width: 96px !important', 'max-width: 96px !important', 'min-width: 0 !important', 'height: 96px !important']) assert.ok(stage.includes(rule));
  assert.match(css, /is-token-detail \.enhanced-detail-hero[\s\S]*grid-template-columns: minmax\(0, 1fr\) 48px/);
  assert.match(css, /is-token-detail #detailValue[\s\S]*justify-content: flex-start !important/);
  assert.match(css, /width: min\(353px, calc\(100% - 40px\)\)/);
});

test("all existing screen containers and navigation destinations are preserved", () => {
  const html = read("index.html");
  const screens = [...html.matchAll(/<main[^>]+data-screen="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(screens, ["home", "assets", "tokens", "gifts", "gift-brand", "stickers", "sticker-brand", "analytics", "watchlist", "activity", "detail", "wallets", "settings"]);
  const nav = html.match(/<nav class="dock five"[\s\S]*?<\/nav>/)[0];
  assert.deepEqual([...nav.matchAll(/data-screen-target="([^"]+)"/g)].map(m => m[1]), ["home", "assets", "analytics", "watchlist", "settings"]);
});

test("navigation uses the supplied sheet orb without a chart glyph over it", () => {
  const css = read("styles-reference-ui.css");
  const dock = css.slice(css.indexOf('/* The existing five destinations'), css.indexOf('.dock-indicator { display: none'));
  assert.match(dock, /height: 79px/);
  assert.match(dock, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\)/);
  assert.match(dock, /padding: 9px 4px/);
  assert.match(dock, /reference-nav-orb\.png/);
  assert.match(dock, /\[data-screen-target="analytics"\] svg \{ visibility: hidden/);
  assert.ok(fs.existsSync(path.join(__dirname, "..", "assets/branding/reference-nav-orb.png")));
});

test("Home owns reference row, metric and section-action construction", () => {
  const css = read("styles-reference-ui.css"), html = read("index.html");
  const home = html.slice(html.indexOf('data-screen="home"'), html.indexOf('data-screen="assets"'));
  for (const component of ['asset-carousel', 'metric-pair', 'asset-list', 'portfolio-metric']) assert.ok(home.includes(`data-ref-component="${component}"`));
  assert.ok(home.indexOf('aria-label="Portfolio time range"') < home.indexOf('class="reference-history-head"'));
  assert.match(home, /reference-section-action[\s\S]*?View more[\s\S]*?chevron-right/);
  assert.match(css, /\.activity-row \{\s*display: grid; grid-template-columns: 48px minmax\(0, 1fr\) minmax\(0, 128px\)/);
  assert.match(css, /\.performer-asset-line :is\(img, em\)\[hidden\] \{ display: none !important/);
  assert.match(css, /\.performer-row article\[hidden\] \{ display: none !important/);
  assert.match(css, /#homeAllocation \.allocation-list \{[^}]*grid-template-columns: repeat\(6, minmax\(0, 1fr\)\)/);
  assert.match(css, /#homeAllocation \.donut-chart canvas \{ position: static/);
  assert.match(css, /#homeAllocation \.reference-allocation-stack[^}]*reference-allocation-mask\.svg/);
  assert.match(read("assets/branding/reference-allocation-mask.svg"), /width="44" height="4" rx="2"/);
  assert.match(css, /height: calc\(var\(--allocation-share, 0\) \* 1%\)/);
});

test("Home movers form a split comparison and activity is one continuous ledger", () => {
  const css = read("styles-reference-ui.css");
  assert.match(css, /:is\(\.movement-panel, \.activity-panel\)[\s\S]*?linear-gradient\(135deg, #ffffff36, #ffffff0d 45%, #ffffff1a\) border-box/);
  assert.match(css, /\.performer-row \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\); gap: 0 !important/);
  assert.match(css, /\.performer-row article \+ article[^}]*border-left: 1px solid/);
  assert.match(css, /\.activity-row\[data-tx-hash\] \{\s*position: relative; height: 76px/);
  assert.match(css, /\.activity-row \.activity-dot[\s\S]*?inset 0 1px 1px #ffffff18/);
  assert.match(css, /\.activity-row\[data-tx-hash\] \+ \.activity-row[^}]*border-top:/);
  assert.match(css, /\.home-ledger-empty \{ display: flex; flex-direction: column/);
});

test("reference charts keep exact observations while using the source gold line over the dark base", () => {
  let config;
  const context = { module: { exports: {} }, document: { body: { classList: { contains: c => c === "reference-ui" } } },
    Chart: class { constructor(_canvas, options) { config = options; } } };
  vm.runInNewContext(read("chart-platform.js"), context);
  const charts = context.module.exports;
  charts.renderConfigured("tokenPrice", [{ timestamp: 10, value: 1.54 }, { timestamp: 20, value: 1.57 }], {
    element: { tagName: "CANVAS", getContext() {} },
  });
  assert.deepEqual(Array.from(config.data.datasets[0].data), [1.54, 1.57]);
  assert.equal(config.data.datasets[0].borderColor, "#EBD992");
  assert.equal(config.data.datasets[0].borderWidth, 1.5);
  assert.equal(config.options.plugins.tooltip.backgroundColor, "#222222");
  assert.equal(config.options.plugins.tooltip.enabled, false);
  assert.equal(config.data.datasets[0].fill, false);
  assert.equal(config.options.scales.y.display, false);
  assert.equal(config.options.plugins.tooltip.cornerRadius, 24);
  charts.renderConfigured("portfolio", [{ timestamp: 10, value: 4 }], {
    element: { tagName: "CANVAS", getContext() {} }, onPointChange() {},
  });
  let dash;
  config.plugins[0].afterDatasetsDraw({
    getActiveElements: () => [{ index: 0 }], getDatasetMeta: () => ({ data: [{ x: 20 }] }),
    chartArea: { top: 0, bottom: 100 },
    ctx: { save() {}, restore() {}, setLineDash(value) { dash = Array.from(value); }, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {} },
  });
  assert.deepEqual(dash, [3, 4]);
  const rendered = [];
  charts.renderConfigured("portfolio", [{ timestamp: 10, value: 0 }, { timestamp: 20, value: 123.45 }], {
    element: { tagName: "CANVAS", getContext() {} },
    formatValue: point => `$${point.value.toFixed(2)}`,
    formatTick: point => `date-${point.timestamp}`,
  });
  config.plugins[0].afterDatasetsDraw({
    getActiveElements: () => [{ index: 0 }], getDatasetMeta: () => ({ data: [{ x: 20, y: 50 }] }),
    chartArea: { left: 0, right: 353, top: 0, bottom: 100 }, scales: { x: { options: { display: true } } },
    ctx: { save() {}, restore() {}, setLineDash() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {},
      roundRect() {}, fill() {}, arc() {}, measureText: text => ({ width: text.length * 7 }),
      fillText: text => rendered.push(text) },
  });
  assert.deepEqual(rendered, ["$0.00", "date-10"]);
});

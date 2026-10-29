"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const read = (name) => fs.readFileSync(path.join(__dirname, "..", name), "utf8");

test("Home readout exposes the selected recorded value without replacing current holdings", () => {
  const elements = { portfolioChartLabel: {}, portfolioChartValue: {} }, readout = {};
  const c = vm.createContext({ activePortfolioRange: () => "1D", portfolioHistoryRows: () => [{ value: 3000 },{ value: 3100 }],
    document: { getElementById: id => elements[id], querySelector: () => readout },
    money: value => `$${value}`, portfolioTimeLabel: timestamp => `Time ${timestamp}` });
  const source = read("app.js");
  vm.runInContext(source.slice(source.indexOf("function updatePortfolioChartReadout("), source.indexOf("function rangePnl(")), c);
  c.updatePortfolioChartReadout({ value: 3000, timestamp: 10 });
  assert.equal(elements.portfolioChartValue.textContent, "$3000");
  assert.equal(elements.portfolioChartLabel.textContent, "Time 10");
  c.updatePortfolioChartReadout();
  assert.equal(elements.portfolioChartValue.textContent, "$3100");
  assert.equal(elements.portfolioChartLabel.textContent, "Recorded value");
  c.portfolioHistoryRows = () => [{ value: 3100 }];
  c.updatePortfolioChartReadout();
  assert.equal(readout.hidden, true);
  c.portfolioHistoryRows = () => [];
  c.updatePortfolioChartReadout();
  assert.equal(readout.hidden, true);
  assert.equal(elements.portfolioChartValue.textContent, "—");
});

test("portfolio movement needs two valid observations rather than a default zero", () => {
  const source = read("app.js");
  const context = vm.createContext({ portfolioHistoryRows: () => [] });
  vm.runInContext(source.slice(source.indexOf("function rangePnl("), source.indexOf("function playHomeEntrance(")), context);
  for (const points of [[], [{ value: 100 }], [{ value: null }, { value: 100 }], [{ value: 0 }, { value: 100 }]]) {
    context.portfolioHistoryRows = () => points;
    assert.equal(context.rangePnl("1D").available, false);
    assert.equal(context.rangePnl("1D").pct, null);
  }
  context.portfolioHistoryRows = () => [{ value: 100 }, { value: 110 }];
  assert.equal(context.rangePnl("1D").pct, 10);
  context.portfolioHistoryRows = () => [{ value: 100 }, { value: 100 }];
  assert.equal(context.rangePnl("1D").available, true);
  assert.equal(context.rangePnl("1D").pct, 0);
  const allocation = source.slice(source.indexOf("function updateAllocationUi("), source.indexOf("function updateCategoryAndTopAsset("));
  assert.match(allocation, /renderDonut\(\);\s*resetPortfolioHeader\(\);/);
  const assets = source.slice(source.indexOf("function syncAssetsSummary("), source.indexOf("function updateAssetsPortfolioStrip("));
  assert.match(assets, /rangePnl\("1D"\)/);
  assert.doesNotMatch(assets, /homePortfolioChange/);
});

test("history ingestion and refresh preserve API values and timestamps", () => {
  const source = read("app.js");
  const context = vm.createContext({ console: { warn() {} }, homePortfolioValue: 45000,
    liveHistoryByRange: new Map(), liveHistoryPoints: [], loadingPortfolioRanges: new Set(),
    historyRangeState: new Map(), syncRangeLoadingButtons() {}, activePortfolioRange: () => "1D", liveWalletData: {} });
  vm.runInContext(source.slice(source.indexOf("function normalizeWalletHistory("), source.indexOf("function activePortfolioRange(")), context);
  vm.runInContext(source.slice(source.indexOf("function setLiveHistoryRange("), source.indexOf("function updateHistoryStatus(")), context);
  const input = [{ timestamp: "2026-10-03T12:00:00Z", valueUsd: 3000 }, { timestamp: "2026-10-04T12:00:00Z", valueUsd: 3100 }];
  const result = context.setLiveHistoryRange("1D", input);
  assert.equal(result.at(-1).value, 3100);
  assert.equal(result.at(-1).timestamp, Date.parse(input.at(-1).timestamp));
  context.pinCachedHistoryToCurrent();
  assert.equal(result.at(-1).value, 3100);
  assert.equal(result.at(-1).timestamp, Date.parse(input.at(-1).timestamp));
  assert.equal(context.normalizeWalletHistory([{ timestamp: input[0].timestamp, valueUsd: null }, { timestamp: "invalid", valueUsd: 10 }]).length, 0);
  assert.match(source, /History through \$\{portfolioTimeLabel\(latest.timestamp/);
  assert.match(source, /badge\.textContent = `History /);
});

test("restored presentation enables legacy values while retaining the optional redesign guard", () => {
  vm.runInNewContext(read("terminal-system.js"), {
    document: { body: { classList: { contains: (name) => name === "portfolio-system" } } },
  });
  assert.match(read("index.html"), /<body class="product-v2 reference-ui">/);
  assert.doesNotMatch(read("index.html"), /href="\.\/styles-product-system\.css/);
  assert.match(read("styles-product-system.css"), /font-variant-numeric: tabular-nums/);
});

test("collectible hierarchy preserves real sections and disclosure state", () => {
  class Element {
    constructor(name) { this.name = name; this.children = []; this.listeners = {}; }
    appendChild(node) {
      if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1);
      this.children.push(node); node.parent = this;
    }
    insert(node, offset) {
      const parent = this.parent;
      if (node.parent) node.parent.children.splice(node.parent.children.indexOf(node), 1);
      parent.children.splice(parent.children.indexOf(this) + offset, 0, node); node.parent = parent;
    }
    after(node) { this.insert(node, 1); }
    before(node) { this.insert(node, 0); }
    querySelector(selector) {
      if (selector === "h2") return { textContent: this.name };
      return this.children.find((node) => node.name === selector.replace(":scope > .", "")) || null;
    }
    addEventListener(name, callback) { this.listeners[name] = callback; }
  }
  const layout = new Element("layout");
  const names = ["gift-detail-hero-card", "Collection Stats", "gift-floor-card", "gift-sales-card", "Origin"];
  const sections = names.map((name) => new Element(name));
  sections.forEach((node) => layout.appendChild(node));
  const context = vm.createContext({ document: { body: { classList: { contains: () => true } }, createElement: (name) => new Element(name) }, Map });
  const source = read("app.js");
  vm.runInContext(source.slice(source.indexOf("const collectibleDisclosureState ="), source.indexOf("function renderGiftDetailPage(")), context);
  vm.runInContext('collectibleDisclosureState.set("gift:Origin", true)', context);
  context.applyCollectibleDetailHierarchy({ querySelector: () => layout }, "gift");
  assert.deepEqual(layout.children.slice(0, 3), [sections[0], sections[2], sections[3]]);
  assert.equal(layout.children[3].children[1], sections[1]);
  assert.equal(layout.children[4].children[1], sections[4]);
  assert.equal(layout.children[4].open, true);
  assert.equal(layout.children[4].children[0].textContent, "Origin");
  layout.children[4].open = false;
  layout.children[4].listeners.toggle();
  assert.equal(vm.runInContext('collectibleDisclosureState.get("gift:Origin")', context), false);
});

test("grouped top holdings use collection routes and detail dock is contextual", () => {
  assert.match(read("app.js"), /top\.category === "Gift" \? "gift-brand"[\s\S]{0,100}"sticker-brand"/);
  assert.match(read("app.js"), /classList\.toggle\("is-deep-detail", \["detail", "gift-brand", "sticker-brand"\]\.includes\(name\)\)/);
  assert.match(read("styles-product-system.css"), /is-deep-detail \.dock \{ display: none !important/);
});

test("holding notes distinguish aggregates, partial pricing and estimated constituents", () => {
  const source = read("app.js");
  const context = vm.createContext({ floorSourceLine: () => "Floor · 12 GRAM", isEstimatedAsset: (a) => a.estimated === true });
  vm.runInContext(source.slice(source.indexOf("function collectibleHoldingNote("), source.indexOf("function isEstimatedAsset(")), context);
  assert.equal(context.collectibleHoldingNote({ count: 1 }), "Floor · 12 GRAM");
  assert.equal(context.collectibleHoldingNote({ children: [{ floorUsd: 10 }, { floorUsd: 20 }] }), "Holding value");
  assert.equal(context.collectibleHoldingNote({ children: [{ floorUsd: 10, estimated: true }, { floorUsd: 0 }] }), "Holding value · 1/2 priced · Includes estimates");
});

test("back labels follow saved route titles instead of overwritten collection headers", () => {
  const source = read("app.js");
  const button = { dataset: { screenTarget: "assets" }, setAttribute(name, value) { this[name] = value; } };
  const navigationStack = [{ screen: "gift-brand", title: "Ice Creams" }];
  const context = vm.createContext({ navigationStack, document: { querySelector: () => button } });
  vm.runInContext(source.slice(source.indexOf("function syncContextualBackLabel("), source.indexOf("function navigationRouteKey(")), context);
  context.syncContextualBackLabel("detail");
  assert.equal(button["aria-label"], "Back to Ice Creams");
  navigationStack[0] = { screen: "home" };
  context.syncContextualBackLabel("detail");
  assert.equal(button["aria-label"], "Back to Home");
});

test("quiet performance metadata excludes unsupported zero P/L but preserves known performance", () => {
  const source = read("app.js");
  const context = vm.createContext({ signedMoney: (value) => `$${value}` });
  vm.runInContext(source.slice(source.indexOf("function collectiblePerformanceHtml("), source.indexOf("function renderGiftCard(")), context);
  assert.equal(context.collectiblePerformanceHtml({ floorUsd: 100, pnlUsd: 0, dailyUsd: 0 }), "");
  assert.equal(context.collectiblePerformanceHtml({ floorUsd: 100, initUsd: 100, pnlUsd: null }), "");
  assert.match(context.collectiblePerformanceHtml({ floorUsd: 100, initUsd: 100, pnlUsd: 0 }), /Unrealized P\/L/);
  assert.match(context.collectiblePerformanceHtml({ floorUsd: 100, dailyUsd: -5 }), /24h change.*negative/);
});

test("collection rows describe the whole holding instead of the first child's traits", () => {
  const source = read("app.js");
  const context = vm.createContext({
    escapeHtml: String, collectibleKey: String, money: (v) => `$${v}`,
    giftModelTrait: (a) => a.model, giftBackdropTrait: (a) => a.backdrop,
    collectibleHoldingNote: () => "Holding value", giftListPriceNote: () => "Holding value", collectibleArtHtml: () => "",
    giftModelEstimateHtml: () => "Individual model estimate",
    estimatedPillHtml: () => "Estimated badge", collectiblePerformanceHtml: () => "",
  });
  vm.runInContext(source.slice(source.indexOf("function renderReferenceCollectibleRow("), source.indexOf("function renderGiftCard(")), context);
  vm.runInContext(source.slice(source.indexOf("function renderGiftCard("), source.indexOf("function renderGiftBrand(")), context);
  const row = context.renderGiftCard({ id: "collection", name: "Ice Creams", count: 3, floorUsd: 50, model: "Citrus", backdrop: "Steel Grey", provenance: "Ice Creams · Reference", children: [{ model: "Citrus" }, { model: "Citrus" }, { model: "Beehive" }] });
  assert.match(row, /2 models/);
  assert.match(row, /3 gifts/);
  assert.match(row, /Holding value/);
  assert.doesNotMatch(row, /Steel Grey|Reference|Individual model estimate|Estimated badge/);
});

test("gift lists show one price basis while detail retains model evidence", () => {
  const source = read("app.js");
  const c = vm.createContext({ escapeHtml: String, money: (v)=>`$${v}`, marketSourceLabel: String,
    giftBrandMintLabel: (a)=>a.tag, giftBrandModelLabel: (a)=>a.model,
    giftBackdropTrait: (a)=>a.backdrop, giftDetailTitle: (a)=>a.name, collectibleArtHtml: ()=>"" });
  vm.runInContext(source.slice(source.indexOf("function renderReferenceCollectibleRow("), source.indexOf("function renderGiftCard(")), c);
  vm.runInContext(source.slice(source.indexOf("function floorSourceLine("), source.indexOf("function collectiblePerformanceHtml(")), c);
  vm.runInContext(source.slice(source.indexOf("function renderGiftIndividualItem("), source.indexOf("function giftBrandModelNumber(")), c);
  const asset = { id: "gift", name: "Ice Cream", model: "Beehive", backdrop: "Grape", tag: "#293555", floorUsd: 290, floorTon: 188.38, floorStatus: "estimated" };
  const html = c.renderGiftIndividualItem(asset);
  assert.match(html, /Ice Cream.*holding-mint-number.*#293555/);
  assert.match(html, /Estimated · 188.38 GRAM/);
  assert.doesNotMatch(html, /Model estimate|Floor ·|status-badge/);
  assert.match(c.floorSourceLine(asset), /^Estimated/);
  assert.equal(c.giftListPriceNote({ floorUsd: 10, floorSource: "last-sale" }), "Last sale");
  assert.equal(c.giftListPriceNote({}), "Price unavailable");
  const detail = source.slice(source.indexOf("function renderGiftDetailPage("), source.indexOf("function renderStickerDetailPage("));
  assert.match(detail, /giftModelEstimateHtml\(detail\)/);
});

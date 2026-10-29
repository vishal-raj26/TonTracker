"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

test("username normalization preserves indicative detail without adding portfolio value or stale estimates", () => {
  const source = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
  const fn = source.slice(source.indexOf("function normalizeIdentityAsset("), source.indexOf("function renderIdentityAssetRows("));
  const item = { username: "example", estimatedUsd: 100, floorUsd: 0, floorStatus: "indicative",
    valuationKind: "username-estimate-low", usernameValuationStatus: "indicative",
    valuedAt: new Date(Date.now() - 1000).toISOString(), staleAt: new Date(Date.now() + 60000).toISOString() };
  const sandbox = { item, identityAssetId: () => "fixture", identityTypeMeta: () => ({}), resolveTokenImage: value => value, usdTonRate: 0 };
  vm.runInNewContext(`${fn}\nthis.asset = normalizeIdentityAsset(item, 'telegram_username'); this.total = identityAssetValue(asset);`, sandbox);
  assert.equal(sandbox.asset.valuationKind, "username-estimate-low");
  assert.equal(sandbox.asset.estimatedUsd, 100);
  assert.equal(sandbox.total, 0);
  sandbox.item = { ...item, floorStatus: "processing", valuationKind: "processing" };
  vm.runInNewContext("this.asset = normalizeIdentityAsset(item, 'telegram_username');", sandbox);
  assert.equal(sandbox.asset.estimatedUsd, 0);
});

test("cached username values cannot bypass publication eligibility or evidence expiry", () => {
  const source = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
  const fn = source.slice(source.indexOf("function normalizeIdentityAsset("), source.indexOf("function renderIdentityAssetRows("));
  const good = { type: "telegram_username", username: "example", floorStatus: "priced",
    valuationKind: "username-estimate", floorUsd: 100, estimatedUsd: 100,
    usernameValuationStatus: "estimated", portfolioEligible: true, confidenceBand: "medium",
    valuedAt: new Date(Date.now() - 1000).toISOString(), staleAt: new Date(Date.now() + 60000).toISOString() };
  const sandbox = { item: good, identityAssetId: () => "fixture", identityTypeMeta: () => ({}),
    resolveTokenImage: value => value, usdTonRate: 0 };
  vm.runInNewContext(fn, sandbox);
  const check = (patch) => {
    sandbox.item = { ...good, ...patch };
    vm.runInNewContext("this.asset = normalizeIdentityAsset(item, 'telegram_username'); this.total = identityAssetValue(asset); this.rawTotal = identityAssetValue(item);", sandbox);
    return sandbox;
  };
  assert.equal(check({}).total, 100);
  for (const patch of [{ portfolioEligible: false }, { portfolioEligible: undefined },
    { confidenceBand: "low" }, { usernameValuationStatus: "indicative" }]) {
    const result = check(patch);
    assert.equal(result.total, 0);
    assert.equal(result.rawTotal, 0);
    assert.equal(result.asset.estimatedUsd, 100, "fresh indicative evidence remains usable in detail");
  }
  for (const patch of [{ valuationStale: true }, { staleAt: new Date(0).toISOString() },
    { staleAt: null }, { staleAt: "invalid" }, { valuedAt: null },
    { valuedAt: new Date(Date.now() + 10000).toISOString() },
    { usernameValuationStatus: "unavailable" }, { floorUsd: Infinity, estimatedUsd: Infinity }]) {
    const result = check(patch);
    assert.equal(result.total, 0);
    assert.equal(result.rawTotal, 0);
    assert.equal(result.asset.estimatedUsd, 0);
  }
  const result = check({ valuationKind: "active-listing", floorTon: 10 });
  assert.equal(result.total, 0, "seller asks are not username portfolio values");
  assert.equal(result.rawTotal, 0);
});

test("username rows distinguish indicative estimates, unavailable evidence and processing", () => {
  const source = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
  const functions = source.slice(source.indexOf("function normalizeIdentityAsset("), source.indexOf("function renderIdentityAssetScreens("));
  const list = { innerHTML: "" };
  const item = { username: "example", floorStatus: "indicative", valuationKind: "username-estimate-low",
    estimatedUsd: 100, usernameValuationStatus: "indicative", portfolioEligible: false,
    valuedAt: new Date(Date.now() - 1000).toISOString(), staleAt: new Date(Date.now() + 60000).toISOString() };
  const sandbox = { item, usernameAssets: [], dnsAssets: [], anonymousNumberAssets: [],
    identityAssetId: () => "fixture", identityTypeMeta: () => ({ key: "usernames", listId: "usernames" }),
    resolveTokenImage: value => value, usdTonRate: 0, isSectionLoading: () => false,
    document: { getElementById: () => list }, window: {}, escapeHtml: value => String(value),
    money: value => `$${value.toFixed(2)}` };
  vm.runInNewContext(functions, sandbox);
  const render = patch => {
    sandbox.item = { ...item, ...patch };
    vm.runInNewContext("usernameAssets.splice(0, usernameAssets.length, normalizeIdentityAsset(item, 'telegram_username')); renderIdentityAssetRows('telegram_username');", sandbox);
    return list.innerHTML;
  };
  assert.match(render({}), /\$100\.00/);
  assert.match(list.innerHTML, /Indicative/);
  assert.doesNotMatch(list.innerHTML, /Evaluating/);
  assert.match(render({ floorStatus: "unavailable", valuationKind: "unavailable", usernameValuationStatus: "unavailable" }), /Unavailable/);
  assert.doesNotMatch(list.innerHTML, /Evaluating|\$100\.00/);
  assert.match(render({ floorStatus: "processing", valuationKind: "processing", usernameValuationStatus: "processing" }), /Evaluating/);
  assert.match(render({ valuationStale: true }), /Unavailable/);
  assert.doesNotMatch(list.innerHTML, /\$100\.00|Market estimate/);
});

test("username detail labels estimated values, exposes evidence, and escapes names", () => {
  const source = fs.readFileSync(path.join(__dirname, "../app.js"), "utf8");
  const fn = source.slice(source.indexOf("function renderIdentityAssetDetail("), source.indexOf("function renderAssetDetail("));
  const mount = { innerHTML: "" };
  const detail = { type: "telegram_username", name: "@example", tone: "", icon: "at-sign", verified: true,
    valuationKind: "username-estimate", estimatedUsd: 100, floorUsd: 100, rangeLowUsd: 50, rangeHighUsd: 200,
    usernameValuationStatus: "estimated", valuedAt: new Date(Date.now() - 1000).toISOString(),
    staleAt: new Date(Date.now() + 60000).toISOString(),
    evidenceCount: 2, confidenceBand: "low", currentListingGram: 0, currentBidGram: 0,
    valuationExplanation: { lastSaleAnchor: { priceUsd: 90, soldAt: "2025-01-01T00:00:00Z" },
      comparables: [{ username: "<unsafe>", priceUsd: 90, exact: true, reasons: ["own completed sale"] }] } };
  const sandbox = { document: { getElementById: () => mount, querySelector: () => null },
    window: {}, detail, toggleGiftDetailLayout() {}, setText() {},
    identityTypeMeta: () => ({ label: "Telegram username", collection: "Telegram Usernames" }),
    identityAssetValue: (value) => value.floorUsd,
    iconCueHtml: () => "Live market signals",
    money: (value) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value),
    escapeHtml: (value) => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"),
  };
  const freshFn = source.slice(source.indexOf("function usernameEstimateFresh("), source.indexOf("function renderIdentityAssetRows("));
  vm.runInNewContext(freshFn, sandbox);
  vm.runInNewContext(`${fn}\nrenderIdentityAssetDetail(detail);`, sandbox);
  assert.match(mount.innerHTML, /Estimated market value/);
  assert.match(mount.innerHTML, /Confidence/);
  assert.match(mount.innerHTML, /Historical sale evidence/);
  assert.match(mount.innerHTML, /model estimate, not an executable quote/);
  assert.match(mount.innerHTML, /premium names may be substantially mispriced/);
  assert.match(mount.innerHTML, /current-market accuracy has not been independently qualified/);
  assert.match(mount.innerHTML, /&lt;unsafe&gt;/);
  assert.doesNotMatch(mount.innerHTML, /<unsafe>/);
  sandbox.identityAssetValue = () => 0;
  sandbox.detail = { ...detail, valuationStale: true, valuationExplanation: {} };
  vm.runInNewContext("renderIdentityAssetDetail(detail);", sandbox);
  assert.match(mount.innerHTML, /Unavailable/);
  assert.doesNotMatch(mount.innerHTML, /\$100\.00|Valuation range|Evaluating/);
  sandbox.detail = { ...sandbox.detail, usernameValuationStatus: "processing" };
  vm.runInNewContext("renderIdentityAssetDetail(detail);", sandbox);
  assert.match(mount.innerHTML, /Evaluating/);
  sandbox.detail = { ...detail, currentBidGram: 10, currentMarket: { verified: true,
    observedAt: new Date(Date.now() - 1000).toISOString(), staleAt: new Date(Date.now() + 60000).toISOString() } };
  vm.runInNewContext("renderIdentityAssetDetail(detail);", sandbox);
  assert.match(mount.innerHTML, /Verified bid|Live market signals/);
  sandbox.detail.currentMarket.staleAt = new Date(0).toISOString();
  vm.runInNewContext("renderIdentityAssetDetail(detail);", sandbox);
  assert.doesNotMatch(mount.innerHTML, /Verified bid|Live market signals/);
  sandbox.detail = detail;
  vm.runInNewContext("renderIdentityAssetDetail(detail);", sandbox);
  sandbox.detail = detail;
  sandbox.identityAssetValue = value => value.floorUsd;
  vm.runInNewContext("renderIdentityAssetDetail(detail);", sandbox);
  if (process.env.USERNAME_UI_FIXTURE === "1") {
    fs.writeFileSync(path.join(__dirname, "fixtures/username-detail-rebuild.html"), `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Username detail test fixture</title><link rel="stylesheet" href="/styles.css"><link rel="stylesheet" href="/styles-product-v2.css"><link rel="stylesheet" href="/styles-terminal-system.css"></head><body><main class="app-frame" tabindex="0" style="overflow-y:auto"><p>Synthetic UI test — not live market values</p>${mount.innerHTML}</main></body></html>`);
  }
});

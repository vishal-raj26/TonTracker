"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const htmlSource = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const serverSource = fs.readFileSync(path.join(__dirname, "..", "server.js"), "utf8");
const terminalSource = fs.readFileSync(path.join(__dirname, "..", "terminal-system.js"), "utf8");

test("native currency is presented as GRAM while TON network labels remain intact", () => {
  assert.match(appSource, /name: "GRAM"/);
  assert.match(appSource, /symbol: "GRAM"/);
  assert.match(appSource, /category: "Native GRAM"/);
  assert.match(appSource, /GRAM_TOKEN_IMAGE_URL/);
  assert.match(appSource, /GRAM_TOKEN_IMAGE_URL = "\/assets\/branding\/gram-diamond-mark\.svg"/);
  assert.match(serverSource, /nativeTonLogo = "\/assets\/branding\/gram-diamond-mark\.svg"/);
  assert.doesNotMatch(appSource, /raw\.githubusercontent\.com\/tonkeeper\/opentonapi/);
  assert.doesNotMatch(serverSource, /raw\.githubusercontent\.com\/tonkeeper\/opentonapi/);
  assert.ok(fs.existsSync(path.join(__dirname, "..", "assets", "branding", "gram-diamond-mark.svg")));
  assert.match(appSource, /<h2>TON Network<\/h2>/);
  assert.match(htmlSource, /Connect TON Wallet/);
  assert.match(htmlSource, /TON DNS/);
});

test("assets monetary value is not converted to dot-matrix display", () => {
  assert.doesNotMatch(terminalSource, /\[data-screen="assets"\] \.portfolio-strip article:first-child b/);
  assert.doesNotMatch(appSource, /renderAssetsDotMatrix\(\)[\s\S]{0,400}portfolio-strip article:first-child b/);
});

test("native amount and currency controls do not expose TON as the currency label", () => {
  assert.doesNotMatch(appSource, /(?:toFixed|toLocaleString|compactNumber)[^\n]{0,180}\}\s*TON/);
  assert.doesNotMatch(htmlSource, />TON<\/b>/);
  assert.match(htmlSource, /data-currency-option="GRAM"[^>]*>GRAM<\/button>/);
  assert.match(htmlSource, /id="txAmountTitle">0 GRAM<\/h2>/);
});

test("GRAM detail uses the native TON market data path", () => {
  assert.match(serverSource, /GRAM:\s*"the-open-network"/);
  assert.match(serverSource, /TONCOIN:\s*"the-open-network"/);
  assert.match(serverSource, /function isNativeTonSymbol\(symbol = ""\)/);
  assert.match(serverSource, /if \(!address && isNativeTonSymbol\(symbol\)\)/);
  assert.match(serverSource, /getRateChart\(nativeTon \? "TON" : address/);
});

test("unpriced gifts accept only verified detail floors while preserving known import prices", () => {
  assert.match(appSource, /function applyGiftDetailPayloadWithPriceFallback\(detail, payload = \{\}\)/);
  assert.match(appSource, /const hasKnownPrice = Number\(detail\.floorUsd \|\| detail\.floorTon \|\| 0\) > 0/);
  assert.match(appSource, /const hasVerifiedDetailPrice = isVerifiedGiftFloor\(floor\) \|\| isEstimatedGiftFloor\(floor\)/);
  assert.match(appSource, /applyFloor: !hasKnownPrice && hasVerifiedDetailPrice/);
  assert.match(appSource, /applyGiftDetailPayloadWithPriceFallback\(asset, payload\)/);
});

test("gift detail cache retries payloads that have no usable floor", () => {
  assert.match(appSource, /exact-combo-detail-v6-resilient/);
  assert.match(appSource, /giftDetailPayloadHasDisplayPrice\(cached\.value\)/);
  assert.match(appSource, /!giftDetailPayloadHasDisplayPrice\(cachedPayload\)/);
  assert.match(appSource, /giftAssets\.forEach\(\(asset\) => \{[\s\S]{0,180}syncCollectibleGroupFromChildren\(asset\)/);
  assert.match(appSource, /if \(name === "gifts"\) \{/);
  assert.match(appSource, /renderGiftGrid\(\);\r?\n\s*updateCollectibleSummaryBanner\("gifts"\);/);
});

test("gift model estimate is hydrated and shown separately from the exact combo floor", () => {
  assert.match(serverSource, /modelFloorTon/);
  assert.match(serverSource, /modelFloorSource/);
  assert.match(appSource, /function applyGiftModelEstimate\(asset = \{\}, model = \{\}\)/);
  assert.match(appSource, /model\.traitMetrics\?\.Model \|\| model\.traitMetrics\?\.model/);
  assert.match(appSource, /function prefetchGiftModelEstimates\(assets = giftAssets\)/);
  // Model evidence belongs in the detail view, not every compact holding row.
  assert.match(appSource, /giftModelEstimateHtml\(detail\)/);
  assert.match(appSource, /Model estimate/);
  assert.match(appSource, /asset\.modelFloor = \{/);
});

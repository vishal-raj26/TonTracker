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
  assert.match(htmlSource, /data-currency-option="GRAM">GRAM<\/b>/);
  assert.match(htmlSource, /id="txAmountTitle">0 GRAM<\/h2>/);
});

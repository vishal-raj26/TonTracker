"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const appSource = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const htmlSource = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

test("native currency is presented as GRAM while TON network labels remain intact", () => {
  assert.match(appSource, /name: "GRAM"/);
  assert.match(appSource, /symbol: "GRAM"/);
  assert.match(appSource, /category: "Native GRAM"/);
  assert.match(appSource, /GRAM_TOKEN_IMAGE_URL/);
  assert.match(appSource, /<h2>TON Network<\/h2>/);
  assert.match(htmlSource, /Connect TON Wallet/);
  assert.match(htmlSource, /TON DNS/);
});

test("native amount and currency controls do not expose TON as the currency label", () => {
  assert.doesNotMatch(appSource, /(?:toFixed|toLocaleString|compactNumber)[^\n]{0,180}\}\s*TON/);
  assert.doesNotMatch(htmlSource, />TON<\/b>/);
  assert.match(htmlSource, /data-currency-option="GRAM">GRAM<\/b>/);
  assert.match(htmlSource, /id="txAmountTitle">0 GRAM<\/h2>/);
});

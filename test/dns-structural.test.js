"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  ROUTES,
  buildPatternSignature,
  classifyTonDns,
  normalizeTonDnsLabel,
  normalizeTonDnsName,
  splitGraphemes,
} = require("../lib/dns-structural");

test("normalizes TON DNS names without corrupting Unicode", () => {
  assert.equal(normalizeTonDnsLabel("  ＡＩ。ＴＯＮ。 "), "ai");
  assert.equal(normalizeTonDnsName("Cafe\u0301.TON"), "café.ton");
  assert.equal(splitGraphemes("👨‍👩‍👧‍👦").length, 1);
});

test("builds deterministic grapheme-level signatures", () => {
  assert.equal(buildPatternSignature("1662"), "ABBC");
  assert.equal(buildPatternSignature("8888"), "AAAA");
  assert.equal(buildPatternSignature("abccba"), "ABCCBA");
});

test("classifies numeric scarcity and pattern features", () => {
  const numeric = classifyTonDns("1662.ton");
  assert.equal(numeric.primaryRoute, ROUTES.NUMERIC);
  assert.equal(numeric.scarcityClass, "4N");
  assert.equal(numeric.patternSignature, "ABBC");
  assert.equal(numeric.maxRunLength, 2);
  assert.ok(numeric.routes.includes(ROUTES.PATTERN));

  const repeated = classifyTonDns("8888.ton");
  assert.equal(repeated.patternSignature, "AAAA");
  assert.equal(repeated.maxRunLength, 4);
  assert.deepEqual(repeated.repeatedSubstring, { unit: "8", repeats: 4 });
});

test("covers short-letter, alphanumeric, and explicit semantic hint routes", () => {
  assert.equal(classifyTonDns("ai.ton").primaryRoute, ROUTES.SHORT_LETTERS);
  assert.equal(classifyTonDns("web3.ton").primaryRoute, ROUTES.ALPHANUMERIC);
  assert.equal(classifyTonDns("supernova.ton", {
    dictionaryWords: ["super", "nova"],
  }).primaryRoute, ROUTES.DICTIONARY_COMPOUND);
  assert.equal(classifyTonDns("NASA.ton", {
    acronymHints: ["nasa"],
  }).primaryRoute, ROUTES.ACRONYM);
  assert.equal(classifyTonDns("london.ton", {
    entityHints: ["london"],
  }).primaryRoute, ROUTES.ENTITY);
  assert.equal(classifyTonDns("tonclub.ton").primaryRoute, ROUTES.CRYPTO_TON);
});

test("covers brandable, multilingual, pattern, unusual-valid, and residual routes", () => {
  assert.equal(classifyTonDns("zoriva.ton").primaryRoute, ROUTES.INVENTED_BRANDABLE);
  assert.equal(classifyTonDns("東京.ton").primaryRoute, ROUTES.MULTILINGUAL);
  assert.equal(classifyTonDns("abccba.ton").primaryRoute, ROUTES.PATTERN);
  assert.equal(classifyTonDns("cool💎.ton").primaryRoute, ROUTES.UNUSUAL_VALID);
  assert.equal(classifyTonDns("xqzplmtr.ton").primaryRoute, ROUTES.RESIDUAL);
});

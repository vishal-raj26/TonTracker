"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { createHistoricalCompoundResolver } = require("../lib/username-compound-evidence");
const words = new Set(["rain", "forest", "rainforest", "abc", "defghi", "abcd", "efghi"]);
const resolver = (observedAt = "2000-01-01") => createHistoricalCompoundResolver({
  dictionaryKnowledge: name => words.has(name) ? { observedAt, dictionaryMatch: true } : {},
  vectorKnowledge: name => words.has(name) ? { observedAt, semanticVector: [1, ...Array(49).fill(0)] } : {},
});
test("exact vectors take precedence and explicit compounds require two known parts", () => {
  const resolve = resolver();
  assert.deepEqual(resolve("rainforest", Date.parse("2025-01-01")), { status: "exact-vector", parts: ["rainforest"] });
  assert.deepEqual(resolve("rain_forest", Date.parse("2025-01-01")), { status: "compound-candidate", parts: ["rain", "forest"] });
  assert.equal(resolve("rain_unknown", Date.parse("2025-01-01")).status, "unavailable");
  assert.equal(resolve("rain_forest_abc", Date.parse("2025-01-01")).status, "unavailable");
});
test("ambiguous splits, numeric guesses and future linguistic evidence are rejected", () => {
  assert.equal(resolver()("abcdefghi", Date.parse("2025-01-01")).status, "ambiguous");
  assert.equal(resolver()("rain123", Date.parse("2025-01-01")).status, "unavailable");
  assert.equal(resolver("2026-01-01")("rain_forest", Date.parse("2025-01-01")).status, "unavailable");
});

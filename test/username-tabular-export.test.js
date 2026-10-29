"use strict";
const test = require("node:test"), assert = require("node:assert/strict");
const { exportFeatures } = require("../scripts/export-username-tabular-semantics");
const { FEATURE_NAMES } = require("../lib/username-learned-model");
test("tabular export excludes future knowledge and outcome fields", () => {
  const row = { username: "example", eventId: "a", nftAddress: "contract", eventTime: "2024-01-01T00:00:00Z" };
  const future = { knowledge: () => ({ observedAt: "2025-01-01T00:00:00Z", dictionaryMatch: true, semanticVector: Array(50).fill(1) }) };
  const absent = { knowledge: () => ({}) };
  assert.deepEqual(exportFeatures([{ ...row, actualUsd: 99999 }], future, future), exportFeatures([row], absent, absent));
  assert.equal(exportFeatures([row], absent, absent)[0].features.length, FEATURE_NAMES.length + 51);
  assert.throws(() => exportFeatures([{ ...row, eventTime: "invalid" }], absent, absent));
});

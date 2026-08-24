"use strict";
const assert = require("node:assert/strict");
const test = require("node:test");
const { hasSeriesCoverage, historicalRateAt, normalizePoints } = require("../lib/dns-historical-rates");
test("normalizes and interpolates observed historical rates", () => {
  const points = normalizePoints([[2000, 4], [1000, 2], [1000, 3]]);
  assert.deepEqual(points, [{ timestamp: 1000, rate: 3 }, { timestamp: 2000, rate: 4 }]);
  assert.equal(historicalRateAt(points, new Date(1500)).rate, 3.5);
});
test("never invents a rate outside the bounded observation gap", () => {
  assert.equal(historicalRateAt([{ timestamp: 0, rate: 2 }], new Date(10_000), { maxGapMs: 100 }), null);
});
test("rate cache coverage rejects a missing interval", () => {
  const hour = 60 * 60 * 1000;
  assert.equal(hasSeriesCoverage([
    { timestamp: 0, rate: 2 },
    { timestamp: hour, rate: 2.1 },
    { timestamp: 2 * hour, rate: 2.2 },
  ], 0, 2 * hour), true);
  assert.equal(hasSeriesCoverage([
    { timestamp: 0, rate: 2 },
    { timestamp: 30 * hour, rate: 2.2 },
  ], 0, 30 * hour), false);
});

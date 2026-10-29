"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { clusteredBootstrapImprovement, evaluateStreams, evidenceBefore, weeklyBlock } = require("../scripts/evaluate-username-secondary-qualification");
const { terminalReason } = require("../scripts/seal-username-secondary-qualification");

const sale = (eventId, username, eventTime, priceUsd = 100) => ({ eventId, username, nftAddress: `nft-${username}`,
  eventTime, priceUsd, eventType: "sale", finalized: true, paymentAsset: "GRAM", reliabilityScore: 1 });

test("secondary qualification evidence is strictly prior and retains old own history", () => {
  const target = sale("target", "alpha", "2026-09-22T00:00:00Z");
  const rows = [sale("old-own", "alpha", "2024-01-01T00:00:00Z"), sale("recent", "beta", "2026-09-21T00:00:00Z"),
    sale("same-time", "gamma", target.eventTime), sale("future", "delta", "2026-09-23T00:00:00Z")];
  assert.deepEqual(evidenceBefore(rows, target, 1).map((row) => row.eventId), ["recent", "old-own"]);
});

test("secondary stream excludes simultaneous outcomes then admits them later", () => {
  const rows = [sale("a", "alpha", "2026-09-22T00:00:00Z"),
    sale("b", "beta", "2026-09-22T00:00:00Z"),
    sale("c", "gamma", "2026-09-23T00:00:00Z")];
  const result = evaluateStreams([sale("old", "delta", "2025-01-01T00:00:00Z")], rows, { maxHistory: 25 });
  assert.deepEqual(result.map((row) => row.priorSecondaryEvidence), [0, 0, 2]);
});

test("weekly blocks are start inclusive and end exclusive", () => {
  const blocks = ["2026-09-20T14:00:00Z", "2026-09-27T00:00:00Z", "2026-10-04T00:00:00Z"];
  assert.equal(weeklyBlock("2026-09-20T14:00:00Z", blocks), `${blocks[0]}/${blocks[1]}`);
  assert.equal(weeklyBlock("2026-09-27T00:00:00Z", blocks), `${blocks[1]}/${blocks[2]}`);
  assert.equal(weeklyBlock("2026-10-04T00:00:00Z", blocks), null);
});

test("premium bootstrap is deterministic and clustered by identity", () => {
  const prediction = (error) => ({ available: true, factorError: error, insideRange: true,
    prediction: { estimateUsd: 100, rangeLowUsd: 50, rangeHighUsd: 200 } });
  const rows = [
    { sale: sale("a1", "alpha", "2026-09-21T00:00:00Z", 100), baseline: prediction(4), candidate: prediction(2) },
    { sale: sale("a2", "alpha", "2026-09-22T00:00:00Z", 100), baseline: prediction(4), candidate: prediction(2) },
    { sale: sale("b1", "beta", "2026-09-22T00:00:00Z", 100), baseline: prediction(2), candidate: prediction(1.5) },
  ];
  const left = clusteredBootstrapImprovement(rows, { iterations: 200, seed: 7 });
  const right = clusteredBootstrapImprovement(rows, { iterations: 200, seed: 7 });
  assert.deepEqual(left, right);
  assert.equal(left.identities, 2);
  assert.equal(left.iterations, 200);
  assert.ok(left.lower95 > 0);
});

test("final sealing requires the frozen cap or ended caught-up window", () => {
  const reservation = { window: { maximumUniqueEvents: 4000, untilExclusive: "2026-10-20T00:00:00Z" } };
  assert.equal(terminalReason({ uniqueEvents: 3999, cursor: { caughtUp: true } }, reservation, Date.parse("2026-10-19T00:00:00Z")), null);
  assert.equal(terminalReason({ uniqueEvents: 4000, cursor: { caughtUp: false } }, reservation, Date.parse("2026-10-01T00:00:00Z")), "maximumUniqueEvents");
  assert.equal(terminalReason({ uniqueEvents: 3999, cursor: { caughtUp: true } }, reservation, Date.parse("2026-10-20T00:00:00Z")), "untilExclusive");
  assert.throws(() => terminalReason({ uniqueEvents: 4001, cursor: { caughtUp: true } }, reservation), /exceeded/);
});

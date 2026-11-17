"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { bidOverlay, horizonRows, weeklySummaries } = require("../scripts/evaluate-username-forward-v2-qualification");

const nftAddress = `0:${"a".repeat(64)}`;
const sale = { username: "rare", nftAddress, eventId: "event-1", eventTime: "2026-09-28T12:00:00Z",
  priceUsd: 400, historicalUsdRate: 2, priceGram: 200 };
const lifecycle = { status: "verified-bid-lifecycle", bids: [
  { eventTime: "2026-09-27T10:00:00Z", amountNano: "100000000000" },
  { eventTime: "2026-09-28T11:00:00Z", amountNano: "200000000000" },
] };

test("forward-v2 evaluator uses only the bid available at each declared horizon", () => {
  assert.equal(bidOverlay(sale, lifecycle, 24).estimateUsd, 200);
  assert.equal(bidOverlay(sale, lifecycle, 6).estimateUsd, 200);
  assert.equal(bidOverlay(sale, lifecycle, 1).estimateUsd, 400);
  assert.equal(bidOverlay(sale, { status: "fetch-error", bids: lifecycle.bids }, 1), null);
});

test("forward-v2 evaluator retains unavailable cases and weekly denominators", () => {
  const second = { ...sale, eventId: "event-2", nftAddress: `0:${"b".repeat(64)}`, username: "other", priceUsd: 20 };
  const baseline = new Map([[sale.eventId, { prediction: { status: "indicative", estimateUsd: 100,
    rangeLowUsd: 80, rangeHighUsd: 120 } }]]);
  const lifecycles = new Map([[sale.eventId, lifecycle], [second.eventId, { status: "fetch-error", bids: [] }]]);
  const rows = horizonRows([sale, second], baseline, lifecycles, 24);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].activeAuctionOverlay, true);
  assert.equal(rows[1].candidate.available, false);
  const manifest = { window: { weeklyBlocks: ["2026-09-27T00:00:00Z", "2026-10-04T00:00:00Z"] },
    gates: { premiumThresholdUsd: 500 } };
  const weekly = weeklySummaries(rows, manifest);
  const block = Object.values(weekly)[0];
  assert.equal(block.attempts, 2);
  assert.equal(block.cohorts.overall.candidateAbstentions, 1);
});

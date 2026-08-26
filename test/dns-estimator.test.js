"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  estimateTonDnsValue,
  isCompletedSale,
  scoreComparable,
  weightedMedian,
} = require("../lib/dns-estimator");

const NOW = "2026-08-13T00:00:00.000Z";

function completedSale(domain, priceGram, daysAgo = 30, extra = {}) {
  return {
    domain,
    eventType: "sale",
    status: "completed",
    priceGram,
    paymentAsset: "GRAM",
    eventTime: new Date(Date.parse(NOW) - (daysAgo * 86_400_000)).toISOString(),
    ...extra,
  };
}

test("weighted median is robust to a lightly weighted outlier", () => {
  assert.equal(weightedMedian([
    { value: Math.log(100), weight: 1 },
    { value: Math.log(110), weight: 1 },
    { value: Math.log(1_000_000), weight: 0.01 },
  ]), Math.log(110));
});

test("requires explicit completion and native settlement", () => {
  assert.equal(isCompletedSale(completedSale("1662.ton", 100)), true);
  assert.equal(isCompletedSale({
    domain: "1662.ton",
    eventType: "sale",
    status: "pending",
    priceGram: 100,
  }), false);
  assert.equal(isCompletedSale({
    domain: "1662.ton",
    eventType: "sale",
    completed: true,
    priceGram: 100,
    paymentAsset: "USDT",
  }), false);
  assert.equal(isCompletedSale({
    ...completedSale("1662.ton", 100),
    qualityFlags: ["wash-trade"],
  }), false);
});

test("scores numeric comparables by numeric structure before unrelated meaning", () => {
  const sameClass = scoreComparable("1662.ton", completedSale("1773.ton", 100), { now: NOW });
  const differentLength = scoreComparable("1662.ton", completedSale("17733.ton", 100), { now: NOW });
  const dictionary = scoreComparable("1662.ton", completedSale("supernova.ton", 100), { now: NOW });

  assert.ok(sameClass.weight > differentLength.weight);
  assert.equal(dictionary.weight, 0);
});

test("does not turn textual spelling or route overlap into a market comparable", () => {
  const unrelated = scoreComparable(
    "theblockhain.ton",
    completedSale("womenshealth.ton", 700),
    { now: NOW },
  );
  const lexicalPeer = scoreComparable(
    "blockchain.ton",
    completedSale("blockchains.ton", 700),
    { now: NOW },
  );

  assert.equal(unrelated.weight, 0);
  assert.ok(unrelated.lexicalSimilarity < 0.34);
  assert.ok(lexicalPeer.lexicalSimilarity >= 0.34);
  assert.equal(lexicalPeer.weight, 0);

  const verifiedSemanticPeer = scoreComparable(
    "blockchain.ton",
    completedSale("blockchains.ton", 700, 30, { semanticSimilarity: 0.9 }),
    { now: NOW },
  );
  assert.ok(verifiedSemanticPeer.weight > 0);
});

test("uses completed sales only for midpoint and keeps asks and bids bounded", () => {
  const sales = [
    completedSale("1661.ton", 100, 20),
    completedSale("1772.ton", 110, 25),
    completedSale("1883.ton", 120, 30),
    {
      domain: "1662.ton",
      eventType: "sale",
      status: "pending",
      priceGram: 50_000,
    },
  ];
  const baseline = estimateTonDnsValue("1662.ton", sales, {}, { now: NOW });
  const withSignals = estimateTonDnsValue("1662.ton", sales, {
    bids: [{ priceGram: 95, verified: true, active: true }],
    asks: [{ priceGram: 1_000_000_000, verified: true, active: true }],
  }, { now: NOW });

  assert.equal(withSignals.midpointGram, baseline.midpointGram);
  assert.equal(withSignals.evidenceCount, 3);
  assert.equal(withSignals.completedSaleCount, 3);
  assert.ok(withSignals.range.lowGram >= baseline.range.lowGram);
  assert.ok(withSignals.range.highGram <= baseline.range.highGram * 1.1);
  assert.ok(withSignals.midpointGram >= 100 && withSignals.midpointGram <= 120);
});

test("does not create a midpoint from asks, bids, or AI price fields", () => {
  const result = estimateTonDnsValue("supernova.ton", [
    { domain: "galaxy.ton", eventType: "listing", priceGram: 500, active: true },
    { domain: "nebula.ton", eventType: "bid", priceGram: 200, active: true },
    { domain: "cosmos.ton", eventType: "sale", status: "pending", priceGram: 300 },
  ], {
    ask: 600,
    bid: 180,
    aiPriceGram: 999_999,
  }, {
    now: NOW,
    classificationOptions: { dictionaryWords: ["super", "nova", "galaxy", "nebula", "cosmos"] },
  });

  assert.equal(result.status, "unavailable");
  assert.equal(result.midpointGram, null);
  assert.equal(result.evidenceCount, 0);
  assert.deepEqual(result.range, { lowGram: null, highGram: null });
});

test("uses a verified completed-sales baseline only as a low-confidence indicative value", () => {
  const result = estimateTonDnsValue("1662.ton", [], {}, {
    now: NOW,
    marketBaseline: {
      verifiedSalesOnly: true,
      scope: "global",
      midpointGram: 120,
      rangeLowGram: 100,
      rangeHighGram: 140,
      evidenceCount: 3,
      effectiveCompCount: 3,
      provenance: "global-verified-sales-baseline",
    },
  });

  assert.equal(result.status, "indicative");
  assert.equal(result.confidenceBand, "low");
  assert.equal(result.evidenceCount, 3);
  assert.equal(result.provenance, "global-verified-sales-baseline");
  assert.ok(result.estimateGram >= 100 && result.estimateGram <= 140);
});

test("rejects a wildly dispersed baseline instead of pricing an unrelated DNS from its median", () => {
  const result = estimateTonDnsValue("conviction.ton", [], {}, {
    now: NOW,
    marketBaseline: {
      verifiedSalesOnly: true,
      scope: "archetype",
      midpointGram: 15_000,
      rangeLowGram: 25,
      rangeHighGram: 190_000_000,
      evidenceCount: 33,
      effectiveCompCount: 33,
    },
  });

  assert.equal(result.status, "unavailable");
  assert.equal(result.estimateGram, null);
});

test("keeps a DNS with one finalized own sale out of portfolio confidence", () => {
  const result = estimateTonDnsValue("singleproof.ton", [
    completedSale("singleproof.ton", 120, 15),
  ], {}, { now: NOW });

  assert.equal(result.status, "estimated");
  assert.equal(result.ownSaleCount, 1);
  assert.equal(result.confidenceBand, "low");
  assert.ok(result.confidenceScore <= 0.44);
});

test("returns a range, confidence, and effective comparable count", () => {
  const result = estimateTonDnsValue("supernova.ton", [
    completedSale("galaxy.ton", 300, 20, { semanticSimilarity: 0.92 }),
    completedSale("nebula.ton", 340, 30, { semanticSimilarity: 0.9 }),
    completedSale("cosmos.ton", 360, 40, { semanticSimilarity: 0.88 }),
    completedSale("space.ton", 320, 45, { semanticSimilarity: 0.82 }),
    completedSale("superstar.ton", 380, 55, { semanticSimilarity: 0.78 }),
  ], {}, {
    now: NOW,
    classificationOptions: {
      dictionaryWords: ["super", "nova", "galaxy", "nebula", "cosmos", "space", "star"],
    },
  });

  assert.equal(result.status, "estimated");
  assert.equal(result.evidenceCount, 5);
  assert.ok(result.effectiveCompCount > 3);
  assert.ok(result.range.lowGram < result.midpointGram);
  assert.ok(result.range.highGram > result.midpointGram);
  assert.ok(["low", "medium", "high"].includes(result.confidence.band));
  assert.equal(result.comparables.length, 5);
});

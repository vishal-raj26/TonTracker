"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { estimateTelegramUsernameValue } = require("../lib/username-estimator");
const { assessUsernameMarketEvent } = require("../lib/username-market-risk");
const { createUsernameFirstImportEvidence } = require("../lib/username-first-import-evidence");
const { USERNAME_COLLECTION } = require("../lib/username-collection");
const { trainUsernameLearnedModel, predictUsernameLearnedModel, fitThresholdClassifier, FEATURE_NAMES } = require("../lib/username-learned-model");

test("standardized classifier experiment is scale invariant and learns a separating rare feature", () => {
  const rows = Array.from({ length: 1030 }, (_, i) => ({ x: [1, Number(i >= 1000), 7],
    y: Math.log(i >= 1000 ? 1000 : 30), weight: 1 }));
  const original = JSON.stringify(rows);
  const fit = fitThresholdClassifier(rows, 500, 360, true);
  const rescaled = fitThresholdClassifier(rows.map(row => ({ ...row, x: [1, row.x[1] * 0.001, 7] })), 500, 360, true);
  const probability = (model, x) => {
    const logOdds = x.reduce((sum, value, i) => sum + value * model.coefficients[i], 0)
      + Math.log(model.positiveRate / (1 - model.positiveRate));
    return 1 / (1 + Math.exp(-logOdds));
  };
  assert.ok(probability(fit, [1, 1, 7]) > 0.7);
  assert.ok(probability(fit, [1, 0, 7]) < 0.1);
  assert.ok(Math.abs(probability(fit, [1, 1, 7]) - probability(rescaled, [1, 0.001, 7])) < 1e-10);
  assert.equal(JSON.stringify(rows), original);
  assert.ok(fit.coefficients.every(Number.isFinite));
});

const nowMs = Date.parse("2026-09-05T00:00:00Z");
const sale = { username: "tgintern", eventType: "sale", eventTime: "2026-01-14T01:39:56Z", priceUsd: 100, paymentAsset: "TON" };

test("post-fit diagnostics expose cohort adjustment without allowing the retired bypass", () => {
  const model = { version: "username-learned-ridge-v15", coefficients: FEATURE_NAMES.map((_, i) => i ? 0 : Math.log(1000)),
    cohortStats: { "word|Latin|6-8": { count: 100, medianUsd: 10, premiumRate: 0.1 } } };
  const regular = predictUsernameLearnedModel(model, "example");
  const isolated = predictUsernameLearnedModel({ ...model, postFitShrinkage: false }, "example");
  assert.deepEqual(isolated, regular);
  assert.ok(regular.estimateUsd < regular.mixtureEstimateUsd);
  assert.ok(regular.postFitAdjustmentRatio < 1);
});

test("zero residual endpoints are not replaced by arbitrary fallback ranges", () => {
  const model = { version: "username-learned-ridge-v15", coefficients: FEATURE_NAMES.map(() => 0), residualLow: 0, residualHigh: 0 };
  const base = predictUsernameLearnedModel(model, "example");
  assert.equal(base.rangeLowUsd, base.estimateUsd);
  assert.equal(base.rangeHighUsd, base.estimateUsd);
});
test("duplicate providers and zero reliability cannot manufacture own-sale confidence", () => {
  const result = estimateTelegramUsernameValue("tgintern", [sale, { ...sale, eventId: "duplicate-provider" },
    { ...sale, eventTime: "2026-02-01", priceUsd: 9999, reliabilityScore: 0 }], { nowMs });
  assert.equal(result.ownSaleCount, 1);
  assert.equal(result.estimateUsd, 100);
  assert.equal(result.confidenceBand, "low");
});

test("comparable deduplication retains strongest provenance independently of arrival order", () => {
  const weak = { ...sale, reliabilityScore: 0.6, source: "market-reported" };
  const strong = { ...sale, reliabilityScore: 1, source: "chain-confirmed" };
  const forward = estimateTelegramUsernameValue("tgintern", [weak, strong], { nowMs });
  const reverse = estimateTelegramUsernameValue("tgintern", [strong, weak], { nowMs });
  assert.deepEqual(forward, reverse);
  assert.equal(forward.ownSaleCount, 1);
  assert.equal(forward.comparables[0].reliability, 1);
});
test("unknown counterparties are not assumed to be the same pair of wallets", () => {
  assert.equal(assessUsernameMarketEvent({ priceGram: 10 }, [{ priceGram: 10 }, { priceGram: 10 }]).excluded, false);
  assert.equal(assessUsernameMarketEvent({ sellerAddress: "a", buyerAddress: "a" }).excluded, true);
});
test("invalid dates, future sales, infinity, cancelled events and transfers do not become values", () => {
  for (const changes of [{ eventTime: "invalid" }, { eventTime: "2027-01-01" }, { priceUsd: Infinity }, { reliabilityScore: Infinity }, { reliabilityScore: NaN }, { isCancelled: true }, { eventType: "transfer" }]) {
    assert.equal(estimateTelegramUsernameValue("tgintern", [{ ...sale, ...changes }], { nowMs }).status, "unavailable");
  }
});
test("public Fragment history survives a chain provider outage with honest provenance", async () => {
  const evidence = createUsernameFirstImportEvidence({
    source: { fetchUsernameRecord: async () => ({ events: [{ ...sale, eventId: "public", priceGram: 27,
      collectionAddress: USERNAME_COLLECTION, marketplace: "Fragment", isFinalized: true }] }) },
    verifier: { verifyFragmentSale: async () => { throw new Error("provider unavailable"); } },
    attributeHistoricalUsd: async (events) => events.map((event) => ({ ...event, priceUsd: 54, historicalUsdRate: 2 })), logger: {},
  });
  const result = await evidence.enrich([{ username: "tgintern", address: `0:${"a".repeat(64)}` }]);
  assert.equal(result.sales.length, 1);
  assert.equal(result.sales[0].qualityFlags.verificationTier, "market-reported");
  assert.equal(result.sales[0].reliabilityScore, 0.6);
  assert.equal(result.inspected[0].verifiedSales, 0);
});
test("learned uncertainty is measured on a later held-out block", () => {
  const rows = Array.from({ length: 150 }, (_, i) => ({ ...sale, username: `sample${i}`, priceUsd: 10 + i,
    eventTime: new Date(nowMs - (151 - i) * 86400000).toISOString() }));
  const model = trainUsernameLearnedModel(rows, { nowMs });
  assert.equal(model.calibration.method, "chronological-holdout-log-residuals");
  assert.equal(model.calibration.samples, 30);
  assert.ok(model.residualLow <= 0 && model.residualHigh >= 0);
});

test("duplicate provider events cannot inflate model training or calibration support", () => {
  const rows = Array.from({ length: 150 }, (_, i) => ({ ...sale, username: `sample${i}`, priceUsd: 10 + i,
    eventTime: new Date(nowMs - (151 - i) * 86400000).toISOString() }));
  const original = trainUsernameLearnedModel(rows, { nowMs });
  const duplicated = trainUsernameLearnedModel([...rows, ...rows.map(row => ({ ...row, eventId: "another-provider" }))], { nowMs });
  assert.deepEqual(duplicated, original);
});

test("future and undated semantic knowledge cannot enter historical model fitting", () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({ ...sale, username: `sample${i}`, priceUsd: 10 + i }));
  const original = trainUsernameLearnedModel(rows, { nowMs });
  for (const observedAt of [undefined, "2027-01-01T00:00:00Z"]) {
    const enriched = trainUsernameLearnedModel(rows.map(row => ({ ...row,
      knowledge: { schemaVersion: "username-knowledge-v5", observedAt, dictionaryMatch: true,
        entityMatch: true, entityMatchStrength: 1, lexicalFrequency: 100, relatedTerms: ["bank"] } })), { nowMs });
    assert.deepEqual(enriched, original);
  }
  const historical = trainUsernameLearnedModel(rows.map(row => ({ ...row,
    knowledge: { schemaVersion: "username-knowledge-v5", observedAt: "2025-01-01T00:00:00Z",
      dictionaryMatch: true, lexicalFrequency: 100 } })), { nowMs });
  assert.notDeepEqual(historical.coefficients, original.coefficients);
});

test("holdout predictions use the semantic features available at each validation sale", () => {
  const cutoff = Date.parse("2026-01-01");
  const rows = Array.from({ length: 200 }, (_, i) => ({ eventType: "sale",
    username: `fixtureword${String.fromCharCode(97 + i % 26)}${String.fromCharCode(97 + Math.floor(i / 26))}`,
    priceUsd: i % 2 ? 10 : 40, eventTime: new Date(cutoff - (201 - i) * 86400000).toISOString(),
    knowledge: { schemaVersion: "username-knowledge-v5", observedAt: "2020-01-01", dictionaryMatch: i % 2 === 0 } }));
  const model = trainUsernameLearnedModel(rows, { nowMs: cutoff });
  // Without target knowledge, half this controlled holdout is evaluated using
  // the wrong feature vector. This fixture is not a market-accuracy claim.
  assert.equal(model.calibration.samples, 40);
  assert.equal(model.calibration.withinFactorTwo, 1);
});

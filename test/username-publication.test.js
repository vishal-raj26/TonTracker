"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { usernamePortfolioEligible } = require("../lib/username-publication");
const { createUsernameRuntime } = require("../lib/username-runtime");
const { USERNAME_ESTIMATOR_VERSION } = require("../lib/username-engine");
const { exactValuation } = require("../scripts/refresh-identity-baselines");
test("username baseline writer keeps sparse own-sale estimates indicative", () => {
  const nowMs = Date.parse("2025-02-01");
  const value = exactValuation("username", "0:weak", { name: "weakname", events: [{
    username: "weakname", eventTime: "2025-01-01", eventType: "sale", priceUsd: 100,
    finalized: true, paymentAsset: "TON",
  }] }, { nowMs });
  assert.ok(value.estimateUsd > 0);
  assert.equal(value.confidenceBand, "low");
  assert.equal(value.portfolioEligible, false);
});
test("publication separates uncertain estimates from priced holdings", () => {
  const value = { estimateUsd: 100, status: "estimated", confidenceBand: "high" };
  assert.equal(usernamePortfolioEligible(value), true);
  for (const change of [{ confidenceBand: "low" }, { confidenceBand: "" }, { estimateUsd: Infinity },
    { estimateUsd: 0 }, { portfolioEligible: false }, { valuationStatus: "indicative" }]) {
    assert.equal(usernamePortfolioEligible({ ...value, ...change }), false);
  }
});
test("legacy low-confidence eligibility cannot restore a portfolio price", async () => {
  const runtime = createUsernameRuntime({ valuationReadModelUrl: "https://registry.example",
    fetch: async url => new Response(JSON.stringify({ records: url.endsWith("/valuations/read") ? [{
      assetKey: "0:weak", estimateUsd: 100, rangeLowUsd: 20, rangeHighUsd: 300,
      confidenceBand: "low", portfolioEligible: true, valuationStatus: "estimated",
      estimatorVersion: USERNAME_ESTIMATOR_VERSION, staleAt: new Date(Date.now() + 60000).toISOString(),
    }] : [] })) });
  const [asset] = await runtime.valueAssets([{ tokenAddress: "0:weak", username: "weakname" }]);
  assert.equal(asset.estimatedUsd, 100);
  assert.equal(asset.rangeHighUsd, 300);
  assert.equal(asset.floorUsd, 0);
  assert.equal(asset.portfolioEligible, false);
  assert.equal(asset.usernameValuationStatus, "indicative");
});

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {analyze} = require("../scripts/analyze-username-development-bids-expanded");

function source(eventId, username, actualUsd, priceNative) {
  return {eventId, username, nftAddress: `address-${eventId}`, eventTime: "2025-01-10T00:00:00Z", actualUsd, baseUsd: actualUsd / 2, priceNative};
}

test("expanded bid analysis separates strata and uses only strictly prior bids", () => {
  const sources = [source("premium", "rare", 600, 100), source("ordinary", "plain", 50, 10)];
  const audits = [
    {...sources[0], stratum: "premium-all", status: "prior-bids-observed", matchingPublicSale: true, bids: [{eventType: "bid", eventTime: "2025-01-09T00:00:00Z", priceNative: 100}]},
    {...sources[1], stratum: "ordinary-control", status: "no-prior-bids-observed", matchingPublicSale: true, bids: []}
  ];
  const result = analyze({eventIds: ["premium", "ordinary"]}, audits, sources);
  assert.equal(result.overall.priorBidCoverageRate, 0.5);
  assert.equal(result.strata["premium-all"].exactNativeMatchRateAmongCovered, 1);
  assert.equal(result.strata["premium-all"].maximumBaselineMaleImprovementIfCoveredWerePerfect, 1);
  assert.equal(result.strata["ordinary-control"].priorBidCovered, 0);
});

test("expanded bid analysis rejects future bids and incomplete audits", () => {
  const target = source("premium", "rare", 600, 100);
  assert.throws(() => analyze({eventIds: ["premium"]}, [], [target]), /Incomplete audit/);
  assert.throws(() => analyze({eventIds: ["premium"]}, [{...target, stratum: "premium-all", status: "prior-bids-observed", bids: [{eventType: "bid", eventTime: "2025-01-11T00:00:00Z", priceNative: 100}]}], [target]), /Invalid prior bid/);
});

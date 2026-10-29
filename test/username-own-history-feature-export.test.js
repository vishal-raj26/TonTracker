"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildFeatures } = require("../scripts/export-username-own-history-features");

const prior = { eventId: "prior", username: "same", nftAddress: "nft-a", eventTime: "2024-01-01T00:00:00Z",
  priceUsd: 200, eventType: "sale", finalized: true, paymentAsset: "ton" };

test("own-history feature export excludes same-time/future events and other NFT contracts", () => {
  const target = { eventId: "target", username: "same", nftAddress: "nft-a", eventTime: "2024-02-01T00:00:00Z" };
  const events = [prior,
    { ...prior, eventId: "simultaneous", eventTime: target.eventTime, priceUsd: 5000 },
    { ...prior, eventId: "future", eventTime: "2024-03-01T00:00:00Z", priceUsd: 9000 },
    { ...prior, eventId: "other-contract", nftAddress: "nft-b", priceUsd: 8000 },
  ];
  const result = buildFeatures([target], events);
  assert.deepEqual(result.rows[0], { ...target, hasPriorOwnSale: true, priorOwnPriceUsd: 200,
    priorOwnAgeDays: 31, priorOwnSaleCount: 1 });
});

test("own-history feature export marks mixed historical usernames ambiguous", () => {
  const target = { eventId: "target", username: "same", nftAddress: "nft-a", eventTime: "2024-02-01T00:00:00Z" };
  const result = buildFeatures([target], [prior, { ...prior, eventId: "alias", username: "alias",
    eventTime: "2024-01-02T00:00:00Z", priceUsd: 250 }]);
  assert.equal(result.rows[0].hasPriorOwnSale, false);
  assert.equal(result.rows[0].priorOwnPriceUsd, null);
  assert.equal(result.availability.ambiguous, 1);
});

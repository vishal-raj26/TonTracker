"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { classifyTelegramUsername, normalizeTelegramUsername, ROUTES } = require("../lib/username-structural");
const { estimateTelegramUsernameValue, lexicalSimilarity } = require("../lib/username-estimator");
const { trainUsernameLearnedModel } = require("../lib/username-learned-model");

test("normalizes Telegram username identity without treating a display prefix as part of the name", () => {
  assert.equal(normalizeTelegramUsername(" https://t.me/Kick/ "), "kick");
  assert.equal(classifyTelegramUsername("@1111").primaryRoute, ROUTES.NUMERIC);
  assert.equal(classifyTelegramUsername("@ai").primaryRoute, ROUTES.SHORT);
});

test("uses only finalized native sales with historical USD labels", () => {
  const target = classifyTelegramUsername("kick");
  const estimated = estimateTelegramUsernameValue(target, [
    { eventId: "exact", username: "kick", eventType: "sale", eventTime: new Date().toISOString(), paymentAsset: "GRAM", priceUsd: 1462, finalized: true },
    { eventId: "near", username: "game", eventType: "sale", eventTime: new Date().toISOString(), paymentAsset: "GRAM", priceUsd: 900, finalized: true },
    { eventId: "ask", username: "kick", eventType: "listing", eventTime: new Date().toISOString(), paymentAsset: "GRAM", priceUsd: 999999, finalized: false },
    { eventId: "wrong", username: "kick", eventType: "sale", eventTime: new Date().toISOString(), paymentAsset: "USDT", priceUsd: 4000, finalized: true },
  ]);
  assert.equal(estimated.status, "estimated");
  assert.equal(estimated.ownSaleCount, 1);
  assert.ok(estimated.estimateUsd > 900 && estimated.estimateUsd < 2000);
  assert.equal(estimated.evidenceCount, 2);
  assert.equal(estimated.confidenceBand, "low");
});

test("keeps feature-only and one-sale username estimates out of portfolio confidence", () => {
  const nowMs = Date.parse("2026-08-24T00:00:00Z");
  const learned = trainUsernameLearnedModel(Array.from({ length: 30 }, (_, index) => (
    sale(`ordinaryname${index}`, 100 + index, index + 1, nowMs)
  )), { nowMs });
  const featureOnly = estimateTelegramUsernameValue("newmarketname", [], { nowMs, learnedModel: learned });
  const oneSale = estimateTelegramUsernameValue("singleusername", [
    sale("singleusername", 250, 4, nowMs),
  ], { nowMs });

  assert.equal(featureOnly.status, "indicative");
  assert.equal(featureOnly.confidenceBand, "low");
  assert.equal(oneSale.status, "estimated");
  assert.equal(oneSale.ownSaleCount, 1);
  assert.equal(oneSale.confidenceBand, "low");
});

test("refuses to fabricate an estimate when no finalized historical USD sale exists", () => {
  const result = estimateTelegramUsernameValue("untestedname", [{ username: "untestedname", eventType: "listing", priceUsd: 200, finalized: false }]);
  assert.equal(result.status, "unavailable");
  assert.equal(result.estimateUsd, 0);
});

function sale(username, priceUsd, daysAgo, nowMs, eventId = `${username}-${daysAgo}`) {
  return { eventId, username, eventType: "sale", eventTime: new Date(nowMs - daysAgo * 86_400_000).toISOString(), paymentAsset: "GRAM", priceUsd, finalized: true };
}

test("learns distinct structural price levels from completed sales", () => {
  const nowMs = Date.parse("2026-08-24T00:00:00Z");
  const events = [];
  for (let index = 0; index < 20; index += 1) {
    events.push(sale(String(110 + index), 7_000 + index * 120, 20 + index, nowMs));
    events.push(sale(`ordinaryname${index}`, 80 + index * 3, 20 + index, nowMs));
  }
  const model = trainUsernameLearnedModel(events, { nowMs });
  const numeric = estimateTelegramUsernameValue("777", events, { nowMs, learnedModel: model });
  const ordinary = estimateTelegramUsernameValue("anothername", events, { nowMs, learnedModel: model });
  assert.ok(numeric.estimateUsd > ordinary.estimateUsd * 3);
  assert.equal(numeric.learnedModel.modelVersion, "username-learned-ridge-v2");
});

test("learns recurring market-name premiums from completed sales", () => {
  const nowMs = Date.parse("2026-08-24T00:00:00Z");
  const events = [];
  for (let index = 0; index < 30; index += 1) {
    const suffix = `${String.fromCharCode(97 + (index % 26))}${String.fromCharCode(97 + Math.floor(index / 26))}`;
    events.push(sale(`gramtrade${suffix}`, 900 + index * 8, index + 1, nowMs));
    events.push(sale(`plainword${suffix}`, 90 + index, index + 1, nowMs));
  }
  const model = trainUsernameLearnedModel(events, { nowMs });
  const ecosystem = estimateTelegramUsernameValue("gramfuture", [], { nowMs, learnedModel: model });
  const ordinary = estimateTelegramUsernameValue("plainfuture", [], { nowMs, learnedModel: model });

  assert.ok(ecosystem.estimateUsd > ordinary.estimateUsd * 1.5);
  assert.ok(ecosystem.learnedModel.marketPatternEvidence > 0);
});

test("uses recent segment sales to move older comparable evidence with the market", () => {
  const nowMs = Date.parse("2026-08-24T00:00:00Z");
  const rising = [];
  for (let index = 0; index < 8; index += 1) {
    const suffix = String.fromCharCode(97 + index);
    rising.push(sale(`olderword${suffix}`, 100 + index, 260 + index, nowMs));
    rising.push(sale(`recentword${suffix}`, 210 + index * 2, 15 + index, nowMs));
  }
  const result = estimateTelegramUsernameValue("futureword", rising, { nowMs });
  assert.equal(result.trend.direction, "up");
  assert.ok(result.trend.multiplier > 1.2);
  assert.ok(result.comparables.some((row) => row.adjustedPriceUsd > row.priceUsd));
});

test("does not compare numeric usernames across incompatible lengths", () => {
  const nowMs = Date.parse("2026-08-24T00:00:00Z");
  const result = estimateTelegramUsernameValue("777", [
    sale("12345678", 20, 5, nowMs),
    sale("888", 4_000, 7, nowMs),
  ], { nowMs });
  assert.equal(result.evidenceCount, 1);
  assert.equal(result.comparables[0].username, "888");
});

test("discounts an unsupported non-exact sale outlier", () => {
  const nowMs = Date.parse("2026-08-24T00:00:00Z");
  const events = [90, 95, 100, 105, 110, 100_000].map((price, index) => sale(`marketname${index}`, price, index + 1, nowMs));
  const result = estimateTelegramUsernameValue("marketname", events, { nowMs });
  assert.ok(result.estimateUsd < 500);
  assert.ok(result.comparables.some((row) => row.outlierDiscounted));
});

test("rejects unrelated word usernames that only share coarse structural features", () => {
  const nowMs = Date.parse("2026-08-24T00:00:00Z");
  const result = estimateTelegramUsernameValue("notgameston", [
    sale("maloybrother", 80, 2, nowMs),
    sale("notgamescoin", 240, 3, nowMs),
  ], { nowMs });

  assert.ok(lexicalSimilarity("notgameston", "notgamescoin") >= 0.2);
  assert.equal(result.evidenceCount, 1);
  assert.equal(result.comparables[0].username, "notgamescoin");
});

test("bounds broad evidence to the nearest comparable cohort", () => {
  const nowMs = Date.parse("2026-08-24T00:00:00Z");
  const events = Array.from({ length: 140 }, (_, index) => sale(
    `marketname${String.fromCharCode(97 + (index % 26))}${String.fromCharCode(97 + Math.floor(index / 26))}`,
    100 + index,
    index + 1,
    nowMs,
    `cohort-${index}`
  ));
  const result = estimateTelegramUsernameValue("marketname", events, { nowMs });

  assert.equal(result.evidenceCount, 80);
  assert.ok(result.effectiveCompCount <= 80);
});

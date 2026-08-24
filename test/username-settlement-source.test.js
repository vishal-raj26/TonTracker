"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { USERNAME_COLLECTION } = require("../lib/username-collection");
const { normalizePublicSettlementEvent } = require("../lib/username-settlement-source");
const base = { collectionAddress: USERNAME_COLLECTION, nftAddress: "0:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", username: "Kick", eventType: "completed-sale", eventTime: "2026-08-01T12:00:00Z", priceGram: 100, historicalUsdRate: 1.5, priceUsd: 150, txHash: "abc123", isFinalized: true };
test("normalizes a public username settlement with stable transaction identity", () => { const result = normalizePublicSettlementEvent(base, { sourceId: "Public Index" }); assert.equal(result.username, "kick"); assert.match(result.eventId, /^public-index:/); assert.equal(result.verified, false); });
test("rejects a row without real settlement identity", () => { assert.throws(() => normalizePublicSettlementEvent({ ...base, nftAddress: "fragment-index:kick" }), /real collectible NFT address/); assert.throws(() => normalizePublicSettlementEvent({ ...base, txHash: "", traceId: "" }), /transaction hash or trace ID/); assert.throws(() => normalizePublicSettlementEvent({ ...base, eventType: "listing" }), /finalized sale/); });

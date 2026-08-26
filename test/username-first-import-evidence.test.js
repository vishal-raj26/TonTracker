"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createUsernameFirstImportEvidence } = require("../lib/username-first-import-evidence");

test("keeps only exact public history rows that match the imported username NFT", async () => {
  const source = { fetchUsernameRecord: async () => ({ events: [
    { eventId: "sale-good", eventTime: "2025-01-01T00:00:00Z", priceGram: 10 },
    { eventId: "sale-bad", eventTime: "2025-01-02T00:00:00Z", priceGram: 20 },
  ] }) };
  const verifier = { verifyFragmentSale: async (event, addresses) => ({ verified: event.eventId === "sale-good" && addresses[0] === "0:" + "a".repeat(64), traceId: event.eventId }) };
  const attributeHistoricalUsd = async (events) => events.map((event) => ({ ...event, historicalUsdRate: 4, priceUsd: Number(event.priceGram) * 4, historicalUsdSource: "test", historicalUsdMethod: "exact" }));
  const knowledgeResolver = async (username, options) => ({ schemaVersion: "username-knowledge-v3", dictionaryMatch: username === "kick", knowledgeStage: options.fast ? "lexical" : "full" });
  const evidence = createUsernameFirstImportEvidence({ source, verifier, attributeHistoricalUsd, knowledgeResolver, maxKnowledgeAssets: 1, maxAssets: 3, logger: {} });
  const result = await evidence.enrich([{ address: `0:${"a".repeat(64)}`, username: "kick" }]);
  assert.equal(result.assets.length, 1);
  assert.equal(result.sales.length, 1);
  assert.equal(result.sales[0].saleId, "sale-good");
  assert.equal(result.sales[0].reliabilityScore, 1);
  assert.equal(result.inspected[0].reportedSales, 2);
  assert.equal(result.inspected[0].verifiedSales, 1);
  assert.equal(result.inspected[0].knowledgePrepared, true);
  assert.equal(result.assets[0].semantic.dictionaryMatch, true);
});

"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { USERNAME_COLLECTION } = require("../lib/username-collection");
const {
  OWNERSHIP_ASSIGNED_OPCODE, createTonCenterUsernameSettlementLedger, nextCursor, settlementPayload,
} = require("../lib/toncenter-username-settlement-ledger");

const NFT = "0:cd51e371dfdd941bee9a7189cd2aeaa537e0c32c8930ff45f240b66aa21da172";

function convictionMessage(overrides = {}) {
  return {
    hash: "message-hash", source: NFT, destination: "0:" + "1".repeat(64),
    created_lt: "57353789000002", created_at: "1747694295", opcode: OWNERSHIP_ASSIGNED_OPCODE,
    decoded_opcode: "nft_ownership_assigned", out_msg_tx_hash: "tx-hash", bounced: false,
    message_content: { decoded: { forward_payload: { value: {
      "@type": "teleitem_bid_info", bid: { amount: { value: "515000000000" } }, bid_ts: "1747089477",
    } } } }, ...overrides,
  };
}

test("decodes the exact conviction 515 GRAM Telemint settlement", () => {
  const payload = settlementPayload(convictionMessage());
  assert.equal(payload.amountNano, 515_000_000_000);
  assert.equal(payload.settledAt, 1747694295);
});

test("rejects transfers, missing bid payloads, bounced and aborted messages", () => {
  assert.equal(settlementPayload(convictionMessage({ opcode: "0x5fcc3d14" })), null);
  assert.equal(settlementPayload(convictionMessage({ message_content: { decoded: {} } })), null);
  assert.equal(settlementPayload(convictionMessage({ bounced: true })), null);
  assert.equal(settlementPayload(convictionMessage({ transaction_aborted: true })), null);
});

test("cursor resumes across repeated logical times without duplicates", () => {
  const page = [{ created_lt: "10" }, { created_lt: "11" }, { created_lt: "11" }];
  assert.deepEqual(nextCursor({ startLt: "1", offset: 0 }, page, 3), { startLt: "11", offset: 2, caughtUp: false });
  assert.deepEqual(nextCursor({ startLt: "11", offset: 2 }, [{ created_lt: "11" }], 3), { startLt: "11", offset: 3, caughtUp: true });
});

test("ingests only collection-verified settlements with historical USD", async () => {
  const writes = { assets: [], sales: [], states: [] };
  const ledger = {
    readState: async () => ({ state: { cursor: { startLt: "1", offset: 0 } } }),
    ingestAssets: async (records) => (writes.assets.push(...records), records.length),
    ingestSales: async (records) => (writes.sales.push(...records), records.length),
    writeState: async (...args) => writes.states.push(args),
  };
  const fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/messages")) assert.equal(parsed.searchParams.get("start_utime"), "1666742400");
    const payload = parsed.pathname.endsWith("/messages")
      ? { messages: [convictionMessage()] }
      : { nft_items: [{ address: NFT, collection_address: USERNAME_COLLECTION, content: { domain: "conviction.t.me" } }] };
    return { ok: true, status: 200, json: async () => payload };
  };
  const worker = createTonCenterUsernameSettlementLedger({
    ledger, fetch, requestDelayMs: 0, pageLimit: 10,
    attributeHistoricalUsd: async (events) => events.map((event) => ({
      ...event, historicalUsdRate: 3.5, priceUsd: event.priceGram * 3.5,
      historicalUsdSource: "test", historicalUsdMethod: "exact",
    })),
  });
  const result = await worker.runPage();
  assert.equal(result.sales, 1);
  assert.equal(writes.sales[0].priceGram, 515);
  assert.equal(writes.sales[0].priceUsd, 1802.5);
  assert.equal(writes.sales[0].source, "toncenter-telemint-settlement");
  assert.equal(writes.sales[0].normalizedName, "conviction");
});

test("rejects the same payload when the NFT is outside the username collection", async () => {
  const writes = [];
  const ledger = {
    readState: async () => ({ state: { cursor: { startLt: "1", offset: 0 } } }),
    ingestAssets: async () => 0, ingestSales: async (records) => (writes.push(...records), records.length), writeState: async () => {},
  };
  const fetch = async (url) => ({ ok: true, status: 200, json: async () => (
    new URL(url).pathname.endsWith("/messages")
      ? { messages: [convictionMessage()] }
      : { nft_items: [{ address: NFT, collection_address: "0:" + "f".repeat(64), content: { domain: "conviction.t.me" } }] }
  ) });
  const worker = createTonCenterUsernameSettlementLedger({ ledger, fetch, requestDelayMs: 0, pageLimit: 10, attributeHistoricalUsd: async (events) => events });
  const result = await worker.runPage();
  assert.equal(result.sales, 0);
  assert.equal(writes.length, 0);
});

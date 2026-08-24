"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createDnsTonCenterLedger, DNS_COLLECTION } = require("../lib/dns-toncenter-ledger");

test("ingests only completed DNS sale contracts with historical USD", async () => {
  const writes = { assets: [], sales: [], state: null };
  const ledger = {
    readState: async () => ({ state: { cursor: {} } }),
    ingestAssets: async (records) => (writes.assets.push(...records), records.length),
    ingestSales: async (records) => (writes.sales.push(...records), records.length),
    writeState: async (_key, cursor, metadata) => { writes.state = { cursor, metadata }; },
  };
  const fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/nft/transfers")) return new Response(JSON.stringify({
      nft_transfers: [{ old_owner: "0:sale", nft_address: "0:item", transaction_now: 1_735_689_600, transaction_lt: 50, transaction_hash: "tx" }],
      address_book: { "0:sale": { interfaces: ["nft_sale_v3"] } },
    }), { status: 200, headers: { "content-type": "application/json" } });
    return new Response(JSON.stringify({ nft_sales: [{
      address: "0:sale", nft_address: "0:item", details: { is_complete: true, full_price: "10000000000" },
      nft_item: { content: { domain: "alpha.ton" } },
    }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
  const runtime = createDnsTonCenterLedger({
    ledger, fetch, requestDelayMs: 0, pageLimit: 10, now: () => Date.parse("2025-01-02T00:00:00Z"),
    attributeHistoricalUsd: async (events) => events.map((event) => ({ ...event, historicalUsdRate: 5, priceUsd: event.priceGram * 5, historicalUsdSource: "test", historicalUsdMethod: "exact" })),
  });
  const result = await runtime.runPage();

  assert.equal(result.sales, 1);
  assert.equal(writes.assets[0].normalizedName, "alpha.ton");
  assert.equal(writes.sales[0].priceGram, 10);
  assert.equal(writes.sales[0].priceUsd, 50);
  assert.equal(writes.sales[0].source, "toncenter-indexed-sale");
  assert.equal(writes.state.cursor.backfillComplete, true);
  assert.equal(new URL(writes.state ? `https://example.test/?collection=${DNS_COLLECTION}` : "").searchParams.get("collection"), DNS_COLLECTION);
});

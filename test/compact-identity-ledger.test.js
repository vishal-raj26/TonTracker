"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");
const { LogHistogram, canonicalSale, exactValuation, groupKey } = require("../scripts/refresh-identity-baselines");
const { trainUsernameLearnedModel } = require("../lib/username-learned-model");
const { createValuationLedgerClient } = require("../lib/valuation-ledger-client");

test("compact schema keeps normalized evidence and excludes raw payload columns", () => {
  const sql = fs.readFileSync(path.join(__dirname, "..", "cloudflare", "valuation-read-model.sql"), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS identity_sales/);
  assert.match(sql, /historical_usd_rate REAL NOT NULL/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS identity_sales_comparable_idx/);
  assert.doesNotMatch(sql, /identity_sales[\s\S]*raw_payload_json/);
  assert.match(sql, /max_sales INTEGER NOT NULL DEFAULT 2000000/);
});

test("valuation reads expose only verified unexpired identity market state",()=>{
  const source=fs.readFileSync(path.join(__dirname,"..","cloudflare","gift-registry-worker.mjs"),"utf8");
  assert.match(source,/LEFT JOIN identity_current_market cm/);
  assert.match(source,/cm\.verified=1[\s\S]*unixepoch\(cm\.stale_at\)>unixepoch\(\)/);
  assert.match(source,/freshMarket \? row\.live_bid_gram/);
});

test("username projection never revives expired persisted bids and carries live expiry proof", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "cloudflare", "gift-registry-worker.mjs"), "utf8");
  const fn = source.slice(source.indexOf("function valuationRecord("), source.indexOf("async function readValuationRecords("));
  const sandbox = {};
  vm.runInNewContext(fn, sandbox);
  const row = { asset_kind: "username", current_bid_gram: 500, current_listing_gram: 600,
    live_bid_gram: 100, live_listing_gram: 200, live_marketplace: "Fragment",
    live_observed_at: new Date(Date.now() - 1000).toISOString(), live_stale_at: new Date(Date.now() + 60000).toISOString() };
  assert.equal(sandbox.valuationRecord(row).currentBidGram, 0);
  assert.equal(sandbox.valuationRecord(row).currentListingGram, 0);
  const live = sandbox.valuationRecord({ ...row, market_state_fresh: 1 });
  assert.equal(live.currentBidGram, 100);
  assert.equal(live.currentMarket.verified, true);
  assert.equal(live.currentMarket.staleAt, row.live_stale_at);
  assert.equal(sandbox.valuationRecord({ ...row, asset_kind: "dns" }).currentBidGram, 500,
    "username correction must not change the DNS contract");
});

test("bounded histogram uses every observation without retaining sale objects", () => {
  const distribution = new LogHistogram();
  for (let value = 1; value <= 10_000; value += 1) distribution.add(value);
  assert.equal(distribution.count, 10_000);
  assert.ok(distribution.quantile(0.5) > 4_500);
  assert.ok(distribution.quantile(0.5) < 5_500);
  assert.equal(distribution.bins.length, 2400);
});

test("DNS baselines always use the canonical production classifier", () => {
  const sale = canonicalSale("dns", {
    normalized_name: "tonclub.ton",
    primary_route: "residual",
    length_bucket: "*",
    script: "Common",
    scarcity_class: "standard",
  });
  assert.equal(sale.primary_route, "crypto-ton");
  assert.equal(sale.length_bucket, "6-8");
});

test("saved comparable explanations are capped while evidence count remains complete", () => {
  const histogram = new LogHistogram();
  [1200, 1400, 1462, 1500, 1700].forEach((price) => histogram.add(price));
  const valuation = exactValuation("username", "fragment-index:kick", {
    name: "kick",
    count: 47,
    events: Array.from({ length: 47 }, (_, index) => ({ username: "kick", eventType: "sale", paymentAsset: "TON", priceUsd: 1462,
      eventTime: new Date(Date.now() - (index + 1) * 86400000).toISOString() })),
    histogram,
    lastSoldAt: Math.floor(Date.now() / 1000),
  });
  assert.equal(valuation.evidenceCount, 47);
  assert.equal(valuation.explanation.displayedComparableCount, 8);
  assert.equal(valuation.confidenceBand, "high");
  assert.ok(Math.abs(valuation.estimateUsd - 1462) < 20);
  assert.equal(groupKey("route", "word"), "route|word|*|*|*");
});

test("precomputed username valuations preserve own history through the shared evidence engine", () => {
  const nowMs = Date.now();
  const learnedModel = trainUsernameLearnedModel(Array.from({ length: 40 }, (_, index) => ({
    username: `ordinaryname${index}`, eventType: "sale", finalized: true,
    paymentAsset: "GRAM", priceUsd: 20 + index,
    eventTime: new Date(nowMs - index * 86_400_000).toISOString(),
  })), { nowMs });
  const histogram = new LogHistogram();
  histogram.add(1_700);
  const valuation = exactValuation("username", "0:exact", {
    name: "conviction", count: 1, histogram, lastPriceUsd: 1_700,
    lastSoldAt: Math.floor((nowMs - 400 * 86_400_000) / 1000),
  }, { learnedModel });
  assert.ok(valuation.estimateUsd >= 1_700);
  assert.equal(valuation.explanation.lastSaleAnchor.priceUsd, 1700);
});

test("a single finalized sale remains visible but cannot enter the portfolio total", () => {
  const histogram = new LogHistogram();
  histogram.add(7147.71);
  const valuation = exactValuation("dns", "0:single-sale", {
    name: "striker.ton",
    count: 1,
    histogram,
    lastSoldAt: Math.floor(Date.now() / 1000),
  });
  assert.equal(valuation.estimateUsd, 7147.705767941861);
  assert.equal(valuation.confidenceBand, "low");
  assert.equal(valuation.portfolioEligible, false);
  assert.equal(valuation.confidenceScore, 0.38);
});

test("ledger client batches writes and authenticates without exposing raw data", async () => {
  const calls = [];
  const client = createValuationLedgerClient({
    baseUrl: "https://registry.example",
    secret: "secret",
    fetch: async (url, init) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ inserted: JSON.parse(init.body).records.length }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const inserted = await client.ingestSales(Array.from({ length: 501 }, (_, index) => ({ saleId: String(index) })));
  assert.equal(inserted, 501);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].init.headers.authorization, "Bearer secret");
  assert.equal(JSON.parse(calls[0].init.body).records.length, 500);
});

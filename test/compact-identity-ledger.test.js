"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const { LogHistogram, canonicalSale, exactValuation, groupKey } = require("../scripts/refresh-identity-baselines");
const { createValuationLedgerClient } = require("../lib/valuation-ledger-client");

test("compact schema keeps normalized evidence and excludes raw payload columns", () => {
  const sql = fs.readFileSync(path.join(__dirname, "..", "cloudflare", "valuation-read-model.sql"), "utf8");
  assert.match(sql, /CREATE TABLE IF NOT EXISTS identity_sales/);
  assert.match(sql, /historical_usd_rate REAL NOT NULL/);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS identity_sales_comparable_idx/);
  assert.doesNotMatch(sql, /identity_sales[\s\S]*raw_payload_json/);
  assert.match(sql, /max_sales INTEGER NOT NULL DEFAULT 2000000/);
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
    histogram,
    lastSoldAt: Math.floor(Date.now() / 1000),
  });
  assert.equal(valuation.evidenceCount, 47);
  assert.equal(valuation.explanation.displayedComparableCount, 20);
  assert.equal(valuation.confidenceBand, "high");
  assert.ok(Math.abs(valuation.estimateUsd - 1462) < 20);
  assert.equal(groupKey("route", "word"), "route|word|*|*|*");
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

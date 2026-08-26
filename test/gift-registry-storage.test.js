"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

let normalizedSaleForIngest;

test.before(async () => {
  ({ normalizedSaleForIngest } = await import("../cloudflare/gift-registry-worker.mjs"));
});

test("registry stats default to active and compact sales storage", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "cloudflare", "gift-registry-worker.mjs"),
    "utf8"
  );
  assert.match(source, /const includeLegacySales = url\.searchParams\.get\("includeLegacy"\) === "1"/);
  assert.match(source, /: \[salesDatabase\(env\)\]\.filter\(Boolean\)/);
  assert.match(source, /sales_stats_scope: includeLegacySales/);
});

test("identity sale quota is reconciled from real rows, not upsert change counts", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "cloudflare", "gift-registry-worker.mjs"),
    "utf8"
  );
  assert.match(source, /const salesBefore = await exactIdentityCount\(database, "identity_sales"\)/);
  assert.match(source, /const trackedSales = await exactIdentityCount\(database, "identity_sales"\)/);
  assert.match(source, /SET tracked_sales=\?1,updated_at=CURRENT_TIMESTAMP/);
  assert.doesNotMatch(source, /SET tracked_sales=tracked_sales\+\?/);
});

test("DNS knowledge queues use the current semantic route marker consistently", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "cloudflare", "gift-registry-worker.mjs"),
    "utf8"
  );
  const queue = source.slice(source.indexOf("async function readIdentityKnowledgeQueue"), source.indexOf("async function ingestIdentityKnowledge"));
  assert.match(queue, /dns-semantic-route-v2/g);
  assert.doesNotMatch(queue, /dns-semantic-route-v1/);
});

test("identity knowledge queues separate fast lexical coverage from full enrichment", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "cloudflare", "gift-registry-worker.mjs"),
    "utf8"
  );
  const queue = source.slice(source.indexOf("async function readIdentityKnowledgeQueue"), source.indexOf("async function ingestIdentityKnowledge"));
  assert.match(queue, /const mode = String\(body\.mode \|\| "full"\)\.toLowerCase\(\)/);
  assert.match(queue, /json_extract\(a\.semantic_json,'\$\.lexicalLookupComplete'\) IS NOT 1/);
  assert.match(queue, /lexicalLookupAttemptedAt/);
  assert.match(queue, /7 \* 86400000/);
  assert.match(queue, /json_extract\(a\.semantic_json,'\$\.entityLookupComplete'\) IS NOT 1/);
});

test("newer valuation versions cannot be overwritten by an older writer", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "cloudflare", "gift-registry-worker.mjs"),
    "utf8"
  );
  assert.match(source, /excluded\.estimator_version = valuation_records\.estimator_version/);
  assert.match(source, /CAST\(substr\(excluded\.estimator_version/);
  assert.match(source, /CAST\(substr\(valuation_records\.estimator_version/);
});

test("market-reported username re-ingestion cannot downgrade chain-confirmed evidence", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "cloudflare", "gift-registry-worker.mjs"),
    "utf8"
  );
  const saleUpsert = source.slice(source.indexOf("ON CONFLICT(sale_id) DO UPDATE SET"), source.indexOf("async function ingestIdentityBaselines"));
  assert.match(saleUpsert, /WHEN identity_sales\.source LIKE '%toncenter%' THEN identity_sales\.source/);
  assert.match(saleUpsert, /reliability_score=MAX\(identity_sales\.reliability_score, excluded\.reliability_score\)/);
  assert.match(saleUpsert, /WHEN identity_sales\.source LIKE '%toncenter%' THEN identity_sales\.quality_flags_json/);
  assert.doesNotMatch(saleUpsert, /WHEN excluded\.source LIKE '%market-reported%' THEN MIN/);
});

test("identity sale reads include the compact prepared semantic record for model evaluation", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "cloudflare", "gift-registry-worker.mjs"),
    "utf8"
  );
  const reader = source.slice(source.indexOf("async function readIdentitySales"), source.indexOf("async function readIdentityBaselineSource"));
  assert.match(reader, /SELECT s\.\*,a\.semantic_json FROM identity_sales s/);
  assert.match(reader, /LEFT JOIN identity_assets a ON a\.asset_kind=s\.asset_kind AND a\.normalized_name=s\.normalized_name/);
  assert.match(reader, /ORDER BY s\.sold_at DESC, s\.sale_id DESC/);
});

test("registry accepts USD only when it matches the sale's historical rate", () => {
  const sale = normalizedSaleForIngest({
    saleId: "verified-sale",
    collection: "Diamond Rings",
    model: "Black Hole",
    backdrop: "Electric Purple",
    soldAt: "2025-11-10T12:00:00.000Z",
    priceTon: 10,
    priceUsd: 35,
    tonUsdRate: 3.5,
    rateAt: "2025-11-10T12:00:00.000Z",
  });

  assert.equal(sale.priceUsd, 35);
  assert.equal(sale.tonUsdRate, 3.5);
  assert.equal(sale.rateAt, "2025-11-10T12:00:00.000Z");
});

test("registry keeps TON evidence but rejects a current rate attached to an old sale", () => {
  const sale = normalizedSaleForIngest({
    saleId: "stale-rate-sale",
    collection: "Diamond Rings",
    model: "Black Hole",
    backdrop: "Electric Purple",
    soldAt: "2025-11-10T12:00:00.000Z",
    priceTon: 10,
    priceUsd: 50,
    tonUsdRate: 5,
    rateAt: "2026-08-24T12:00:00.000Z",
  });

  assert.equal(sale.priceTon, 10);
  assert.equal(sale.priceUsd, 0);
  assert.equal(sale.tonUsdRate, 0);
  assert.equal(sale.rateAt, "");
});

test("pending historical-rate rows have a bounded authenticated retry route", () => {
  const source = fs.readFileSync(
    path.join(__dirname, "..", "cloudflare", "gift-registry-worker.mjs"),
    "utf8"
  );
  assert.match(source, /readPendingHistoricalSaleRates\(request, env\)/);
  assert.match(source, /e\.price_usd_micros <= 0 OR e\.ton_usd_micros <= 0 OR e\.rate_at <= 0/);
  assert.match(source, /Math\.min\(1000, Number\(url\.searchParams\.get\("limit"\)/);
  assert.match(source, /"\/ingest\/sales-pending-rates"/);
});

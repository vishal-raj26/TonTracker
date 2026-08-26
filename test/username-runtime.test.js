"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createUsernameRuntime } = require("../lib/username-runtime");
const { USERNAME_CALIBRATION_VERSION, USERNAME_ESTIMATOR_VERSION } = require("../lib/username-engine");

test("returns a batch username valuation without turning a listing into a portfolio price", async () => {
  const pool = { query: async (sql) => {
    if (/username_valuations/.test(sql)) return { rows: [{
      nft_address: "0:name", username_normalized: "kick", estimate_usd: "1462", range_low_usd: "1000", range_high_usd: "1900",
      confidence_score: 0.8, confidence_band: "high", valuation_status: "estimated", portfolio_eligible: true, evidence_count: 4,
      effective_comp_count: 3.5, own_sale_count: 3, current_listing_gram: "800", current_bid_gram: "0", estimator_version: USERNAME_ESTIMATOR_VERSION, calibration_version: USERNAME_CALIBRATION_VERSION, explanation_json: {}, valued_at: new Date(), stale_at: new Date(Date.now() + 60_000),
    }] };
    return { rows: [] };
  } };
  const runtime = createUsernameRuntime({ pool, portfolioEstimatesEnabled: true });
  const [asset] = await runtime.valueAssets([{ tokenAddress: "0:name", username: "kick", floorTon: 900, valuationKind: "active-listing" }]);
  assert.equal(asset.floorUsd, 1462);
  assert.equal(asset.currentListingGram, 900);
  assert.equal(asset.valuationKind, "username-estimate");
});

test("falls back to canonical username when a wallet NFT address has no alias yet", async () => {
  const pool = { query: async (sql) => {
    if (/WITH requested/.test(sql)) return { rows: [] };
    if (/lookup_username/.test(sql)) return { rows: [{
      nft_address: "fragment-index:canonical", username_normalized: "kick", lookup_username: "kick",
      estimate_usd: "1462", range_low_usd: "1000", range_high_usd: "1900", confidence_score: 0.8,
      confidence_band: "high", valuation_status: "estimated", portfolio_eligible: true, evidence_count: 4,
      effective_comp_count: 3.5, own_sale_count: 3, estimator_version: USERNAME_ESTIMATOR_VERSION,
      calibration_version: USERNAME_CALIBRATION_VERSION, explanation_json: {}, valued_at: new Date(), stale_at: new Date(Date.now() + 60_000),
    }] };
    return { rows: [] };
  } };
  const runtime = createUsernameRuntime({ pool, portfolioEstimatesEnabled: true });
  const [asset] = await runtime.valueAssets([{ tokenAddress: "0:wallet-nft", username: "@Kick" }]);
  assert.equal(asset.floorUsd, 1462);
  assert.equal(asset.valuationKind, "username-estimate");
});

test("does not publish a generic D1 baseline as a first-import username price", async () => {
  const runtime = createUsernameRuntime({
    valuationReadModelUrl: "https://registry.example",
    portfolioEstimatesEnabled: true,
    fetch: async (url) => new Response(JSON.stringify(url.endsWith("/valuations/read")
      ? { configured: true, records: [] }
      : { configured: true, records: [{
        scope: "global", primary_route: "*", length_bucket: "*", script: "*", scarcity_class: "*",
        midpoint_usd: 90, range_low_usd: 60, range_high_usd: 130, evidence_count: 45,
        effective_comp_count: 45,
      }] }), { status: 200, headers: { "content-type": "application/json" } }),
  });
  const [asset] = await runtime.valueAssets([{ tokenAddress: "0:fresh", username: "newhandle" }]);
  assert.equal(asset.floorUsd, 0);
  assert.equal(asset.usernameValuationStatus, "processing");
  assert.equal(asset.valuationKind, "processing");
});

test("reads username detail and status from compact D1 without PostgreSQL", async () => {
  const runtime = createUsernameRuntime({
    valuationReadModelUrl: "https://registry.example",
    portfolioEstimatesEnabled: true,
    fetch: async (url) => new Response(JSON.stringify(url.endsWith("/valuations/read")
      ? { configured: true, records: [{ assetKey: "0:name", displayName: "@kick", estimateUsd: 1462 }] }
      : { configured: true, records: [{ scope: "global", midpoint_usd: 90, range_low_usd: 60, range_high_usd: 130, evidence_count: 45 }] }), { status: 200, headers: { "content-type": "application/json" } }),
  });
  assert.equal((await runtime.getValuationDetailByUsername("kick")).estimateUsd, 1462);
  assert.equal((await runtime.status()).source, "compact-d1");
});

test("re-scores an old direct username lookup before returning it", async () => {
  const now = Date.now();
  let written = null;
  const runtime = createUsernameRuntime({
    valuationReadModelUrl: "https://registry.example",
    valuationReadModelSecret: "secret",
    portfolioEstimatesEnabled: true,
    fetch: async (url, init = {}) => {
      if (url.endsWith("/valuations/read")) return new Response(JSON.stringify({ records: [{
        assetKey: "0:old", displayName: "@marketname", estimateUsd: 14,
        estimatorVersion: "username-market-v5", staleAt: new Date(now + 60_000).toISOString(),
      }] }), { status: 200 });
      if (url.endsWith("/identity/baselines/read")) return new Response(JSON.stringify({ records: [] }), { status: 200 });
      if (url.endsWith("/identity/username-evidence/read")) return new Response(JSON.stringify({ records: Array.from({ length: 12 }, (_, index) => ({
        sale_id: `sale-${index}`, asset_key: `fragment:${index}`, normalized_name: `marketname${index}`,
        sold_at: Math.floor((now - index * 86_400_000) / 1000), price_usd: 100 + index * 5, reliability_score: 1,
      })) }), { status: 200 });
      if (url.endsWith("/ingest/valuations")) {
        written = JSON.parse(init.body).records[0];
        return new Response(JSON.stringify({ written: 1 }), { status: 200 });
      }
      return new Response(JSON.stringify({ records: [] }), { status: 200 });
    },
  });
  const valuation = await runtime.getValuationByUsername("marketname");
  assert.equal(valuation.estimatorVersion, USERNAME_ESTIMATOR_VERSION);
  assert.ok(valuation.estimateUsd > 0);
  assert.equal(written.estimatorVersion, USERNAME_ESTIMATOR_VERSION);
});

test("re-scores a current username valuation when the global baseline revision changes", async () => {
  const now = Date.now();
  let written = null;
  const runtime = createUsernameRuntime({
    valuationReadModelUrl: "https://registry.example", valuationReadModelSecret: "secret",
    firstImportEvidence: false,
    fetch: async (url, init = {}) => {
      if (url.endsWith("/valuations/read")) return new Response(JSON.stringify({ records: [{
        assetKey: "0:revision", displayName: "@marketname", estimateUsd: 14,
        estimatorVersion: USERNAME_ESTIMATOR_VERSION, staleAt: new Date(now + 60_000).toISOString(),
        explanation: { baselineRevision: "older-baseline" },
      }] }), { status: 200 });
      if (url.endsWith("/identity/baselines/read")) return new Response(JSON.stringify({ records: [{
        scope: "global", primary_route: "*", length_bucket: "*", script: "*", scarcity_class: "*",
        midpoint_usd: 20, range_low_usd: 10, range_high_usd: 40, evidence_count: 100,
        generated_at: "2026-08-25T09:02:13.997Z",
      }] }), { status: 200 });
      if (url.endsWith("/identity/username-evidence/read")) return new Response(JSON.stringify({ records: Array.from({ length: 12 }, (_, index) => ({
        sale_id: `revision-${index}`, asset_key: `fragment:${index}`, normalized_name: `marketname${index}`,
        sold_at: Math.floor((now - index * 86_400_000) / 1000), price_usd: 100 + index, reliability_score: 1,
      })) }), { status: 200 });
      if (url.endsWith("/ingest/valuations")) {
        written = JSON.parse(init.body).records[0];
        return new Response(JSON.stringify({ written: 1 }), { status: 200 });
      }
      return new Response(JSON.stringify({ records: [] }), { status: 200 });
    },
  });
  const [asset] = await runtime.valueAssets([{ tokenAddress: "0:revision", username: "marketname" }]);
  assert.ok(asset.estimatedUsd > 0);
  assert.equal(written.explanation.baselineRevision, "2026-08-25T09:02:13.997Z");
});

test("keeps a stale prepared username estimate out of portfolio totals", async () => {
  const runtime = createUsernameRuntime({
    valuationReadModelUrl: "https://registry.example",
    portfolioEstimatesEnabled: true,
    fetch: async (url) => new Response(JSON.stringify(url.endsWith("/valuations/read")
      ? { records: [{ assetKey: "0:catalog", displayName: "@kick", estimateUsd: 1462, confidenceBand: "high", portfolioEligible: true, valuationStatus: "estimated", estimatorVersion: "username-market-v2", staleAt: new Date(Date.now() - 60_000).toISOString() }] }
      : { records: [] }), { status: 200, headers: { "content-type": "application/json" } }),
  });
  const [asset] = await runtime.valueAssets([{ tokenAddress: "0:wallet", username: "kick" }]);
  assert.equal(asset.estimatedUsd, 1462);
  assert.equal(asset.floorUsd, 0);
  assert.equal(asset.valuationStale, true);
});

test("batches compact username reads within the D1 SQL-variable limit", async () => {
  let requests = 0;
  const runtime = createUsernameRuntime({
    valuationReadModelUrl: "https://registry.example",
    fetch: async (url) => {
      if (url.endsWith("/valuations/read")) requests += 1;
      return new Response(JSON.stringify({ records: [] }), { status: 200, headers: { "content-type": "application/json" } });
    },
  });
  await runtime.lookupValuations(Array.from({ length: 501 }, (_, index) => `0:${index}`));
  assert.equal(requests, 11);
});

test("scores and caches a missing first-import username from completed D1 sales", async () => {
  const calls = [];
  const now = Date.now();
  const runtime = createUsernameRuntime({
    valuationReadModelUrl: "https://registry.example",
    valuationReadModelSecret: "secret",
    firstImportEvidence: false,
    portfolioEstimatesEnabled: true,
    fetch: async (url, init = {}) => {
      calls.push(url);
      if (url.endsWith("/valuations/read")) return new Response(JSON.stringify({ records: [] }), { status: 200 });
      if (url.endsWith("/identity/baselines/read")) return new Response(JSON.stringify({ records: [] }), { status: 200 });
      if (url.endsWith("/identity/username-evidence/read")) return new Response(JSON.stringify({ records: Array.from({ length: 12 }, (_, index) => ({
        sale_id: `sale-${index}`, asset_key: `fragment:${index}`, normalized_name: `marketname${index}`,
        sold_at: Math.floor((now - index * 86_400_000) / 1000), price_usd: 100 + index * 5, reliability_score: 1,
      })) }), { status: 200 });
      if (url.endsWith("/ingest/valuations")) {
        assert.equal(init.headers.authorization, "Bearer secret");
        return new Response(JSON.stringify({ written: 1 }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    },
  });
  const [asset] = await runtime.valueAssets([{ tokenAddress: "0:fresh", username: "marketname" }]);
  assert.ok(asset.estimatedUsd > 0);
  assert.equal(asset.valuationExplanation.provenance, "first-import-learned-ensemble");
  assert.ok(calls.some((url) => url.endsWith("/identity/username-evidence/read")));
  assert.ok(calls.some((url) => url.endsWith("/ingest/valuations")));
  assert.equal(calls.some((url) => /\/ingest\/identity-(assets|aliases|sales)$/.test(url)), false);
  assert.equal(calls.some((url) => url.endsWith("/ingest/identity-knowledge")), false);
});

test("refreshes a first-import estimate in the background after wallet evidence is durable", async () => {
  const now = Date.now();
  let releaseEnrichment;
  let valuationWrites = 0;
  let evidenceWrites = 0;
  const evidence = {
    enrich: async () => new Promise((resolve) => { releaseEnrichment = () => resolve({
      assets: [{ assetKind: "username", assetKey: "0:background", normalizedName: "marketname" }],
      aliases: [{ assetKind: "username", aliasKey: "0:background", normalizedName: "marketname" }],
      sales: [],
      inspected: [{ username: "marketname", reportedSales: 0, verifiedSales: 0 }],
    }); }),
  };
  const runtime = createUsernameRuntime({
    valuationReadModelUrl: "https://registry.example", valuationReadModelSecret: "secret",
    portfolioEstimatesEnabled: true, firstImportEvidence: evidence,
    fetch: async (url) => {
      if (url.endsWith("/valuations/read")) return new Response(JSON.stringify({ records: [] }), { status: 200 });
      if (url.endsWith("/identity/baselines/read")) return new Response(JSON.stringify({ records: [] }), { status: 200 });
      if (url.endsWith("/identity/username-evidence/read")) return new Response(JSON.stringify({ records: Array.from({ length: 12 }, (_, index) => ({
        sale_id: `background-${index}`, asset_key: `fragment:${index}`, normalized_name: `marketname${index}`,
        sold_at: Math.floor((now - index * 86_400_000) / 1000), price_usd: 100 + index, reliability_score: 1,
      })) }), { status: 200 });
      if (url.endsWith("/ingest/valuations")) { valuationWrites += 1; return new Response(JSON.stringify({ written: 1 }), { status: 200 }); }
      if (/\/ingest\/identity-(assets|aliases|sales)$/.test(url)) { evidenceWrites += 1; return new Response(JSON.stringify({ accepted: 1 }), { status: 200 }); }
      return new Response(JSON.stringify({ records: [] }), { status: 200 });
    },
  });

  const [asset] = await runtime.valueAssets([{ tokenAddress: "0:background", username: "marketname" }]);
  assert.ok(asset.estimatedUsd > 0);
  assert.equal(valuationWrites, 1);
  await new Promise((resolve) => setImmediate(resolve));
  releaseEnrichment();
  for (let index = 0; index < 4; index += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(evidenceWrites, 2);
  assert.equal(valuationWrites, 2);
});

test("background wallet evidence upgrades a comparable username estimate with an exact verified sale", async () => {
  const now = Date.now();
  let releaseEnrichment;
  let evidenceReady = false;
  const valuations = [];
  const evidence = {
    enrich: async () => new Promise((resolve) => { releaseEnrichment = () => {
      evidenceReady = true;
      resolve({
        assets: [{ assetKind: "username", assetKey: "0:exact-background", normalizedName: "marketname" }],
        aliases: [{ assetKind: "username", aliasKey: "0:exact-background", normalizedName: "marketname" }],
        sales: [{ saleId: "exact-sale", assetKind: "username", assetKey: "0:exact-background", normalizedName: "marketname", soldAt: new Date(now - 86_400_000).toISOString(), priceGram: 500, historicalUsdRate: 2, priceUsd: 1000 }],
        inspected: [{ username: "marketname", reportedSales: 1, verifiedSales: 1 }],
      });
    }; }),
  };
  const comparableRecords = Array.from({ length: 12 }, (_, index) => ({
    sale_id: `comparable-${index}`, asset_key: `fragment:${index}`, normalized_name: `marketname${index}`,
    sold_at: Math.floor((now - index * 86_400_000) / 1000), price_usd: 90 + index, reliability_score: 1,
  }));
  const runtime = createUsernameRuntime({
    valuationReadModelUrl: "https://registry.example", valuationReadModelSecret: "secret",
    portfolioEstimatesEnabled: true, firstImportEvidence: evidence,
    fetch: async (url, init = {}) => {
      if (url.endsWith("/valuations/read")) return new Response(JSON.stringify({ records: [] }), { status: 200 });
      if (url.endsWith("/identity/baselines/read")) return new Response(JSON.stringify({ records: [] }), { status: 200 });
      if (url.endsWith("/identity/username-evidence/read")) return new Response(JSON.stringify({ records: evidenceReady
        ? [{ sale_id: "exact-sale", asset_key: "0:exact-background", normalized_name: "marketname", sold_at: Math.floor((now - 86_400_000) / 1000), price_usd: 1000, reliability_score: 1 }, ...comparableRecords]
        : comparableRecords }), { status: 200 });
      if (url.endsWith("/ingest/valuations")) {
        valuations.push(JSON.parse(init.body).records[0]);
        return new Response(JSON.stringify({ written: 1 }), { status: 200 });
      }
      if (/\/ingest\/identity-(assets|aliases|sales)$/.test(url)) return new Response(JSON.stringify({ accepted: 1, inserted: 1 }), { status: 200 });
      return new Response(JSON.stringify({ records: [] }), { status: 200 });
    },
  });

  const [asset] = await runtime.valueAssets([{ tokenAddress: "0:exact-background", username: "marketname" }]);
  assert.ok(asset.estimatedUsd > 0);
  await new Promise((resolve) => setImmediate(resolve));
  releaseEnrichment();
  for (let index = 0; index < 4; index += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(valuations.length, 2);
  assert.ok(valuations[1].estimateUsd > valuations[0].estimateUsd * 2);
  assert.equal(valuations[1].ownSaleCount, 1);
});

test("uses stored semantic knowledge for first-import comparable sales", async () => {
  const now = Date.now();
  let written = null;
  const runtime = createUsernameRuntime({
    valuationReadModelUrl: "https://registry.example",
    valuationReadModelSecret: "secret",
    firstImportEvidence: false,
    portfolioEstimatesEnabled: true,
    fetch: async (url, init = {}) => {
      if (url.endsWith("/valuations/read")) return new Response(JSON.stringify({ records: [] }), { status: 200 });
      if (url.endsWith("/identity/baselines/read")) return new Response(JSON.stringify({ records: [] }), { status: 200 });
      if (url.endsWith("/identity/username-evidence/read")) return new Response(JSON.stringify({
        records: Array.from({ length: 12 }, (_, index) => ({
          sale_id: `semantic-${index}`, asset_key: `fragment:semantic-${index}`,
          normalized_name: `peerhandle${index}`, sold_at: Math.floor((now - index * 86_400_000) / 1000),
          price_usd: 180 + index * 5, reliability_score: 1,
          semantic_json: JSON.stringify({ schemaVersion: "username-knowledge-v4", relatedTerms: ["rarehandle"] }),
        })),
      }), { status: 200 });
      if (url.endsWith("/ingest/valuations")) {
        written = JSON.parse(init.body).records[0];
        return new Response(JSON.stringify({ written: 1 }), { status: 200 });
      }
      return new Response(JSON.stringify({ records: [] }), { status: 200 });
    },
  });

  const [asset] = await runtime.valueAssets([{ tokenAddress: "0:semantic", username: "rarehandle" }]);
  assert.ok(asset.estimatedUsd > 0);
  assert.ok(written.explanation.comparableNames.some((name) => name.startsWith("peerhandle")));
});

test("writes wallet-priority verified evidence before re-reading a first-import valuation", async () => {
  const calls = [];
  let valuationReads = 0;
  const valuation = {
    assetKey: `0:${"a".repeat(64)}`, displayName: "@kick", estimateUsd: 1200,
    confidenceBand: "low", portfolioEligible: false, valuationStatus: "estimated",
    estimatorVersion: USERNAME_ESTIMATOR_VERSION, staleAt: new Date(Date.now() + 60_000).toISOString(),
  };
  const evidence = {
    enrich: async () => ({
      assets: [{ assetKind: "username", assetKey: valuation.assetKey, normalizedName: "kick" }],
      aliases: [{ assetKind: "username", aliasKey: valuation.assetKey, normalizedName: "kick" }],
      sales: [{ saleId: "verified-sale", assetKind: "username", assetKey: valuation.assetKey, normalizedName: "kick", priceGram: 100, historicalUsdRate: 2, priceUsd: 200 }],
      inspected: [{ username: "kick", reportedSales: 1, verifiedSales: 1 }],
    }),
  };
  const runtime = createUsernameRuntime({
    valuationReadModelUrl: "https://registry.example", valuationReadModelSecret: "secret",
    firstImportEvidence: evidence,
    fetch: async (url, init = {}) => {
      calls.push({ url, init });
      if (url.endsWith("/valuations/read")) {
        valuationReads += 1;
        return new Response(JSON.stringify({ records: valuationReads === 1 ? [] : [valuation] }), { status: 200 });
      }
      if (/\/ingest\/identity-(assets|aliases|sales)$/.test(url)) return new Response(JSON.stringify({ accepted: 1, inserted: 1 }), { status: 200 });
      return new Response(JSON.stringify({ records: [] }), { status: 200 });
    },
  });
  const [asset] = await runtime.valueAssets([{ tokenAddress: valuation.assetKey, username: "kick" }]);
  assert.equal(asset.estimatedUsd, 1200);
  assert.ok(calls.some((call) => call.url.endsWith("/ingest/identity-assets")));
  assert.ok(calls.some((call) => call.url.endsWith("/ingest/identity-aliases")));
  const saleRequest = calls.find((call) => call.url.endsWith("/ingest/identity-sales"));
  assert.equal(JSON.parse(saleRequest.init.body).records[0].saleId, "verified-sale");
  assert.ok(valuationReads >= 2);
});

test("records a wallet username NFT alias in D1 even without PostgreSQL", async () => {
  const calls = [];
  const runtime = createUsernameRuntime({
    valuationReadModelUrl: "https://registry.example",
    valuationReadModelSecret: "secret",
    fetch: async (url, init = {}) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ accepted: 1 }), { status: 200 });
    },
  });
  const result = await runtime.enqueueAssets([{ tokenAddress: "0:real-item", username: "kick" }]);
  assert.equal(result.queued, 1);
  const assetRequest = calls.find((call) => call.url.endsWith("/ingest/identity-assets"));
  assert.equal(assetRequest.init.headers.authorization, "Bearer secret");
  assert.deepEqual(JSON.parse(assetRequest.init.body).records.map((row) => ({
    assetKind: row.assetKind, assetKey: row.assetKey, normalizedName: row.normalizedName,
    primaryRoute: row.primaryRoute, lengthBucket: row.lengthBucket, script: row.script, scarcityClass: row.scarcityClass,
  })), [{
    assetKind: "username", assetKey: "0:real-item", normalizedName: "kick",
    primaryRoute: "short", lengthBucket: "4-5", script: "Latin", scarcityClass: "4L",
  }]);
  const request = calls.find((call) => call.url.endsWith("/ingest/identity-aliases"));
  assert.equal(request.init.headers.authorization, "Bearer secret");
  assert.deepEqual(JSON.parse(request.init.body).records, [{
    assetKind: "username", aliasKey: "0:real-item", normalizedName: "kick", source: "wallet-import",
  }]);
});

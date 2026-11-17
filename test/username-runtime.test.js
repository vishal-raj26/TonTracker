"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { createUsernameRuntime } = require("../lib/username-runtime");
const { USERNAME_CALIBRATION_VERSION, USERNAME_ESTIMATOR_VERSION } = require("../lib/username-engine");

test("unsupported model evidence is unavailable rather than perpetually processing", async () => {
  const runtime = createUsernameRuntime({ valuationReadModelUrl: "https://registry.example",
    fetch: async (url) => new Response(JSON.stringify({ records: url.endsWith("/valuations/read") ? [{
      assetKey: "0:unsupported", displayName: "@1234", estimateUsd: 0, valuationStatus: "unavailable",
      estimatorVersion: USERNAME_ESTIMATOR_VERSION, staleAt: new Date(Date.now() + 60_000).toISOString(),
      explanation: { unavailableReason: "unsupported-model-cohort" },
    }] : [] })) });
  const [asset] = await runtime.valueAssets([{ tokenAddress: "0:unsupported", username: "1234" }]);
  assert.equal(asset.floorUsd, 0);
  assert.equal(asset.portfolioEligible, false);
  assert.equal(asset.usernameValuationStatus, "unavailable");
  assert.equal(asset.valuationKind, "unavailable");
});

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
  assert.equal(asset.currentListingGram, 0, "a listing without freshness proof is not a verified current signal");
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

test("canonical-name fallback cannot borrow a different real NFT valuation", async () => {
  const raw = `0:${"a".repeat(64)}`, other = `0:${"b".repeat(64)}`;
  const record = { assetKey: other, displayName: "@kick", estimateUsd: 1462,
    valuationStatus: "estimated", confidenceBand: "high", portfolioEligible: true,
    estimatorVersion: USERNAME_ESTIMATOR_VERSION, staleAt: new Date(Date.now() + 60000).toISOString() };
  const runtime = createUsernameRuntime({ valuationReadModelUrl: "https://registry.example", firstImportEvidence: false,
    fetch: async url => new Response(JSON.stringify({ records: url.endsWith("/valuations/read") ? [record] : [] })) });
  const [asset] = await runtime.valueAssets([{ tokenAddress: raw, username: "kick" }]);
  assert.equal(asset.floorUsd, 0);
  assert.notEqual(asset.valuationKind, "username-estimate");
});

test("matching TON address encodings resolve the same NFT without name-based fallback", async () => {
  const { Address } = require("@ton/core");
  const raw = `0:${"a".repeat(64)}`, friendly = Address.parse(raw).toString({ bounceable: false });
  const runtime = createUsernameRuntime({ valuationReadModelUrl: "https://registry.example", firstImportEvidence: false,
    fetch: async url => new Response(JSON.stringify({ records: url.endsWith("/valuations/read") ? [{
      assetKey: raw, displayName: "@kick", estimateUsd: 1462, valuationStatus: "estimated",
      confidenceBand: "high", portfolioEligible: true, estimatorVersion: USERNAME_ESTIMATOR_VERSION,
      staleAt: new Date(Date.now() + 60000).toISOString(),
    }] : [] })) });
  const [asset] = await runtime.valueAssets([{ tokenAddress: friendly, username: "kick" }]);
  assert.equal(asset.floorUsd, 1462);
});

test("a cached username market signal expires independently of its estimate", async () => {
  const record = { assetKey: "0:name", displayName: "@kick", estimateUsd: 100,
    valuationStatus: "estimated", confidenceBand: "high", portfolioEligible: true,
    estimatorVersion: USERNAME_ESTIMATOR_VERSION, staleAt: new Date(Date.now() + 60000).toISOString(),
    currentBidGram: 10, currentMarket: { verified: true, observedAt: new Date(Date.now() - 1000).toISOString(),
      staleAt: new Date(Date.now() + 60000).toISOString() } };
  let reads = 0;
  const runtime = createUsernameRuntime({ valuationReadModelUrl: "https://registry.example", firstImportEvidence: false,
    fetch: async url => { if (url.endsWith("/valuations/read")) reads++;
      return new Response(JSON.stringify({ records: url.endsWith("/valuations/read") ? [record] : [] })); } });
  const input = [{ tokenAddress: "0:name", username: "kick" }];
  assert.equal((await runtime.valueAssets(input))[0].currentBidGram, 10);
  const cached = await runtime.lookupValuations(["0:name"]);
  cached.get("0:name").currentMarket.staleAt = new Date(0).toISOString();
  const [expired] = await runtime.valueAssets(input);
  assert.equal(expired.currentBidGram, 0);
  assert.equal(expired.floorUsd, 100);
  assert.equal(reads, 1, "the cache itself must enforce market expiry");
});

test("PostgreSQL name fallback rejects a valuation bound to another real NFT", async () => {
  const pool = { query: async sql => ({ rows: /lookup_username/.test(sql) ? [{
    nft_address: `0:${"b".repeat(64)}`, username_normalized: "kick", lookup_username: "kick",
    estimate_usd: 1462, valuation_status: "estimated", confidence_band: "high", portfolio_eligible: true,
    estimator_version: USERNAME_ESTIMATOR_VERSION, stale_at: new Date(Date.now() + 60000),
  }] : [] }) };
  const runtime = createUsernameRuntime({ pool, firstImportEvidence: false });
  const [asset] = await runtime.valueAssets([{ tokenAddress: `0:${"a".repeat(64)}`, username: "kick" }]);
  assert.equal(asset.floorUsd, 0);
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
      ? { configured: true, records: [{ assetKey: "0:name", displayName: "@kick", estimateUsd: 1462,
        valuationStatus: "indicative", estimatorVersion: USERNAME_ESTIMATOR_VERSION,
        valuedAt: new Date(Date.now() - 1000).toISOString(), staleAt: new Date(Date.now() + 60000).toISOString() }] }
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
  const [asset] = await runtime.valueAssets([{ tokenAddress: "0:catalog", username: "kick" }]);
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
      marketStates: [{ assetKind:"username",assetKey:"0:background",highestBidGram:125,verified:true,observedAt:new Date(now).toISOString(),staleAt:new Date(now+60_000).toISOString() }],
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
      if (/\/ingest\/identity-(assets|aliases|sales|market)$/.test(url)) { evidenceWrites += 1; return new Response(JSON.stringify({ accepted: 1 }), { status: 200 }); }
      return new Response(JSON.stringify({ records: [] }), { status: 200 });
    },
  });

  const [asset] = await runtime.valueAssets([{ tokenAddress: "0:background", username: "marketname" }]);
  assert.ok(asset.estimatedUsd > 0);
  assert.equal(valuationWrites, 1);
  await new Promise((resolve) => setImmediate(resolve));
  releaseEnrichment();
  for (let index = 0; index < 4; index += 1) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(evidenceWrites, 3);
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

test("returns an evidence miss promptly and persists wallet history in the background", async () => {
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
  assert.equal(asset.floorUsd, 0);
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(calls.some((call) => call.url.endsWith("/ingest/identity-assets")));
  assert.ok(calls.some((call) => call.url.endsWith("/ingest/identity-aliases")));
  const saleRequest = calls.find((call) => call.url.endsWith("/ingest/identity-sales"));
  assert.equal(JSON.parse(saleRequest.init.body).records[0].saleId, "verified-sale");
  const [refreshed] = await runtime.valueAssets([{ tokenAddress: valuation.assetKey, username: "kick" }]);
  assert.equal(refreshed.estimatedUsd, 1200);
  assert.equal(refreshed.floorUsd, 0);
  assert.equal(refreshed.portfolioEligible, false);
  assert.equal(refreshed.usernameValuationStatus, "indicative");
  assert.equal(refreshed.valuationKind, "username-estimate-low");
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

test("public single and batch APIs reject obsolete, expired, undated and nonfinite estimates", async () => {
  const good = { assetKey: "0:name", displayName: "@kick", estimateUsd: 100, rangeLowUsd: 80, rangeHighUsd: 140,
    valuationStatus: "estimated", confidenceBand: "high", portfolioEligible: true,
    estimatorVersion: USERNAME_ESTIMATOR_VERSION, valuedAt: new Date(Date.now() - 1000).toISOString(),
    staleAt: new Date(Date.now() + 60000).toISOString(), currentBidGram: 10,
    explanation: { lastSaleAnchor: { priceUsd: 90, soldAt: "2025-01-01T00:00:00Z" } } };
  for (const patch of [{ estimatorVersion: "old" }, { staleAt: new Date(0).toISOString() }, { valuationStale: true },
    { valuedAt: null }, { valuedAt: new Date(Date.now() + 10000).toISOString() },
    { estimateUsd: "Infinity" }, { valuationStatus: "unavailable" }]) {
    const record = { ...good, ...patch };
    const runtime = createUsernameRuntime({ valuationReadModelUrl: "https://registry.example", firstImportEvidence: false,
      fetch: async url => new Response(JSON.stringify({ records: url.endsWith("/valuations/read") ? [record] : [] })) });
    for (const result of [await runtime.getValuationByUsername("kick"),
      await runtime.getValuationDetailByUsername("kick"), (await runtime.lookupPublishedValuations(["0:name"])).get("0:name")]) {
      assert.equal(result.estimateUsd, 0);
      assert.equal(result.rangeLowUsd, 0);
      assert.equal(result.rangeHighUsd, 0);
      assert.equal(result.valuationStatus, "unavailable");
      assert.equal(result.portfolioEligible, false);
      assert.equal(result.currentBidGram, 0);
      assert.equal(result.explanation.lastSaleAnchor.priceUsd, 90, "history remains explicitly historical");
    }
  }
});

test("single-name API selects the requested identity and rejects conflicting real identities", async () => {
  const target = { assetKey: "0:name", displayName: "@kick", estimateUsd: 100,
    valuationStatus: "indicative", estimatorVersion: USERNAME_ESTIMATOR_VERSION,
    valuedAt: new Date(Date.now() - 1000).toISOString(), staleAt: new Date(Date.now() + 60000).toISOString() };
  const make = records => createUsernameRuntime({ valuationReadModelUrl: "https://registry.example", firstImportEvidence: false,
    fetch: async url => new Response(JSON.stringify({ records: url.endsWith("/valuations/read") ? records : [] })) });
  assert.equal((await make([{ ...target, assetKey: "0:other", displayName: "@other", estimateUsd: 999 }, target]).getValuationByUsername("@Kick")).estimateUsd, 100);
  assert.equal(await make([{ ...target, displayName: "@other" }]).getValuationByUsername("kick"), null);
  assert.equal(await make([target, { ...target, assetKey: "0:conflict" }]).getValuationByUsername("kick"), null);
  const result = await make([target, { ...target, assetKey: "0:foreign", displayName: "@other" }]).lookupPublishedValuations(["0:name"]);
  assert.deepEqual([...result.keys()], ["0:name"]);
});

test("failed refresh does not republish an obsolete direct API value", async () => {
  const runtime = createUsernameRuntime({ valuationReadModelUrl: "https://registry.example", valuationReadModelSecret: "secret",
    firstImportEvidence: false, logger: { warn() {} }, fetch: async url => {
      if (url.endsWith("/valuations/read")) return new Response(JSON.stringify({ records: [{
        assetKey: "0:name", displayName: "@kick", estimateUsd: 100, valuationStatus: "estimated",
        estimatorVersion: "old", valuedAt: new Date(Date.now() - 1000).toISOString(), staleAt: new Date(Date.now() + 60000).toISOString(),
      }] }));
      return new Response("source unavailable", { status: 503 });
    } });
  const result = await runtime.getValuationByUsername("kick");
  assert.equal(result.valuationStatus, "unavailable");
  assert.equal(result.estimateUsd, 0);
  assert.equal(result.explanation.unavailableReason, "obsolete-estimator");
});

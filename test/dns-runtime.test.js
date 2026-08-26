"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createDnsRuntime, dnsKnowledgeOptions } = require("../lib/dns-runtime");
const { classifyTonDns } = require("../lib/dns-structural");
const { DNS_ESTIMATOR_VERSION } = require("../lib/dns-engine");

function runtimeWith(rows) {
  const pool = {
    query: async (sql) => {
      if (/FROM dns_valuations/.test(sql)) return { rows };
      return { rows: [], rowCount: 0 };
    },
  };
  return createDnsRuntime({ pool });
}

test("does not treat a generic public entity match as a DNS entity valuation route", () => {
  const publicMatch = classifyTonDns("conviction.ton", dnsKnowledgeOptions("conviction.ton", {
    entityMatch: true, entityMatchStrength: 1, entityTitle: "Conviction",
  }));
  const marketVerified = classifyTonDns("conviction.ton", dnsKnowledgeOptions("conviction.ton", {
    entityMatch: true, entityMatchStrength: 1, entityMarketVerified: true,
  }));
  assert.equal(publicMatch.primaryRoute, "invented-brandable");
  assert.equal(marketVerified.primaryRoute, "entity");
});

test("uses one batch query and includes medium estimates in portfolio value", async () => {
  let calls = 0;
  const pool = {
    query: async (sql) => {
      calls += 1;
      assert.match(sql, /ANY\(\$1::text\[\]\)/);
      return { rows: [{
        nft_address: "0:dns",
        domain_normalized: "alpha.ton",
        estimate_gram: "100",
        range_low_gram: "80",
        range_high_gram: "130",
        confidence_score: 0.7,
        confidence_band: "medium",
        valuation_status: "estimated",
        portfolio_eligible: true,
        evidence_count: 8,
        effective_comp_count: 6.2,
        own_sale_count: 1,
        current_listing_gram: "150",
        current_bid_gram: "90",
        estimator_version: DNS_ESTIMATOR_VERSION,
        calibration_version: "dns-calibration-v1",
        explanation_json: { route: "dictionary-compound" },
        valued_at: new Date(),
        stale_at: new Date(Date.now() + 60_000),
      }] };
    },
  };
  const runtime = createDnsRuntime({ pool, portfolioEstimatesEnabled: true });
  const [asset] = await runtime.valueAssets([{ tokenAddress: "0:dns", valuationKind: "unavailable" }], 2);
  assert.equal(calls, 1);
  assert.equal(asset.valuationKind, "dns-estimate");
  assert.equal(asset.floorTon, 100);
  assert.equal(asset.floorUsd, 200);
  assert.equal(asset.currentListingGram, 150);
});

test("release gate excludes an otherwise eligible estimate from portfolio totals", async () => {
  const runtime = createDnsRuntime({
    pool: {
      query: async () => ({ rows: [{
        nft_address: "0:shadow",
        domain_normalized: "shadow.ton",
        estimate_gram: "30",
        range_low_gram: "20",
        range_high_gram: "40",
        confidence_band: "high",
        valuation_status: "estimated",
        portfolio_eligible: true,
      }] }),
    },
    portfolioEstimatesEnabled: false,
  });
  const [asset] = await runtime.valueAssets([{ tokenAddress: "0:shadow" }], 2);
  assert.equal(asset.estimatedGram, 30);
  assert.equal(asset.floorTon, 0);
  assert.equal(asset.portfolioEligible, false);
});

test("includes a fresh low-confidence estimate in portfolio totals", async () => {
  const runtime = runtimeWith([{
    nft_address: "0:low",
    domain_normalized: "uncertain.ton",
    estimate_gram: "20",
    range_low_gram: "5",
    range_high_gram: "90",
    confidence_score: 0.3,
    confidence_band: "low",
    valuation_status: "estimated",
    portfolio_eligible: false,
    evidence_count: 2,
    effective_comp_count: 1.2,
    own_sale_count: 0,
    estimator_version: DNS_ESTIMATOR_VERSION,
    calibration_version: "dns-calibration-v1",
    explanation_json: {},
    valued_at: new Date(),
    stale_at: new Date(Date.now() + 60_000),
  }]);
  const [asset] = await runtime.valueAssets([{ tokenAddress: "0:low", valuationKind: "unavailable" }], 2);
  assert.equal(asset.estimatedGram, 20);
  assert.equal(asset.floorTon, 20);
  assert.equal(asset.floorUsd, 40);
  assert.equal(asset.floorStatus, "priced");
  assert.equal(asset.portfolioEligible, true);
});

test("keeps an active listing as a market signal, not a portfolio valuation", async () => {
  const runtime = runtimeWith([{
    nft_address: "0:list",
    domain_normalized: "listed.ton",
    estimate_gram: null,
    confidence_band: "low",
    valuation_status: "unavailable",
    portfolio_eligible: false,
    evidence_count: 0,
    effective_comp_count: 0,
    own_sale_count: 0,
    estimator_version: "dns-market-v2",
    calibration_version: "dns-calibration-v1",
    explanation_json: {},
    valued_at: new Date(),
    stale_at: new Date(Date.now() + 60_000),
  }]);
  const [asset] = await runtime.valueAssets([{
    tokenAddress: "0:list",
    floorTon: 12,
    floorUsd: 24,
    floorStatus: "priced",
    valuationKind: "active-listing",
  }], 2);
  assert.equal(asset.valuationKind, "unavailable");
  assert.equal(asset.floorTon, 0);
  assert.equal(asset.floorUsd, 0);
  assert.equal(asset.currentListingGram, 12);
});

test("does not leak an imported listing into portfolio value when lookup is unavailable", async () => {
  const runtime = createDnsRuntime({
    pool: { query: async () => { throw new Error("connection timeout"); } },
    portfolioEstimatesEnabled: true,
  });
  const [asset] = await runtime.valueAssets([{
    tokenAddress: "0:timeout",
    floorTon: 99,
    floorUsd: 198,
    floorStatus: "priced",
    valuationKind: "active-listing",
  }], 2);
  assert.equal(asset.floorTon, 0);
  assert.equal(asset.floorUsd, 0);
  assert.equal(asset.valuationKind, "processing");
  assert.equal(asset.currentListingGram, 99);
});

function baselineRow(overrides = {}) {
  return {
    estimator_version: "dns-market-v2",
    scope: "global",
    primary_route: "*",
    length_bucket: "*",
    script: "*",
    scarcity_class: "*",
    midpoint_gram: "110",
    range_low_gram: "90",
    range_high_gram: "130",
    evidence_count: 30,
    effective_comp_count: 30,
    acquisition_count: 10,
    resale_count: 20,
    evidence_max_time: new Date(),
    provenance_json: { verifiedSalesOnly: true },
    generated_at: new Date(),
    stale_at: new Date(Date.now() + 60_000),
    ...overrides,
  };
}

test("hydrates a first-import DNS from one compact baseline snapshot query", async () => {
  let calls = 0;
  const pool = {
    query: async (sql) => {
      calls += 1;
      if (/FROM dns_valuations/.test(sql)) return { rows: [] };
      assert.match(sql, /FROM dns_archetype_baselines/);
      return { rows: [baselineRow({
        scope: "route-length",
        primary_route: "numeric",
        length_bucket: "4-5",
      })] };
    },
  };
  const runtime = createDnsRuntime({ pool, portfolioEstimatesEnabled: true });
  const [asset] = await runtime.valueAssets([{ tokenAddress: "0:fresh", name: "1662.ton" }], 2);

  assert.equal(calls, 2);
  assert.equal(asset.estimatedGram, 110);
  assert.notEqual(asset.valuationKind, "processing");
  assert.equal(asset.currentListingGram, 0);
});

test("includes broad first-import market evidence in portfolio totals", async () => {
  const pool = {
    query: async (sql) => {
      if (/FROM dns_valuations/.test(sql)) return { rows: [] };
      return { rows: [baselineRow({ midpoint_gram: "90" })] };
    },
  };
  const runtime = createDnsRuntime({ pool, portfolioEstimatesEnabled: true });
  const [asset] = await runtime.valueAssets([{ tokenAddress: "0:fresh", name: "1662.ton" }], 2);

  assert.equal(asset.dnsValuationStatus, "indicative");
  assert.equal(asset.valuationKind, "dns-estimate");
  assert.equal(asset.floorTon, 90);
  assert.equal(asset.floorUsd, 180);
  assert.equal(asset.estimatedGram, 90);
  assert.equal(asset.portfolioEligible, true);
});

test("an unavailable stored row does not block instant verified-sale hydration", async () => {
  const pool = {
    query: async (sql) => {
      if (/FROM dns_valuations/.test(sql)) return { rows: [{
        nft_address: "0:fresh",
        domain_normalized: "1662.ton",
        estimate_gram: null,
        confidence_band: "low",
        valuation_status: "unavailable",
        portfolio_eligible: false,
        current_listing_gram: "150",
      }] };
      return { rows: [baselineRow()] };
    },
  };
  const runtime = createDnsRuntime({ pool, portfolioEstimatesEnabled: true });
  const [asset] = await runtime.valueAssets([{ tokenAddress: "0:fresh", name: "1662.ton" }], 2);

  assert.ok(asset.estimatedGram > 0);
  assert.notEqual(asset.dnsValuationStatus, "unavailable");
  assert.equal(asset.currentListingGram, 150);
});

test("values 100 fresh DNS assets with only valuation and snapshot queries", async () => {
  let calls = 0;
  const runtime = createDnsRuntime({
    pool: {
      query: async (sql) => {
        calls += 1;
        if (/FROM dns_valuations/.test(sql)) return { rows: [] };
        return { rows: [baselineRow()] };
      },
    },
  });
  const assets = Array.from({ length: 100 }, (_, index) => ({
    tokenAddress: `0:fresh${index}`,
    name: `fresh${index}.ton`,
  }));
  const valued = await runtime.valueAssets(assets, 2);
  assert.equal(calls, 2);
  assert.equal(valued.length, 100);
  assert.ok(valued.every((asset) => asset.dnsValuationStatus === "indicative"));
});

test("hydrates a first-import DNS from compact D1 without PostgreSQL", async () => {
  const runtime = createDnsRuntime({
    valuationReadModelUrl: "https://registry.example",
    portfolioEstimatesEnabled: true,
    fetch: async (url) => new Response(JSON.stringify(url.endsWith("/valuations/read")
      ? { configured: true, records: [] }
      : { configured: true, records: [{
        scope: "global", primary_route: "*", length_bucket: "*", script: "*", scarcity_class: "*",
        midpoint_usd: 100, range_low_usd: 70, range_high_usd: 140, evidence_count: 80,
        effective_comp_count: 80, provenance_json: JSON.stringify({ verifiedSalesOnly: true }),
      }] }), { status: 200, headers: { "content-type": "application/json" } }),
  });
  const [asset] = await runtime.valueAssets([{ tokenAddress: "0:d1", name: "fresh.ton" }], 2);
  assert.equal(asset.estimatedGram, 50);
  assert.equal(asset.dnsValuationStatus, "indicative");
});

test("scores and caches a fresh DNS from completed D1 sales in historical USD", async () => {
  const now = Date.now();
  let written = null;
  const runtime = createDnsRuntime({
    valuationReadModelUrl: "https://registry.example",
    valuationReadModelSecret: "secret",
    portfolioEstimatesEnabled: true,
    fetch: async (url, init = {}) => {
      if (url.endsWith("/valuations/read")) return new Response(JSON.stringify({ records: [] }), { status: 200 });
      if (url.endsWith("/identity/dns-evidence/read")) return new Response(JSON.stringify({ records: Array.from({ length: 12 }, (_, index) => ({
        sale_id: `dns-sale-${index}`,
        asset_key: `0:${String(index + 1).padStart(64, "0")}`,
        normalized_name: `${1700 + index}.ton`,
        sold_at: Math.floor((now - index * 86_400_000) / 1000),
        price_gram: 40 + index,
        historical_usd_rate: 2,
        price_usd: 80 + index * 2,
        reliability_score: 1,
        quality_flags_json: "[]",
      })) }), { status: 200 });
      if (url.endsWith("/ingest/valuations")) {
        written = JSON.parse(init.body).records[0];
        return new Response(JSON.stringify({ written: 1 }), { status: 200 });
      }
      if (url.endsWith("/identity/baselines/read")) return new Response(JSON.stringify({ records: [] }), { status: 200 });
      return new Response("not found", { status: 404 });
    },
  });
  const nftAddress = `0:${"a".repeat(64)}`;
  const [asset] = await runtime.valueAssets([{ tokenAddress: nftAddress, name: "1662.ton" }], 2);
  assert.ok(asset.floorUsd > 0);
  assert.equal(asset.portfolioEligible, true);
  assert.equal(asset.estimatorVersion, DNS_ESTIMATOR_VERSION);
  assert.equal(written.estimatorVersion, DNS_ESTIMATOR_VERSION);
  assert.equal(written.explanation.historicalUsd, true);
});

test("reclassifies a first-import DNS from stored knowledge before selecting comparables", async () => {
  const now = Date.now();
  const evidenceRequests = [];
  let written = null;
  const runtime = createDnsRuntime({
    valuationReadModelUrl: "https://registry.example",
    valuationReadModelSecret: "secret",
    portfolioEstimatesEnabled: true,
    fetch: async (url, init = {}) => {
      if (url.endsWith("/valuations/read")) return new Response(JSON.stringify({ records: [] }), { status: 200 });
      if (url.endsWith("/identity/dns-evidence/read")) {
        const request = JSON.parse(init.body);
        evidenceRequests.push(request);
        if (evidenceRequests.length === 1) return new Response(JSON.stringify({
          records: [],
          knowledge: [{ normalized_name: "conviction.ton", semantic_json: JSON.stringify({
            schemaVersion: "dns-knowledge-v1", dictionaryMatch: true, relatedTerms: ["belief"],
          }) }],
        }), { status: 200 });
        return new Response(JSON.stringify({ records: Array.from({ length: 6 }, (_, index) => ({
          sale_id: `belief-${index}`, asset_key: "0:belief", normalized_name: "belief.ton",
          sold_at: Math.floor((now - index * 86_400_000) / 1000), price_usd: 120 + index * 5,
          reliability_score: 1, quality_flags_json: "[]",
          semantic_json: JSON.stringify({ schemaVersion: "dns-knowledge-v1", dictionaryMatch: true, relatedTerms: ["conviction"] }),
        })) }), { status: 200 });
      }
      if (url.endsWith("/ingest/valuations")) {
        written = JSON.parse(init.body).records[0];
        return new Response(JSON.stringify({ written: 1 }), { status: 200 });
      }
      if (url.endsWith("/identity/baselines/read")) return new Response(JSON.stringify({ records: [] }), { status: 200 });
      return new Response("not found", { status: 404 });
    },
  });

  const [asset] = await runtime.valueAssets([{ tokenAddress: "0:conviction", name: "conviction.ton" }], 2);
  assert.equal(evidenceRequests.length, 2);
  assert.equal(evidenceRequests[0].targets[0].primaryRoute, "invented-brandable");
  assert.equal(evidenceRequests[1].targets[0].primaryRoute, "dictionary-compound");
  assert.ok(asset.estimatedUsd > 0);
  assert.equal(written.explanation.route, "dictionary-compound");
  assert.deepEqual(written.explanation.comparableNames, ["belief.ton", "belief.ton", "belief.ton", "belief.ton", "belief.ton", "belief.ton"]);
});

test("reads DNS detail and status from compact D1 without PostgreSQL", async () => {
  const runtime = createDnsRuntime({
    valuationReadModelUrl: "https://registry.example",
    portfolioEstimatesEnabled: true,
    fetch: async (url) => new Response(JSON.stringify(url.endsWith("/valuations/read")
      ? { configured: true, records: [{ assetKey: "0:dns", displayName: "alpha.ton", estimateUsd: 120 }] }
      : { configured: true, records: [{ scope: "global", midpoint_usd: 90, range_low_usd: 60, range_high_usd: 130, evidence_count: 45 }] }), { status: 200, headers: { "content-type": "application/json" } }),
  });
  assert.equal((await runtime.getValuationByDomain("alpha.ton")).estimateUsd, 120);
  assert.equal((await runtime.status()).source, "compact-d1");
});

test("remaps a prepared DNS name valuation onto a different wallet NFT address", async () => {
  const runtime = createDnsRuntime({
    valuationReadModelUrl: "https://registry.example",
    portfolioEstimatesEnabled: true,
    fetch: async (url) => new Response(JSON.stringify(url.endsWith("/valuations/read")
      ? { records: [{ assetKey: "0:catalog", displayName: "alpha.ton", estimateUsd: 120, confidenceBand: "high", portfolioEligible: true, valuationStatus: "estimated", estimatorVersion: DNS_ESTIMATOR_VERSION, staleAt: new Date(Date.now() + 60_000).toISOString() }] }
      : { records: [] }), { status: 200, headers: { "content-type": "application/json" } }),
  });
  const [asset] = await runtime.valueAssets([{ tokenAddress: "0:wallet", domain: "alpha.ton" }], 3);
  assert.equal(asset.floorUsd, 120);
  assert.equal(asset.valuationKind, "dns-estimate");
});

test("fails closed for stale or obsolete DNS valuation rows", async () => {
  for (const valuation of [
    { estimatorVersion: DNS_ESTIMATOR_VERSION, staleAt: new Date(Date.now() - 60_000).toISOString() },
    { estimatorVersion: "dns-market-v1", staleAt: new Date(Date.now() + 60_000).toISOString() },
  ]) {
    const runtime = createDnsRuntime({
      valuationReadModelUrl: "https://registry.example",
      portfolioEstimatesEnabled: true,
      fetch: async (url) => new Response(JSON.stringify(url.endsWith("/valuations/read")
        ? { records: [{ assetKey: "0:catalog", displayName: "alpha.ton", estimateUsd: 120, confidenceBand: "high", portfolioEligible: true, valuationStatus: "estimated", ...valuation }] }
        : { records: [] }), { status: 200, headers: { "content-type": "application/json" } }),
    });
    const [asset] = await runtime.valueAssets([{ tokenAddress: "0:wallet", domain: "alpha.ton" }], 3);
    assert.equal(asset.floorUsd, 0);
    assert.equal(asset.portfolioEligible, false);
    assert.equal(asset.valuationStale, true);
  }
});

test("records a wallet DNS NFT alias in D1 even without PostgreSQL", async () => {
  const calls = [];
  const runtime = createDnsRuntime({
    valuationReadModelUrl: "https://registry.example",
    valuationReadModelSecret: "secret",
    fetch: async (url, init = {}) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ accepted: 1 }), { status: 200 });
    },
  });
  const result = await runtime.enqueueAssets([{ tokenAddress: "0:real-dns-item", name: "alpha.ton" }]);
  assert.equal(result.queued, 1);
  const assetRequest = calls.find((call) => call.url.endsWith("/ingest/identity-assets"));
  assert.equal(assetRequest.init.headers.authorization, "Bearer secret");
  assert.deepEqual(JSON.parse(assetRequest.init.body).records.map((row) => ({
    assetKind: row.assetKind, assetKey: row.assetKey, normalizedName: row.normalizedName,
    primaryRoute: row.primaryRoute, lengthBucket: row.lengthBucket, script: row.script, scarcityClass: row.scarcityClass,
  })), [{
    assetKind: "dns", assetKey: "0:real-dns-item", normalizedName: "alpha.ton",
    primaryRoute: "invented-brandable", lengthBucket: "4-5", script: "Latin", scarcityClass: "5L",
  }]);
  const request = calls.find((call) => call.url.endsWith("/ingest/identity-aliases"));
  assert.equal(request.init.headers.authorization, "Bearer secret");
  assert.deepEqual(JSON.parse(request.init.body).records, [{
    assetKind: "dns", aliasKey: "0:real-dns-item", normalizedName: "alpha.ton", source: "wallet-import",
  }]);
});

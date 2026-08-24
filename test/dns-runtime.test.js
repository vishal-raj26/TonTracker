"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createDnsRuntime } = require("../lib/dns-runtime");

function runtimeWith(rows) {
  const pool = {
    query: async (sql) => {
      if (/FROM dns_valuations/.test(sql)) return { rows };
      return { rows: [], rowCount: 0 };
    },
  };
  return createDnsRuntime({ pool });
}

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
        estimator_version: "dns-market-v2",
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

test("shows low estimates but excludes them from portfolio totals", async () => {
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
    estimator_version: "dns-market-v2",
    calibration_version: "dns-calibration-v1",
    explanation_json: {},
    valued_at: new Date(),
    stale_at: new Date(Date.now() + 60_000),
  }]);
  const [asset] = await runtime.valueAssets([{ tokenAddress: "0:low", valuationKind: "unavailable" }], 2);
  assert.equal(asset.estimatedGram, 20);
  assert.equal(asset.floorTon, 0);
  assert.equal(asset.floorUsd, 0);
  assert.equal(asset.floorStatus, "estimated-low");
  assert.equal(asset.portfolioEligible, false);
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

test("shows broad first-import evidence but never includes it in portfolio totals", async () => {
  const pool = {
    query: async (sql) => {
      if (/FROM dns_valuations/.test(sql)) return { rows: [] };
      return { rows: [baselineRow({ midpoint_gram: "90" })] };
    },
  };
  const runtime = createDnsRuntime({ pool, portfolioEstimatesEnabled: true });
  const [asset] = await runtime.valueAssets([{ tokenAddress: "0:fresh", name: "1662.ton" }], 2);

  assert.equal(asset.dnsValuationStatus, "indicative");
  assert.equal(asset.valuationKind, "dns-estimate-low");
  assert.equal(asset.floorTon, 0);
  assert.equal(asset.floorUsd, 0);
  assert.equal(asset.estimatedGram, 90);
  assert.equal(asset.portfolioEligible, false);
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
      ? { records: [{ assetKey: "0:catalog", displayName: "alpha.ton", estimateUsd: 120, confidenceBand: "high", portfolioEligible: true, valuationStatus: "estimated", estimatorVersion: "ton-dns-market-v1", staleAt: new Date(Date.now() + 60_000).toISOString() }] }
      : { records: [] }), { status: 200, headers: { "content-type": "application/json" } }),
  });
  const [asset] = await runtime.valueAssets([{ tokenAddress: "0:wallet", domain: "alpha.ton" }], 3);
  assert.equal(asset.floorUsd, 120);
  assert.equal(asset.valuationKind, "dns-estimate");
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
  const request = calls.find((call) => call.url.endsWith("/ingest/identity-aliases"));
  assert.equal(request.init.headers.authorization, "Bearer secret");
  assert.deepEqual(JSON.parse(request.init.body).records, [{
    assetKind: "dns", aliasKey: "0:real-dns-item", normalizedName: "alpha.ton", source: "wallet-import",
  }]);
});

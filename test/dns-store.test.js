const assert = require("node:assert/strict");
const fs = require("node:fs");
const test = require("node:test");

const {
  MIGRATION_PATH,
  createDnsStore,
  stableMarketEventId,
} = require("../lib/dns-store");

function recordingPool(responder = () => ({ rows: [], rowCount: 0 })) {
  const calls = [];
  return {
    calls,
    async query(text, values) {
      calls.push({ text, values });
      return responder(text, values, calls.length - 1);
    },
  };
}

test("migration defines the complete DNS persistence boundary", () => {
  const sql = fs.readFileSync(MIGRATION_PATH, "utf8");
  for (const table of [
    "dns_domains",
    "dns_market_events",
    "dns_exchange_rates",
    "dns_market_event_usd",
    "dns_current_market",
    "dns_structural_features",
    "dns_semantic_profiles",
    "dns_semantic_references",
    "dns_archetype_baselines",
    "dns_valuations",
    "dns_valuation_comparables",
    "dns_meaning_dictionary",
    "dns_jobs",
    "dns_job_checkpoints",
    "dns_source_watermarks",
    "dns_engine_versions",
  ]) {
    assert.match(sql, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}\\b`));
  }
  assert.match(sql, /dns_market_events is append-only/);
  assert.match(sql, /dns_jobs_active_dedupe_uidx/);
});

test("init submits the idempotent migration to the injected pool", async () => {
  const pool = recordingPool();
  const store = createDnsStore(pool);
  await store.init();
  assert.equal(pool.calls.length, 1);
  assert.match(pool.calls[0].text, /001-ton-dns-estimator-persistence/);
});

test("batch valuation lookup deduplicates addresses and maps the app-facing result", async () => {
  const pool = recordingPool((text) => ({
    rowCount: 1,
    rows: text.includes("FROM dns_valuations") ? [{
      nft_address: "nft-1",
      domain_normalized: "1662.ton",
      estimate_gram: "730.000000000",
      range_low_gram: "610.000000000",
      range_high_gram: "860.000000000",
      confidence_score: 0.72,
      confidence_band: "medium",
      valuation_status: "estimated",
      portfolio_eligible: true,
      evidence_count: 8,
      effective_comp_count: 5.5,
      own_sale_count: 0,
      current_listing_gram: null,
      current_bid_gram: null,
      market_regime_id: "regime-1",
      feature_version: "structure-v1",
      semantic_version: "semantic-v1",
      estimator_version: "dns-v1",
      calibration_version: "cal-v1",
      evidence_summary_json: { completedSales: 8 },
      explanation_json: { route: "numeric" },
      valued_at: new Date("2026-08-13T00:00:00Z"),
      stale_at: new Date("2026-08-14T00:00:00Z"),
    }] : [],
  }));
  const store = createDnsStore(pool);
  const rows = await store.getValuationsByNftAddresses(["nft-1", "nft-1", "nft-2"]);
  assert.deepEqual(pool.calls[0].values, [["nft-1", "nft-2"]]);
  assert.match(pool.calls[0].text, /ANY\(\$1::text\[\]\)/);
  assert.equal(rows[0].estimateGram, "730.000000000");
  assert.equal(rows[0].estimatorVersion, "dns-v1");
});

test("baseline reads are compact and exclude stale estimator snapshots", async () => {
  const pool = recordingPool(() => ({ rows: [{
    estimator_version: "dns-market-v2",
    scope: "global",
    primary_route: "*",
    length_bucket: "*",
    script: "*",
    scarcity_class: "*",
    midpoint_gram: "100",
    range_low_gram: "50",
    range_high_gram: "180",
    evidence_count: 20,
    effective_comp_count: 20,
  }] }));
  const rows = await createDnsStore(pool).getArchetypeBaselines("dns-market-v2");
  assert.match(pool.calls[0].text, /FROM dns_archetype_baselines/);
  assert.match(pool.calls[0].text, /stale_at > NOW\(\)/);
  assert.deepEqual(pool.calls[0].values, ["dns-market-v2"]);
  assert.equal(rows[0].verifiedSalesOnly, true);
  assert.equal(rows[0].midpointGram, "100");
});

test("baseline refresh aggregates trusted completed sales instead of active asks", async () => {
  const pool = recordingPool(() => ({ rows: [{ refreshed: 4 }] }));
  const result = await createDnsStore(pool).refreshArchetypeBaselines({
    estimatorVersion: "dns-market-v2",
    historyDays: 1825,
    staleHours: 24,
  });
  assert.equal(result.refreshed, 4);
  assert.match(pool.calls[0].text, /trusted_sales/);
  assert.match(pool.calls[0].text, /unknown_secondary_marketplace/);
  assert.match(pool.calls[0].text, /dns_archetype_baselines/);
  assert.deepEqual(pool.calls[0].values, ["dns-market-v2", 1825, 24]);
});

test("market event identity and insertion are deterministic and idempotent", async () => {
  const event = {
    source: "ton-etl",
    sourceEventId: "partition-1:42",
    nftAddress: "nft-1",
    domainNormalized: "1662.ton",
    eventType: "sale",
    eventTime: "2026-08-13T00:00:00Z",
    priceGram: "100",
    isFinalized: true,
  };
  assert.equal(stableMarketEventId(event), stableMarketEventId({ ...event }));

  const pool = recordingPool(() => ({ rows: [], rowCount: 0 }));
  const result = await createDnsStore(pool).insertMarketEvent(event);
  assert.equal(result.inserted, false);
  assert.equal(result.eventId, stableMarketEventId(event));
  assert.match(pool.calls[0].text, /ON CONFLICT DO NOTHING/);
  assert.equal(pool.calls[0].values[0], result.eventId);
});

test("job claims use bounded SKIP LOCKED leases", async () => {
  const pool = recordingPool(() => ({ rows: [{ id: 7, status: "running" }], rowCount: 1 }));
  const rows = await createDnsStore(pool).claimJobs({
    workerId: "feature-worker-1",
    jobTypes: ["structural", "structural"],
    limit: 500,
    leaseSeconds: 120,
  });
  assert.deepEqual(rows, [{ id: 7, status: "running" }]);
  assert.match(pool.calls[0].text, /FOR UPDATE SKIP LOCKED/);
  assert.match(pool.calls[0].text, /Job lease expired after maximum attempts/);
  assert.deepEqual(pool.calls[0].values, ["feature-worker-1", ["structural"], 100, 120]);
});

test("watermarks are source, stream, and partition scoped", async () => {
  const pool = recordingPool((text, values) => ({ rows: [{ source: values[0], stream: values[1], partition_key: values[2] }], rowCount: 1 }));
  const store = createDnsStore(pool);
  await store.setSourceWatermark({
    source: "ton-etl",
    stream: "nft-events",
    partitionKey: "2026-08",
    cursor: { row: 900 },
  });
  await store.getSourceWatermark("ton-etl", "nft-events", "2026-08");
  assert.match(pool.calls[0].text, /ON CONFLICT \(source, stream, partition_key\)/);
  assert.match(pool.calls[0].text, /EXCLUDED\.event_time >= dns_source_watermarks\.event_time/);
  assert.deepEqual(pool.calls[1].values, ["ton-etl", "nft-events", "2026-08"]);
});

test("stale valuation results cannot replace a newer comparable audit trail", async () => {
  const calls = [];
  const client = {
    async query(text, values) {
      calls.push({ text, values });
      if (text.includes("INSERT INTO dns_valuations")) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    },
    release() {},
  };
  const pool = {
    query: client.query,
    async connect() { return client; },
  };
  const store = createDnsStore(pool);
  const result = await store.upsertValuation({
    nftAddress: "nft-1",
    domainNormalized: "1662.ton",
    valuationStatus: "estimated",
    featureVersion: "structure-v1",
    estimatorVersion: "dns-v1",
    calibrationVersion: "cal-v1",
    valuedAt: "2026-08-12T00:00:00Z",
    staleAt: "2026-08-13T00:00:00Z",
  }, [{
    nftAddress: "nft-2",
    finalWeight: 1,
    priceGram: 100,
  }]);
  assert.equal(result, null);
  assert.equal(calls.some(({ text }) => text.includes("DELETE FROM dns_valuation_comparables")), false);
  assert.equal(calls.at(-1).text, "COMMIT");
});

test("repository mutations remain parameterized and cover the complete worker API", async () => {
  const calls = [];
  const client = {
    async query(text, values) {
      calls.push({ text, values });
      if (text.includes("INSERT INTO dns_valuations")) {
        return {
          rowCount: 1,
          rows: [{
            nft_address: "nft-1",
            domain_normalized: "1662.ton",
            valuation_status: "estimated",
            portfolio_eligible: true,
            evidence_count: 1,
            effective_comp_count: 1,
            own_sale_count: 0,
            feature_version: "structure-v1",
            estimator_version: "dns-v1",
            calibration_version: "cal-v1",
            evidence_summary_json: {},
            explanation_json: {},
          }],
        };
      }
      return { rowCount: 1, rows: [{ id: 1 }] };
    },
    release() {},
  };
  const pool = {
    query: client.query,
    async connect() { return client; },
  };
  const store = createDnsStore(pool);

  await store.upsertDomain({
    nftAddress: "nft-1",
    collectionAddress: "collection-1",
    domainRaw: "1662.ton",
    domainNormalized: "1662.ton",
    labelNormalized: "1662",
  });
  await store.upsertCurrentMarket({
    nftAddress: "nft-1",
    source: "tonapi",
    observedAt: "2026-08-13T00:00:00Z",
  });
  await store.upsertStructuralFeatures({
    nftAddress: "nft-1",
    primaryRoute: "numeric",
    characterLength: 4,
    byteLength: 4,
    classifierVersion: "structure-v1",
  });
  await store.upsertSemanticProfile({
    nftAddress: "nft-1",
    profileVersion: "semantic-v1",
    schemaVersion: "semantic-schema-v1",
  });
  await store.upsertSemanticReference({
    nftAddress: "nft-1",
    referenceType: "embedding",
    referenceKey: "label",
    externalStore: "pgvector",
    externalRecordId: "vector-1",
    modelName: "bge-m3",
    modelVersion: "v1",
  });
  await store.upsertMeaning({
    termNormalized: "wagmi",
    meaningKey: "crypto-slang",
    meaningJson: { expansion: "We're All Gonna Make It" },
    confidence: 0.9,
  });
  await store.upsertEngineVersion({
    engineName: "dns-estimator",
    engineVersion: "dns-v1",
    engineKind: "valuation",
  });
  await store.enqueueJob({ jobType: "structural", dedupeKey: "nft-1" });
  await store.completeJob(1, "worker-1", { ok: true });
  await store.failJob(2, "worker-1", new Error("retry me"), { retryDelaySeconds: 5 });
  await store.setCheckpoint({ workerName: "market", checkpointKey: "partition-1", cursor: { row: 2 } });
  await store.getCheckpoint("market", "partition-1");
  const valuation = await store.upsertValuation({
    nftAddress: "nft-1",
    domainNormalized: "1662.ton",
    valuationStatus: "estimated",
    portfolioEligible: true,
    featureVersion: "structure-v1",
    estimatorVersion: "dns-v1",
    calibrationVersion: "cal-v1",
    valuedAt: "2026-08-13T00:00:00Z",
    staleAt: "2026-08-14T00:00:00Z",
  }, [{
    nftAddress: "nft-2",
    marketEventId: "event-1",
    structuralSimilarity: 0.9,
    semanticSimilarity: 0.6,
    finalWeight: 0.8,
    priceGram: 100,
  }]);

  assert.equal(valuation.nftAddress, "nft-1");
  assert.ok(calls.every(({ values }) => values === undefined || Array.isArray(values)));
  assert.ok(calls.some(({ text }) => text.includes("INSERT INTO dns_structural_features")));
  assert.ok(calls.some(({ text }) => text.includes("INSERT INTO dns_semantic_profiles")));
  assert.ok(calls.some(({ text }) => text.includes("INSERT INTO dns_semantic_references")));
  assert.ok(calls.some(({ text }) => text.includes("INSERT INTO dns_valuation_comparables")));
  assert.ok(calls.some(({ text }) => text.includes("UPDATE dns_jobs") && text.includes("status = 'completed'")));
  assert.ok(calls.some(({ text }) => text.includes("UPDATE dns_jobs") && text.includes("'retry'")));
  assert.equal(calls.filter(({ text }) => text === "BEGIN").length, 1);
  assert.equal(calls.filter(({ text }) => text === "COMMIT").length, 1);
});

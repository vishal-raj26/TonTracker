"use strict";

const { createDnsStore } = require("./dns-store");
const { estimateTonDnsValue } = require("./dns-estimator");
const { classifyTonDns } = require("./dns-structural");
const {
  DNS_CALIBRATION_VERSION,
  DNS_ESTIMATOR_VERSION,
  DNS_FEATURE_VERSION,
  dnsBaselineKey,
  dnsLengthBucket,
} = require("./dns-engine");
const { canonicalTonAddress } = require("./ton-address");

const DEFAULT_CACHE_TTL_MS = 60 * 1000;
const DEFAULT_BASELINE_CACHE_TTL_MS = 5 * 60 * 1000;
const PORTFOLIO_CONFIDENCE_BANDS = new Set(["medium", "high"]);

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function uniqueAddresses(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .map(canonicalTonAddress)
    .filter(Boolean))];
}

function createDnsRuntime(options = {}) {
  // Production reads are D1-only. Keep PostgreSQL available solely for an
  // explicit local rollback/reconciliation session.
  const allowLegacyPostgres = options.allowLegacyPostgres ?? process.env.TONTRACK_ALLOW_LEGACY_POSTGRES === "1";
  const databaseUrl = String(options.databaseUrl || (allowLegacyPostgres
    ? process.env.DNS_DATABASE_URL || process.env.DATABASE_URL
    : "") || "").trim();
  const valuationReadModelUrl = String(options.valuationReadModelUrl || process.env.VALUATION_READ_MODEL_URL || "").replace(/\/+$/, "");
  const valuationReadModelSecret = String(options.valuationReadModelSecret || process.env.D1_INGEST_SECRET || process.env.INGEST_SECRET || "").trim();
  // Resolve fetch at call time so the Cloudflare edge bridge uses the native
  // Worker fetch instead of Node's compatibility shim captured at module load.
  const fetchImpl = options.fetch || ((...args) => {
    const registryFetch = globalThis.__tontrackRegistryFetch;
    return typeof registryFetch === "function" ? registryFetch(...args) : globalThis.fetch(...args);
  });
  const logger = options.logger || console;
  const readModelTimeoutMs = Math.max(500, finiteNumber(options.readModelTimeoutMs) || 3_000);
  const cacheTtlMs = Math.max(5_000, finiteNumber(options.cacheTtlMs) || DEFAULT_CACHE_TTL_MS);
  const autoMigrate = options.autoMigrate ?? !options.pool;
  const portfolioEstimatesEnabled = options.portfolioEstimatesEnabled
    ?? process.env.DNS_PORTFOLIO_ESTIMATES_ENABLED === "1";
  const valuationCache = new Map();
  const baselineCacheTtlMs = Math.max(30_000, finiteNumber(options.baselineCacheTtlMs) || DEFAULT_BASELINE_CACHE_TTL_MS);
  let baselineSnapshot = { expiresAt: 0, values: new Map() };
  let baselinePromise = null;
  let pool = options.pool || null;
  let store = pool ? createDnsStore(pool) : null;
  let unavailableLogged = false;
  let readyPromise = null;

  async function readProjectedValuations(addresses = [], names = []) {
    if (!valuationReadModelUrl || (!addresses.length && !names.length)) return new Map();
    try {
      const result = new Map();
      const batchCount = Math.max(Math.ceil(addresses.length / 500), Math.ceil(names.length / 500));
      for (let index = 0; index < batchCount; index += 1) {
        const response = await fetchImpl(`${valuationReadModelUrl}/valuations/read`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ assetKind: "dns", assetKeys: addresses.slice(index * 500, (index + 1) * 500), assetNames: names.slice(index * 500, (index + 1) * 500) }),
          signal: AbortSignal.timeout(readModelTimeoutMs),
        });
        if (!response.ok) throw new Error(`read-model ${response.status}`);
        const payload = await response.json();
        for (const row of payload.records || []) result.set(canonicalTonAddress(row.assetKey), row);
      }
      return result;
    } catch (error) {
      logger.warn?.(`[dns-estimator] D1 read model unavailable: ${error.message}`);
      return new Map();
    }
  }

  async function readProjectedBaselines() {
    if (!valuationReadModelUrl) return [];
    const response = await fetchImpl(`${valuationReadModelUrl}/identity/baselines/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assetKind: "dns", estimatorVersion: DNS_ESTIMATOR_VERSION }),
      signal: AbortSignal.timeout(readModelTimeoutMs),
    });
    if (!response.ok) throw new Error(`baseline read-model ${response.status} ${response.url}`);
    const payload = await response.json();
    return (payload.records || []).map((row) => ({
      scope: row.scope,
      primaryRoute: row.primary_route,
      lengthBucket: row.length_bucket,
      script: row.script,
      scarcityClass: row.scarcity_class,
      midpointUsd: finiteNumber(row.midpoint_usd),
      rangeLowUsd: finiteNumber(row.range_low_usd),
      rangeHighUsd: finiteNumber(row.range_high_usd),
      evidenceCount: finiteNumber(row.evidence_count),
      effectiveCompCount: finiteNumber(row.effective_comp_count),
      verifiedSalesOnly: JSON.parse(row.provenance_json || "{}").verifiedSalesOnly === true,
      provenance: "compact-d1-verified-sales-baseline",
    }));
  }

  function configured() {
    return Boolean(pool || databaseUrl || valuationReadModelUrl);
  }

  function getPool() {
    if (pool) return pool;
    if (!databaseUrl) return null;
    try {
      const { Pool } = require("pg");
      pool = new Pool({
        connectionString: databaseUrl,
        ssl: /localhost|127\.0\.0\.1/i.test(databaseUrl) ? false : { rejectUnauthorized: false },
        max: Math.max(1, Math.min(10, finiteNumber(process.env.DNS_DATABASE_POOL_MAX) || 4)),
        connectionTimeoutMillis: Math.max(500, finiteNumber(process.env.DNS_DATABASE_CONNECT_TIMEOUT_MS) || 5_000),
        idleTimeoutMillis: 30_000,
      });
      store = createDnsStore(pool);
      return pool;
    } catch (error) {
      if (!unavailableLogged) {
        logger.warn?.(`[dns-estimator] PostgreSQL unavailable: ${error.message}`);
        unavailableLogged = true;
      }
      return null;
    }
  }

  function getStore() {
    return store || (getPool() ? store : null);
  }

  async function ready() {
    const dnsStore = getStore();
    if (!dnsStore) return false;
    if (!autoMigrate) return true;
    if (!readyPromise) {
      readyPromise = dnsStore.init()
        .then(() => true)
        .catch((error) => {
          readyPromise = null;
          throw error;
        });
    }
    return readyPromise;
  }

  async function loadBaselineSnapshot(force = false) {
    if (!force && baselineSnapshot.expiresAt > Date.now()) return baselineSnapshot.values;
    if (!baselinePromise) {
      baselinePromise = (async () => {
        try {
          const projected = await readProjectedBaselines();
          if (projected.length) {
            const values = new Map(projected.map((row) => [
              dnsBaselineKey(row.scope, row.primaryRoute, row.lengthBucket, row.script, row.scarcityClass), row,
            ]));
            baselineSnapshot = { expiresAt: Date.now() + baselineCacheTtlMs, values };
            return values;
          }
        } catch (error) {
          logger.warn?.(`[dns-estimator] D1 baseline unavailable: ${error.message}`);
        }
        const dnsStore = getStore();
        if (!dnsStore) return new Map();
        await ready();
        const rows = await dnsStore.getArchetypeBaselines(DNS_ESTIMATOR_VERSION);
        const values = new Map(rows.map((row) => [
          dnsBaselineKey(row.scope, row.primaryRoute, row.lengthBucket, row.script, row.scarcityClass),
          row,
        ]));
        baselineSnapshot = { expiresAt: Date.now() + baselineCacheTtlMs, values };
        return values;
      })().finally(() => { baselinePromise = null; });
    }
    return baselinePromise;
  }

  function baselineFor(target, baselines) {
    const route = target.primaryRoute;
    const lengthBucket = dnsLengthBucket(target.characterLength);
    const script = target.primaryScript || "Common";
    const scarcityClass = target.scarcityClass || "standard";
    const keys = [
      dnsBaselineKey("archetype", route, lengthBucket, script, scarcityClass),
      dnsBaselineKey("route-length", route, lengthBucket),
      dnsBaselineKey("route", route),
      dnsBaselineKey("global"),
    ];
    for (const key of keys) {
      const baseline = baselines.get(key);
      if (baseline) return baseline;
    }
    return null;
  }

  function cachedValuation(address) {
    const entry = valuationCache.get(address);
    if (!entry || entry.expiresAt <= Date.now()) {
      if (entry) valuationCache.delete(address);
      return null;
    }
    return entry.value;
  }

  async function lookupValuations(addresses, names = []) {
    const keys = uniqueAddresses(addresses);
    if (!keys.length) return new Map();
    const result = new Map();
    let missing = [];
    for (const address of keys) {
      const cached = cachedValuation(address);
      if (cached) result.set(address, cached);
      else missing.push(address);
    }
    if (!missing.length) return result;
    const projected = await readProjectedValuations(missing, names);
    for (const [address, valuation] of projected) {
      if (!address || !valuation) continue;
      valuationCache.set(address, { value: valuation, expiresAt: Date.now() + cacheTtlMs });
      result.set(address, valuation);
    }
    missing = missing.filter((address) => !result.has(address));
    if (!missing.length) return result;
    const dnsStore = getStore();
    if (!dnsStore) return result;
    try {
      await ready();
      let rows;
      for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
          rows = await dnsStore.getValuationsByNftAddresses(missing);
          break;
        } catch (error) {
          if (attempt === 1) throw error;
          await delay(150);
        }
      }
      for (const row of rows) {
        const key = canonicalTonAddress(row.nftAddress);
        if (!key) continue;
        valuationCache.set(key, { value: row, expiresAt: Date.now() + cacheTtlMs });
        result.set(key, row);
      }
    } catch (error) {
      if (!unavailableLogged) {
        logger.warn?.(`[dns-estimator] valuation lookup unavailable: ${error.message}`);
        unavailableLogged = true;
      }
    }
    return result;
  }

  function mergeValuation(asset, valuation, gramUsdRate = 0) {
    const importedListingGram = asset.valuationKind === "active-listing"
      ? finiteNumber(asset.floorTon)
      : finiteNumber(asset.listingGram);
    if (!valuation) {
      return {
        ...asset,
        floorTon: 0,
        floorUsd: 0,
        floorStatus: configured() ? "processing" : "unavailable",
        valuationKind: configured() ? "processing" : "unavailable",
        dnsValuationStatus: configured() ? "processing" : "not-configured",
        currentListingGram: importedListingGram,
        currentListingUsd: importedListingGram * finiteNumber(gramUsdRate),
      };
    }
    const projectedEstimateUsd = finiteNumber(valuation.estimateUsd);
    const estimateGram = finiteNumber(valuation.estimateGram)
      || (projectedEstimateUsd > 0 && finiteNumber(gramUsdRate) > 0 ? projectedEstimateUsd / finiteNumber(gramUsdRate) : 0);
    const confidenceBand = String(valuation.confidenceBand || "low").toLowerCase();
    const eligible = portfolioEstimatesEnabled
      && Boolean(valuation.portfolioEligible)
      && PORTFOLIO_CONFIDENCE_BANDS.has(confidenceBand)
      && estimateGram > 0;
    const currentListingGram = importedListingGram || finiteNumber(valuation.currentListingGram);
    const hasEstimate = estimateGram > 0 && valuation.valuationStatus !== "unavailable";

    return {
      ...asset,
      floorTon: eligible ? estimateGram : 0,
      floorUsd: eligible ? estimateGram * finiteNumber(gramUsdRate) : 0,
      floorStatus: eligible ? "priced" : hasEstimate ? "estimated-low" : "unavailable",
      valuationKind: eligible ? "dns-estimate" : hasEstimate ? "dns-estimate-low" : "unavailable",
      dnsValuationStatus: String(valuation.valuationStatus || (hasEstimate ? "estimated" : "unavailable")),
      estimatedGram: hasEstimate ? estimateGram : 0,
      estimatedUsd: hasEstimate ? estimateGram * finiteNumber(gramUsdRate) : 0,
      rangeLowGram: finiteNumber(valuation.rangeLowGram)
        || (finiteNumber(valuation.rangeLowUsd) > 0 && finiteNumber(gramUsdRate) > 0 ? finiteNumber(valuation.rangeLowUsd) / finiteNumber(gramUsdRate) : 0),
      rangeHighGram: finiteNumber(valuation.rangeHighGram)
        || (finiteNumber(valuation.rangeHighUsd) > 0 && finiteNumber(gramUsdRate) > 0 ? finiteNumber(valuation.rangeHighUsd) / finiteNumber(gramUsdRate) : 0),
      rangeLowUsd: finiteNumber(valuation.rangeLowUsd) || finiteNumber(valuation.rangeLowGram) * finiteNumber(gramUsdRate),
      rangeHighUsd: finiteNumber(valuation.rangeHighUsd) || finiteNumber(valuation.rangeHighGram) * finiteNumber(gramUsdRate),
      confidenceScore: finiteNumber(valuation.confidenceScore),
      confidenceBand,
      portfolioEligible: eligible,
      evidenceCount: Math.max(0, Math.round(finiteNumber(valuation.evidenceCount))),
      effectiveCompCount: Math.max(0, finiteNumber(valuation.effectiveCompCount)),
      ownSaleCount: Math.max(0, Math.round(finiteNumber(valuation.ownSaleCount))),
      currentListingGram,
      currentListingUsd: currentListingGram * finiteNumber(gramUsdRate),
      currentBidGram: finiteNumber(valuation.currentBidGram),
      currentBidUsd: finiteNumber(valuation.currentBidGram) * finiteNumber(gramUsdRate),
      marketPlatform: String(valuation.marketPlatform || asset.marketPlatform || ""),
      estimatorVersion: String(valuation.estimatorVersion || ""),
      calibrationVersion: String(valuation.calibrationVersion || ""),
      valuedAt: valuation.valuedAt || null,
      staleAt: valuation.staleAt || null,
      valuationStale: valuation.staleAt ? Date.parse(valuation.staleAt) <= Date.now() : true,
      valuationExplanation: valuation.explanation || {},
    };
  }

  function domainOf(asset) {
    return String(asset?.domain || asset?.displayName || asset?.name || "").trim();
  }

  function instantValuationRow(address, target, estimate) {
    const confidenceBand = String(estimate.confidenceBand || estimate.confidence?.band || "low").toLowerCase();
    return {
      nftAddress: address,
      domainNormalized: target.normalizedDomain,
      estimateGram: estimate.estimateGram,
      rangeLowGram: estimate.rangeLowGram,
      rangeHighGram: estimate.rangeHighGram,
      confidenceScore: estimate.confidenceScore,
      confidenceBand,
      valuationStatus: estimate.status,
      portfolioEligible: estimate.status === "estimated" && PORTFOLIO_CONFIDENCE_BANDS.has(confidenceBand),
      evidenceCount: estimate.evidenceCount,
      effectiveCompCount: estimate.effectiveCompCount,
      ownSaleCount: estimate.ownSaleCount,
      currentListingGram: 0,
      currentBidGram: 0,
      marketPlatform: null,
      estimatorVersion: estimate.estimatorVersion,
      calibrationVersion: DNS_CALIBRATION_VERSION,
      explanation: {
        route: target.primaryRoute,
        provenance: estimate.provenance || "verified-completed-sales-baseline",
        instant: true,
      },
      valuedAt: new Date(),
      staleAt: new Date(Date.now() + cacheTtlMs),
    };
  }

  function needsInstantValuation(valuation) {
    if (!valuation) return true;
    if (String(valuation.estimatorVersion || "") !== DNS_ESTIMATOR_VERSION) return true;
    if (!(finiteNumber(valuation.estimateGram) > 0)) return true;
    const status = String(valuation.valuationStatus || "").toLowerCase();
    if (status === "unavailable" || status === "processing") return true;
    const staleAt = Date.parse(valuation.staleAt || "");
    return Number.isFinite(staleAt) && staleAt <= Date.now();
  }

  async function lookupInstantValuations(entries, gramUsdRate = 0) {
    if (!configured() || !entries.length) return new Map();
    const classified = entries.map((entry) => {
      try {
        return { ...entry, target: classifyTonDns(domainOf(entry.asset)) };
      } catch {
        return { ...entry, target: null };
      }
    }).filter((entry) => entry.address && entry.target);
    if (!classified.length) return new Map();

    let baselines;
    try {
      baselines = await loadBaselineSnapshot();
    } catch (error) {
      logger.warn?.(`[dns-estimator] baseline snapshot unavailable: ${error.message}`);
      return new Map();
    }

    const result = new Map();
    for (const entry of classified) {
      const importedListingGram = entry.asset.valuationKind === "active-listing"
        ? finiteNumber(entry.asset.floorTon)
        : finiteNumber(entry.asset.listingGram);
      const baseline = baselineFor(entry.target, baselines);
      const normalizedBaseline = baseline?.midpointUsd > 0 && finiteNumber(gramUsdRate) > 0
        ? {
          ...baseline,
          midpointGram: baseline.midpointUsd / finiteNumber(gramUsdRate),
          rangeLowGram: baseline.rangeLowUsd / finiteNumber(gramUsdRate),
          rangeHighGram: baseline.rangeHighUsd / finiteNumber(gramUsdRate),
        }
        : baseline;
      const estimate = estimateTonDnsValue(entry.target, [], {
        asks: importedListingGram > 0
          ? [{ priceGram: importedListingGram, verified: true, active: true }]
          : [],
      }, {
        marketBaseline: normalizedBaseline,
      });
      if (!(finiteNumber(estimate.estimateGram) > 0)) continue;
      const row = instantValuationRow(entry.address, entry.target, estimate);
      valuationCache.set(entry.address, { value: row, expiresAt: Date.now() + cacheTtlMs });
      result.set(entry.address, row);
    }
    return result;
  }

  async function valueAssets(assets, gramUsdRate = 0, addressOf = (asset) => asset.tokenAddress || asset.address) {
    const rows = Array.isArray(assets) ? assets : [];
    const keyed = rows.map((asset) => ({ asset, address: canonicalTonAddress(addressOf(asset)) }));
    const valuations = await lookupValuations(
      keyed.map((entry) => entry.address),
      keyed.map((entry) => domainOf(entry.asset)).filter(Boolean)
    );
    const projectedByName = new Map([...valuations.values()].map((valuation) => [
      String(valuation.displayName || "").trim().toLocaleLowerCase("und").replace(/\.+$/u, ""),
      valuation,
    ]).filter(([name]) => name));
    for (const entry of keyed) {
      if (valuations.has(entry.address)) continue;
      const name = domainOf(entry.asset).toLocaleLowerCase("und").replace(/\.+$/u, "");
      const projected = projectedByName.get(name.endsWith(".ton") ? name : `${name}.ton`);
      if (projected) valuations.set(entry.address, projected);
    }
    const missing = keyed.filter((entry) => entry.address && needsInstantValuation(valuations.get(entry.address)));
    if (missing.length) {
      const instant = await lookupInstantValuations(missing, gramUsdRate);
      for (const [address, valuation] of instant) {
        const previous = valuations.get(address);
        valuations.set(address, {
          ...previous,
          ...valuation,
          currentListingGram: finiteNumber(previous?.currentListingGram) || valuation.currentListingGram,
          currentBidGram: finiteNumber(previous?.currentBidGram) || valuation.currentBidGram,
          marketPlatform: String(previous?.marketPlatform || valuation.marketPlatform || ""),
        });
      }
    }
    return keyed.map(({ asset, address }) => mergeValuation(asset, valuations.get(address), gramUsdRate));
  }

  function enqueueAssets(assets, options = {}) {
    const rows = Array.isArray(assets) ? assets : [];
    const addressOf = options.addressOf || ((asset) => asset.tokenAddress || asset.address);
    const domainOf = options.domainOf || ((asset) => asset.domain || asset.displayName || asset.name);
    const collectionAddress = String(options.collectionAddress || "0:b774d95eb20543f186c06b371ab88ad704f7e256130caf96189368a7d0cb6ccf");
    return Promise.resolve().then(async () => {
      const prepared = rows.map((asset) => {
        const nftAddress = canonicalTonAddress(addressOf(asset));
        const domainRaw = String(domainOf(asset) || "").trim();
        const normalized = domainRaw.toLocaleLowerCase("und").replace(/\.+$/u, "");
        const domainNormalized = normalized.endsWith(".ton") ? normalized : `${normalized}.ton`;
        return { asset, nftAddress, domainRaw, domainNormalized };
      }).filter((entry) => entry.nftAddress && entry.domainRaw && entry.domainNormalized !== ".ton");
      let queued = 0;
      if (valuationReadModelUrl && valuationReadModelSecret && prepared.length) {
        const records = prepared.map(({ nftAddress, domainNormalized }) => ({
          assetKind: "dns", aliasKey: nftAddress, normalizedName: domainNormalized,
          source: "wallet-import",
        }));
        const response = await fetchImpl(`${valuationReadModelUrl}/ingest/identity-aliases`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${valuationReadModelSecret}` },
          body: JSON.stringify({ records }), signal: AbortSignal.timeout(readModelTimeoutMs),
        });
        if (!response.ok) throw new Error(`dns identity aliases ${response.status}`);
        queued += Number((await response.json()).accepted || records.length);
      }
      const dnsStore = getStore();
      if (!dnsStore) return { queued, configured: Boolean(valuationReadModelUrl) };
      await new Promise((resolve) => {
        setImmediate(async () => {
        try {
          await ready();
        } catch (error) {
          logger.warn?.(`[dns-estimator] schema initialization failed: ${error.message}`);
          resolve({ queued, configured: true, error: error.message });
          return;
        }
        for (const { asset, nftAddress, domainRaw, domainNormalized } of prepared) {
          const labelNormalized = domainNormalized.slice(0, -4);
          try {
            await dnsStore.upsertDomain({
              nftAddress,
              collectionAddress,
              domainRaw,
              domainNormalized,
              labelNormalized,
              ownerAddress: asset.owner || null,
              nftIndex: asset.mintIndex ?? null,
              lifecycleStatus: "active",
              metadata: { source: "wallet-import" },
              source: "tonapi-wallet",
            });
            await dnsStore.enqueueJob({
              jobType: "dns-feature",
              dedupeKey: `${nftAddress}:${DNS_FEATURE_VERSION}`,
              priority: 100,
              payload: { nftAddress, domain: domainNormalized },
            });
            await dnsStore.enqueueJob({
              jobType: "dns-valuation",
              dedupeKey: `${nftAddress}:${DNS_ESTIMATOR_VERSION}`,
              priority: asset.valuationStale || !asset.estimatedGram ? 100 : 20,
              payload: { nftAddress, domain: domainNormalized },
            });
            queued += 1;
          } catch (error) {
            logger.warn?.(`[dns-estimator] background queue failed for ${domainNormalized}: ${error.message}`);
          }
        }
        resolve({ queued, configured: true });
      });
      });
    }).catch((error) => {
      logger.warn?.(`[dns-estimator] queue failed: ${error.message}`);
      return { queued: 0, configured: Boolean(valuationReadModelUrl), error: error.message };
    });
  }

  async function status() {
    const db = getPool();
    if (!db) {
      if (!valuationReadModelUrl) return { configured: false, ready: false };
      try {
        const baselines = await loadBaselineSnapshot();
        return {
          configured: true,
          ready: true,
          source: "compact-d1",
          portfolioEstimatesEnabled,
          archetype_baselines: baselines.size,
        };
      } catch (error) {
        return { configured: true, ready: false, source: "compact-d1", error: error.message };
      }
    }
    try {
      await ready();
      const result = await db.query(`
        SELECT
          (SELECT COUNT(*)::int FROM dns_domains) AS domains,
          (SELECT COUNT(*)::int FROM dns_market_events) AS market_events,
          (SELECT COUNT(*)::int FROM dns_valuations WHERE estimate_gram > 0) AS valuations,
          (SELECT COUNT(*)::int FROM dns_structural_features) AS structural_features,
          (SELECT COUNT(*)::int FROM dns_semantic_profiles) AS semantic_profiles,
          (SELECT COUNT(*)::int FROM dns_market_event_usd) AS usd_attributions,
          (SELECT COUNT(*)::int FROM dns_exchange_rates) AS exchange_rate_points,
          (SELECT COUNT(*)::int FROM dns_archetype_baselines
            WHERE estimator_version = '${DNS_ESTIMATOR_VERSION}' AND stale_at > NOW()) AS archetype_baselines,
          (SELECT COUNT(*)::int FROM dns_market_events e
            WHERE e.is_finalized AND NOT e.is_cancelled AND e.price_gram > 0
              AND NOT EXISTS (SELECT 1 FROM dns_market_event_usd u WHERE u.event_id = e.event_id)) AS pending_usd_attributions,
          (SELECT COUNT(*)::int FROM dns_jobs WHERE status IN ('queued', 'retry', 'running')) AS pending_jobs,
          (SELECT COUNT(*)::int FROM dns_jobs WHERE status = 'failed') AS failed_jobs,
          (SELECT MIN(created_at) FROM dns_jobs WHERE status IN ('queued', 'retry', 'running')) AS oldest_pending_job,
          (SELECT MAX(updated_at) FROM dns_job_checkpoints WHERE checkpoint_key = 'heartbeat') AS latest_worker_heartbeat,
          (SELECT MAX(valued_at) FROM dns_valuations) AS latest_valuation
      `);
      return { configured: true, ready: true, portfolioEstimatesEnabled, ...result.rows[0] };
    } catch (error) {
      return { configured: true, ready: false, error: error.message };
    }
  }

  async function close() {
    if (pool && !options.pool) await pool.end();
  }

  return {
    close,
    configured,
    enqueueAssets,
    getPool,
    getStore,
    lookupValuations,
    mergeValuation,
    getValuationByDomain: async (domain) => {
      if (valuationReadModelUrl) {
        const projected = await readProjectedValuations([], [domain]);
        const valuation = projected.values().next().value;
        if (valuation) return valuation;
      }
      const dnsStore = getStore();
      if (!dnsStore) return null;
      await ready();
      return dnsStore.getValuationByDomain(domain);
    },
    ready,
    warm: async () => {
      await ready();
      await loadBaselineSnapshot(true);
      return true;
    },
    status,
    valueAssets,
  };
}

module.exports = {
  PORTFOLIO_CONFIDENCE_BANDS,
  canonicalTonAddress,
  createDnsRuntime,
};

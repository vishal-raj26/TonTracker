"use strict";

const { createUsernameStore } = require("./username-store");
const { USERNAME_ESTIMATOR_VERSION, USERNAME_CALIBRATION_VERSION, USERNAME_FEATURE_VERSION, usernameBaselineKey, usernameLengthBucket } = require("./username-engine");
const { estimateTelegramUsernameValue } = require("./username-estimator");
const { classifyTelegramUsername } = require("./username-structural");
const { createUsernameFirstImportEvidence } = require("./username-first-import-evidence");
const { resolveUsernameKnowledge, usableUsernameKnowledge } = require("./username-knowledge");
const { USERNAME_COLLECTION } = require("./username-collection");

const PORTFOLIO_BANDS = new Set(["low", "medium", "high"]);
const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const address = (value) => String(value || "").trim().toLowerCase();

function createUsernameRuntime(options = {}) {
  // The production request path is the compact D1 projection. PostgreSQL is
  // an explicit rollback tool, never an automatic first-import fallback.
  const allowLegacyPostgres = options.allowLegacyPostgres ?? process.env.TONTRACK_ALLOW_LEGACY_POSTGRES === "1";
  const databaseUrl = String(options.databaseUrl || (allowLegacyPostgres
    ? process.env.USERNAME_DATABASE_URL || process.env.DNS_DATABASE_URL || process.env.DATABASE_URL
    : "") || "").trim();
  const valuationReadModelUrl = String(options.valuationReadModelUrl || process.env.VALUATION_READ_MODEL_URL || "").replace(/\/+$/, "");
  const valuationReadModelSecret = String(options.valuationReadModelSecret || process.env.D1_INGEST_SECRET || process.env.INGEST_SECRET || "").trim();
  // Resolve fetch at call time so the Cloudflare edge bridge uses the native
  // Worker fetch instead of Node's compatibility shim captured at module load.
  const fetchImpl = options.fetch || ((...args) => {
    const registryFetch = globalThis.__tontrackRegistryFetch;
    return typeof registryFetch === "function" ? registryFetch(...args) : globalThis.fetch(...args);
  });
  const readModelTimeoutMs = Math.max(500, number(options.readModelTimeoutMs) || 3_000);
  const firstImportTimeoutMs = Math.max(3_000, number(options.firstImportTimeoutMs) || 12_000);
  const estimatesEnabled = options.portfolioEstimatesEnabled ?? process.env.USERNAME_PORTFOLIO_ESTIMATES_ENABLED !== "0";
  const logger = options.logger || console;
  let pool = options.pool || null;
  let store = pool ? createUsernameStore(pool) : null;
  let readyPromise = null;
  const cache = new Map();
  const firstImportAttempts = new Map();
  let firstImportEvidenceTask = null;
  const firstImportEvidenceLimit = Math.max(0, Math.min(24, number(options.firstImportEvidenceLimit) || number(process.env.USERNAME_FIRST_IMPORT_EVIDENCE_LIMIT) || 24));
  const firstImportEvidence = options.firstImportEvidence === false ? null : (options.firstImportEvidence || (valuationReadModelUrl && valuationReadModelSecret
    ? createUsernameFirstImportEvidence({
      logger, knowledgeResolver: resolveUsernameKnowledge,
      maxAssets: firstImportEvidenceLimit,
      deadlineMs: Math.max(10_000, Math.min(90_000, number(options.firstImportEvidenceDeadlineMs) || 85_000)),
      maxKnowledgeAssets: Math.max(0, Math.min(4, number(options.firstImportKnowledgeLimit) || 4)),
    }) : null));
  let baseline = { expiresAt: 0, values: new Map() };

  async function readProjectedValuations(addresses = [], names = []) {
    if (!valuationReadModelUrl || (!addresses.length && !names.length)) return new Map();
    try {
      const result = new Map();
      const batchCount = Math.max(Math.ceil(addresses.length / 50), Math.ceil(names.length / 50));
      for (let index = 0; index < batchCount; index += 1) {
        const response = await fetchImpl(`${valuationReadModelUrl}/valuations/read`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ assetKind: "username", assetKeys: addresses.slice(index * 50, (index + 1) * 50), assetNames: names.slice(index * 50, (index + 1) * 50) }),
          signal: AbortSignal.timeout(readModelTimeoutMs),
        });
        if (!response.ok) throw new Error(`read-model ${response.status}`);
        const payload = await response.json();
        for (const row of payload.records || []) result.set(address(row.assetKey), row);
      }
      return result;
    } catch (error) { logger.warn?.(`[username-estimator] D1 read model unavailable: ${error.message}`); return new Map(); }
  }

  async function readProjectedBaselines() {
    if (!valuationReadModelUrl) return [];
    const response = await fetchImpl(`${valuationReadModelUrl}/identity/baselines/read`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ assetKind: "username", estimatorVersion: USERNAME_ESTIMATOR_VERSION }),
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
      midpointUsd: number(row.midpoint_usd),
      rangeLowUsd: number(row.range_low_usd),
      rangeHighUsd: number(row.range_high_usd),
      evidenceCount: number(row.evidence_count),
      effectiveCompCount: number(row.effective_comp_count),
      generatedAt: row.generated_at || row.generatedAt || "",
      provenance: (() => { try { return typeof row.provenance_json === "string" ? JSON.parse(row.provenance_json) : row.provenance_json || {}; } catch { return {}; } })(),
    }));
  }

  async function scoreProjectedAssets(assets, baselineRevision = "") {
    if (!valuationReadModelUrl || !valuationReadModelSecret || !assets.length) return new Map();
    const targets = assets.slice(0, 50).flatMap((asset) => {
      try {
        const feature = classifyTelegramUsername(asset.username || asset.name || asset.displayName || "");
        return [{ asset, feature, request: {
          normalizedName: feature.normalizedUsername,
          primaryRoute: feature.primaryRoute,
          lengthBucket: usernameLengthBucket(feature.characterLength),
        } }];
      } catch { return []; }
    });
    if (!targets.length) return new Map();
    try {
      const response = await fetchImpl(`${valuationReadModelUrl}/identity/username-evidence/read`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${valuationReadModelSecret}` },
        body: JSON.stringify({ targets: targets.map((target) => target.request) }),
        signal: AbortSignal.timeout(firstImportTimeoutMs),
      });
      if (!response.ok) throw new Error(`username evidence ${response.status}`);
      const payload = await response.json();
      const knowledgeRows = [...(payload.records || []), ...(payload.knowledge || [])];
      const knowledgeByName = new Map(knowledgeRows.map((row) => {
        let knowledge = row.semantic_json || {};
        if (typeof knowledge === "string") { try { knowledge = JSON.parse(knowledge); } catch { knowledge = {}; } }
        knowledge = usableUsernameKnowledge(knowledge);
        return [String(row.normalized_name || "").toLowerCase(), knowledge];
      }).filter(([name]) => name));
      const events = (payload.records || []).flatMap((row) => {
        try {
          const classification = classifyTelegramUsername(row.normalized_name);
          classification.knowledge = knowledgeByName.get(classification.normalizedUsername) || {};
          return [{
            eventId: row.sale_id, nftAddress: row.asset_key, username: row.normalized_name,
            eventType: "sale", eventTime: new Date(Number(row.sold_at) * 1000).toISOString(),
            paymentAsset: "GRAM", priceUsd: number(row.price_usd),
            reliabilityScore: number(row.reliability_score) || 1, finalized: true,
            classification,
          }];
        } catch { return []; }
      });
      const baselineValues = await baselines();
      const learnedModel = baselineValues.get(usernameBaselineKey("global"))?.provenance?.learnedModel || null;
      const valuedAt = new Date();
      const staleAt = new Date(valuedAt.getTime() + 24 * 60 * 60 * 1000);
      const records = targets.flatMap(({ asset, feature }) => {
        const target = { ...feature, knowledge: knowledgeByName.get(feature.normalizedUsername) || {} };
        const estimate = estimateTelegramUsernameValue(target, events, { nowMs: valuedAt.getTime(), learnedModel });
        if (!(estimate.estimateUsd > 0)) return [];
        return [{
          assetKind: "username", assetKey: address(asset.tokenAddress || asset.address), displayName: feature.displayUsername,
          estimateUsd: estimate.estimateUsd, rangeLowUsd: estimate.rangeLowUsd, rangeHighUsd: estimate.rangeHighUsd,
          confidenceScore: estimate.confidenceScore, confidenceBand: estimate.confidenceBand, valuationStatus: estimate.status,
          portfolioEligible: estimatesEnabled && estimate.estimateUsd > 0 && PORTFOLIO_BANDS.has(estimate.confidenceBand),
          evidenceCount: estimate.evidenceCount, effectiveCompCount: estimate.effectiveCompCount, ownSaleCount: estimate.ownSaleCount,
          currentListingGram: asset.valuationKind === "active-listing" ? number(asset.floorTon) : number(asset.listingGram),
          currentBidGram: 0, marketPlatform: "Fragment", estimatorVersion: USERNAME_ESTIMATOR_VERSION,
          calibrationVersion: USERNAME_CALIBRATION_VERSION, valuedAt: valuedAt.toISOString(), staleAt: staleAt.toISOString(),
          explanation: {
            provenance: "first-import-learned-ensemble", historicalUsd: true, route: feature.primaryRoute,
            trend: estimate.trend, learnedModel: estimate.learnedModel?.modelVersion || null,
            baselineRevision,
            comparableNames: estimate.comparables.slice(0, 8).map((row) => row.username),
          },
        }];
      });
      if (records.length) {
        const write = await fetchImpl(`${valuationReadModelUrl}/ingest/valuations`, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${valuationReadModelSecret}` },
          body: JSON.stringify({ records }), signal: AbortSignal.timeout(firstImportTimeoutMs),
        });
        if (!write.ok) throw new Error(`username valuation cache ${write.status}`);
      }
      return new Map(records.map((record) => [address(record.assetKey), record]));
    } catch (error) {
      logger.warn?.(`[username-estimator] first-import scoring unavailable: ${error.message}`);
      return new Map();
    }
  }

  async function enrichFirstImportAssets(assets) {
    if (!firstImportEvidence || !assets.length) return 0;
    const now = Date.now();
    const pending = assets.filter((asset) => {
      const key = address(asset.tokenAddress || asset.address);
      const attemptedAt = firstImportAttempts.get(key) || 0;
      return key && now - attemptedAt >= 2 * 60 * 1000;
    });
    if (!pending.length) return 0;
    pending.forEach((asset) => firstImportAttempts.set(address(asset.tokenAddress || asset.address), now));
    try {
      const enriched = await firstImportEvidence.enrich(pending);
      const completed = new Set(enriched.inspected.map((entry) => String(entry.username || "").toLowerCase()));
      pending.forEach((asset) => {
        try {
          const username = classifyTelegramUsername(asset.username || asset.name || asset.displayName).normalizedUsername;
          if (!completed.has(username)) firstImportAttempts.delete(address(asset.tokenAddress || asset.address));
        } catch { firstImportAttempts.delete(address(asset.tokenAddress || asset.address)); }
      });
      if (enriched.assets.length) {
        const headers = { "content-type": "application/json", authorization: `Bearer ${valuationReadModelSecret}` };
        const write = async (path, records) => {
          if (!records.length) return;
          const response = await fetchImpl(`${valuationReadModelUrl}${path}`, {
            method: "POST", headers, body: JSON.stringify({ records }), signal: AbortSignal.timeout(firstImportTimeoutMs),
          });
          if (!response.ok) throw new Error(`${path} ${response.status}`);
        };
        await write("/ingest/identity-assets", enriched.assets);
        await write("/ingest/identity-aliases", enriched.aliases);
        await write("/ingest/identity-sales", enriched.sales);
      }
      return enriched.sales.length;
    } catch (error) {
      logger.warn?.(`[username-estimator] first-import evidence unavailable: ${error.message}`);
      return 0;
    }
  }

  function scheduleFirstImportEvidence(assets, baselineRevision = "") {
    if (!firstImportEvidence || firstImportEvidenceTask || !assets.length) return;
    const now = Date.now();
    const pending = assets.filter((asset) => {
      const key = address(asset.tokenAddress || asset.address);
      return key && now - (firstImportAttempts.get(key) || 0) >= 2 * 60 * 1000;
    }).slice(0, firstImportEvidenceLimit);
    if (!pending.length) return;
    firstImportEvidenceTask = Promise.resolve().then(async () => {
      await enrichFirstImportAssets(pending);
      // The immediate learned score is intentionally returned before this
      // network work. Re-score once the verified history/lexical evidence is
      // durable so the next read does not keep the provisional 24-hour value.
      const rescored = await scoreProjectedAssets(pending, baselineRevision);
      for (const [key, valuation] of rescored) cache.set(key, { value: valuation, expiresAt: Date.now() + 60_000 });
    }).catch((error) => {
      logger.warn?.(`[username-estimator] background first-import evidence unavailable: ${error.message}`);
    }).finally(() => { firstImportEvidenceTask = null; });
  }

  function needsProjectedScore(valuation, baselineRevision = "") {
    if (!valuation || valuation.estimatorVersion !== USERNAME_ESTIMATOR_VERSION) return true;
    const staleAt = Date.parse(valuation.staleAt || "");
    if (!Number.isFinite(staleAt) || staleAt <= Date.now()) return true;
    return Boolean(baselineRevision && valuation.explanation?.baselineRevision !== baselineRevision);
  }

  function configured() { return Boolean(pool || databaseUrl || valuationReadModelUrl); }
  function getStore() {
    if (store) return store;
    if (!databaseUrl) return null;
    const { Pool } = require("pg");
    pool = new Pool({ connectionString: databaseUrl, ssl: /localhost|127\.0\.0\.1/i.test(databaseUrl) ? false : { rejectUnauthorized: false }, max: 4 });
    store = createUsernameStore(pool);
    return store;
  }
  async function ready() {
    const usernameStore = getStore();
    if (!usernameStore) return false;
    if (!readyPromise) readyPromise = usernameStore.init().then(() => true).catch((error) => { readyPromise = null; throw error; });
    return readyPromise;
  }
  async function lookupValuations(addresses, names = []) {
    const keys = [...new Set((addresses || []).map(address).filter(Boolean))];
    const result = new Map();
    let missing = keys.filter((key) => {
      const cached = cache.get(key);
      if (cached?.expiresAt > Date.now()) { result.set(key, cached.value); return false; }
      return true;
    });
    if (!missing.length) return result;
    const projected = await readProjectedValuations(missing, names);
    for (const [key, valuation] of projected) {
      cache.set(key, { value: valuation, expiresAt: Date.now() + 60_000 });
      result.set(key, valuation);
    }
    missing = missing.filter((key) => !result.has(key));
    if (!missing.length || !getStore()) return result;
    try {
      await ready();
      for (const row of await getStore().getValuationsByNftAddresses(missing)) {
        const lookup = address(row.lookupAddress || row.nftAddress);
        cache.set(lookup, { value: row, expiresAt: Date.now() + 60_000 });
        result.set(lookup, row);
      }
    } catch (error) { logger.warn?.(`[username-estimator] lookup unavailable: ${error.message}`); }
    return result;
  }
  async function baselines() {
    if (baseline.expiresAt > Date.now()) return baseline.values;
    let rows = [];
    try { rows = await readProjectedBaselines(); }
    catch (error) { logger.warn?.(`[username-estimator] D1 baseline unavailable: ${error.message}`); }
    if (!rows.length && getStore()) {
      await ready();
      rows = await getStore().getArchetypeBaselines(USERNAME_ESTIMATOR_VERSION);
    }
    const values = new Map(rows.map((row) => [usernameBaselineKey(row.scope, row.primary_route || row.primaryRoute, row.length_bucket || row.lengthBucket, row.script, row.scarcity_class || row.scarcityClass), row]));
    baseline = { expiresAt: Date.now() + 300_000, values };
    return values;
  }
  function baselineFor(asset, values) {
    const target = classifyTelegramUsername(asset.username || asset.name || asset.displayName || "");
    const keys = [
      usernameBaselineKey("archetype", target.primaryRoute, usernameLengthBucket(target.characterLength), target.primaryScript, target.scarcityClass),
      usernameBaselineKey("route-length", target.primaryRoute, usernameLengthBucket(target.characterLength)),
      usernameBaselineKey("route", target.primaryRoute), usernameBaselineKey("global"),
    ];
    return keys.map((key) => values.get(key)).find(Boolean) || null;
  }
  function baselineRevision(values) {
    return String(values.get(usernameBaselineKey("global"))?.generatedAt || "");
  }
  function merge(asset, valuation) {
    const listedGram = asset.valuationKind === "active-listing" ? number(asset.floorTon) : number(asset.listingGram);
    if (!valuation) return { ...asset, floorTon: 0, floorUsd: 0, floorStatus: configured() ? "processing" : "unavailable", valuationKind: configured() ? "processing" : "unavailable", usernameValuationStatus: configured() ? "processing" : "not-configured", currentListingGram: listedGram };
    const estimateUsd = number(valuation.estimateUsd);
    const staleAt = Date.parse(valuation.staleAt || "");
    const stale = !Number.isFinite(staleAt) || staleAt <= Date.now();
    const currentEstimator = valuation.estimatorVersion === USERNAME_ESTIMATOR_VERSION;
    const eligible = estimatesEnabled && !stale && currentEstimator && PORTFOLIO_BANDS.has(String(valuation.confidenceBand || "").toLowerCase()) && estimateUsd > 0;
    const readyValue = eligible && valuation.valuationStatus !== "processing";
    return { ...asset,
      floorTon: 0, floorUsd: readyValue ? estimateUsd : 0, floorStatus: readyValue ? "priced" : configured() ? "processing" : "unavailable",
      valuationKind: readyValue ? "username-estimate" : configured() ? "processing" : "unavailable", usernameValuationStatus: readyValue ? "estimated" : "processing",
      estimatedUsd: estimateUsd, rangeLowUsd: number(valuation.rangeLowUsd), rangeHighUsd: number(valuation.rangeHighUsd), confidenceScore: number(valuation.confidenceScore), confidenceBand: valuation.confidenceBand,
      evidenceCount: number(valuation.evidenceCount), effectiveCompCount: number(valuation.effectiveCompCount), ownSaleCount: number(valuation.ownSaleCount), portfolioEligible: eligible,
      currentListingGram: listedGram || number(valuation.currentListingGram), currentBidGram: number(valuation.currentBidGram), estimatorVersion: valuation.estimatorVersion,
      valuedAt: valuation.valuedAt, staleAt: valuation.staleAt, valuationStale: stale, valuationExplanation: valuation.explanation || {},
    };
  }
  async function valueAssets(assets) {
    const rows = Array.isArray(assets) ? assets : [];
    const names = rows.map((asset) => {
      try { return classifyTelegramUsername(asset.username || asset.name || asset.displayName).normalizedUsername; }
      catch { return ""; }
    }).filter(Boolean);
    const keys = rows.map((asset) => asset.tokenAddress || asset.address);
    const valuations = await lookupValuations(keys, names);
    const projectedByName = new Map([...valuations.values()].map((row) => [String(row.displayName || "").replace(/^@/, "").toLowerCase(), row]));
    for (const asset of rows) {
      const key = address(asset.tokenAddress || asset.address);
      if (valuations.has(key)) continue;
      let username = "";
      try { username = classifyTelegramUsername(asset.username || asset.name || asset.displayName).normalizedUsername; } catch { /* ignore */ }
      const matching = projectedByName.get(username);
      if (matching) valuations.set(key, matching);
    }
    const missingRows = rows.filter((asset) => !valuations.has(address(asset.tokenAddress || asset.address)));
    if (missingRows.length && getStore()) {
      try {
        await ready();
        const names = missingRows.map((asset) => classifyTelegramUsername(asset.username || asset.name || asset.displayName).normalizedUsername);
        const byUsername = new Map((await getStore().getValuationsByUsernames(names)).map((row) => [row.lookupUsername || row.usernameNormalized, row]));
        for (const asset of missingRows) {
          const username = classifyTelegramUsername(asset.username || asset.name || asset.displayName).normalizedUsername;
          const valuation = byUsername.get(username);
          if (valuation) valuations.set(address(asset.tokenAddress || asset.address), valuation);
        }
      } catch (error) { logger.warn?.(`[username-estimator] username lookup unavailable: ${error.message}`); }
    }
    const baselineValues = await baselines();
    const currentBaselineRevision = baselineRevision(baselineValues);
    let scoreRows = rows.filter((asset) => needsProjectedScore(valuations.get(address(asset.tokenAddress || asset.address)), currentBaselineRevision));
    const firstImportRows = [...scoreRows];
    if (scoreRows.length) {
      const scored = await scoreProjectedAssets(scoreRows, currentBaselineRevision);
      for (const [key, valuation] of scored) {
        valuations.set(key, valuation);
        cache.set(key, { value: valuation, expiresAt: Date.now() + 60_000 });
      }
      scoreRows = rows.filter((asset) => needsProjectedScore(valuations.get(address(asset.tokenAddress || asset.address)), currentBaselineRevision));
    }
    if (scoreRows.length) {
      await enrichFirstImportAssets(scoreRows);
      const scoreAddresses = scoreRows.map((asset) => asset.tokenAddress || asset.address);
      const scoreNames = scoreRows.map((asset) => {
        try { return classifyTelegramUsername(asset.username || asset.name || asset.displayName).normalizedUsername; }
        catch { return ""; }
      }).filter(Boolean);
      const refreshed = await readProjectedValuations(scoreAddresses, scoreNames);
      for (const [key, valuation] of refreshed) {
        valuations.set(key, valuation);
        cache.set(key, { value: valuation, expiresAt: Date.now() + 60_000 });
      }
      scoreRows = rows.filter((asset) => needsProjectedScore(valuations.get(address(asset.tokenAddress || asset.address)), currentBaselineRevision));
      if (scoreRows.length) {
        const rescored = await scoreProjectedAssets(scoreRows, currentBaselineRevision);
        for (const [key, valuation] of rescored) {
          valuations.set(key, valuation);
          cache.set(key, { value: valuation, expiresAt: Date.now() + 60_000 });
        }
      }
    }
    // A learned estimate is enough to keep the first import responsive, but it
    // must not suppress wallet-specific evidence collection. This work runs
    // after the response path and refreshes the prepared valuation when done.
    scheduleFirstImportEvidence(firstImportRows, currentBaselineRevision);
    return rows.map((asset) => {
      const key = address(asset.tokenAddress || asset.address);
      return merge(asset, valuations.get(key));
    });
  }
  function enqueueAssets(assets) {
    return Promise.resolve().then(async () => {
      const prepared = [];
      for (const asset of assets || []) {
        const nftAddress = address(asset.tokenAddress || asset.address);
        let username; try { username = classifyTelegramUsername(asset.username || asset.name || asset.displayName).normalizedUsername; } catch { continue; }
        prepared.push({ asset, nftAddress, username });
      }
      let queued = 0;
      if (valuationReadModelUrl && valuationReadModelSecret && prepared.length) {
        const headers = { "content-type": "application/json", authorization: `Bearer ${valuationReadModelSecret}` };
        const assetRecords = prepared.map(({ nftAddress, username }) => {
          const feature = classifyTelegramUsername(username);
          return {
            assetKind: "username", assetKey: nftAddress, normalizedName: username, displayName: `@${username}`,
            primaryRoute: feature.primaryRoute, lengthBucket: usernameLengthBucket(feature.characterLength),
            script: feature.primaryScript, scarcityClass: feature.scarcityClass, feature,
            sourceUpdatedAt: new Date().toISOString(),
          };
        });
        const assetResponse = await fetchImpl(`${valuationReadModelUrl}/ingest/identity-assets`, {
          method: "POST", headers, body: JSON.stringify({ records: assetRecords }),
          signal: AbortSignal.timeout(readModelTimeoutMs),
        });
        if (!assetResponse.ok) throw new Error(`username identity assets ${assetResponse.status}`);
        const aliasRecords = prepared.map(({ nftAddress, username }) => ({
          assetKind: "username", aliasKey: nftAddress, normalizedName: username,
          source: "wallet-import",
        }));
        const response = await fetchImpl(`${valuationReadModelUrl}/ingest/identity-aliases`, {
          method: "POST",
          headers, body: JSON.stringify({ records: aliasRecords }), signal: AbortSignal.timeout(readModelTimeoutMs),
        });
        if (!response.ok) throw new Error(`username identity aliases ${response.status}`);
        queued += Number((await response.json()).accepted || aliasRecords.length);
      }
      if (!getStore()) return { queued, configured: Boolean(valuationReadModelUrl) };
      await ready();
      for (const { asset, nftAddress, username } of prepared) {
        const stored = await getStore().upsertAsset({ nftAddress, collectionAddress: USERNAME_COLLECTION, usernameNormalized: username, displayName: `@${username}`, ownerAddress: asset.owner, nftIndex: asset.mintIndex, metadata: { source: "wallet-import", observedNftAddress: nftAddress } });
        const canonical = address(stored?.nft_address || nftAddress);
        await getStore().upsertAlias(nftAddress, canonical, "wallet-import", { username });
        await getStore().enqueueJob({ jobType: "username-feature", dedupeKey: `${canonical}:${USERNAME_FEATURE_VERSION}`, priority: 100, payload: { nftAddress: canonical, username } });
        await getStore().enqueueJob({ jobType: "username-valuation", dedupeKey: `${canonical}:${USERNAME_ESTIMATOR_VERSION}`, priority: 90, payload: { nftAddress: canonical, username } });
        queued += 1;
      }
      return { queued, configured: true };
    }).catch((error) => { logger.warn?.(`[username-estimator] queue failed: ${error.message}`); return { queued: 0, configured: true, error: error.message }; });
  }
  async function status() {
    if (!pool && !getStore()) {
      if (!valuationReadModelUrl) return { configured: false, ready: false };
      try {
        const values = await baselines();
        return { configured: true, ready: true, source: "compact-d1", portfolioEstimatesEnabled: estimatesEnabled, archetype_baselines: values.size };
      } catch (error) {
        return { configured: true, ready: false, source: "compact-d1", error: error.message };
      }
    }
    try { await ready(); const result = await pool.query(`SELECT (SELECT COUNT(*)::int FROM username_assets) assets, (SELECT COUNT(*)::int FROM username_market_events) market_events, (SELECT COUNT(*)::int FROM username_valuations WHERE estimate_usd>0) valuations, (SELECT COUNT(*)::int FROM username_jobs WHERE status IN ('queued','retry','running')) pending_jobs`); return { configured: true, ready: true, portfolioEstimatesEnabled: estimatesEnabled, ...result.rows[0] }; } catch (error) { return { configured: true, ready: false, error: error.message }; }
  }
  async function projectedUsernameValuation(username) {
    if (!valuationReadModelUrl) return null;
    const projected = await readProjectedValuations([], [username]);
    const existing = projected.values().next().value || null;
    if (!needsProjectedScore(existing)) return existing;
    const assetKey = address(existing?.assetKey) || `username:${classifyTelegramUsername(username).normalizedUsername}`;
    const scored = await scoreProjectedAssets([{ tokenAddress: assetKey, username }]);
    return scored.get(assetKey) || existing;
  }
  return { configured, ready, valueAssets, enqueueAssets, lookupValuations,
    getValuationByUsername: async (username) => {
      const projected = await projectedUsernameValuation(username);
      if (projected) return projected;
      if (!getStore()) return null;
      await ready();
      return getStore().getValuationByUsername(username);
    },
    getValuationDetailByUsername: async (username) => {
      const projected = await projectedUsernameValuation(username);
      if (projected) return projected;
      if (!getStore()) return null;
      await ready();
      return getStore().getValuationDetailByUsername(username);
    },
    status, warm: async () => { if (getStore()) await ready(); await baselines(); return true; }, close: async () => { if (pool && !options.pool) await pool.end(); } };
}
module.exports = { USERNAME_COLLECTION, createUsernameRuntime };

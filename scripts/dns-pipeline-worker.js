"use strict";

const os = require("node:os");
const { Pool } = require("pg");
const { createDnsStore } = require("../lib/dns-store");
const { classifyTonDns } = require("../lib/dns-structural");
const { estimateTonDnsValue } = require("../lib/dns-estimator");
const {
  DNS_CALIBRATION_VERSION,
  DNS_ESTIMATOR_VERSION,
  DNS_FEATURE_VERSION,
} = require("../lib/dns-engine");

const databaseUrl = String(process.env.DNS_DATABASE_URL || process.env.DATABASE_URL || "").trim();
const workerId = String(process.env.DNS_WORKER_ID || `${os.hostname()}:${process.pid}`);
const batchSize = Math.max(1, Math.min(50, Number(process.env.DNS_WORKER_BATCH_SIZE || 10)));
const pollMs = Math.max(500, Number(process.env.DNS_WORKER_POLL_MS || 5_000));
const staleHours = Math.max(1, Number(process.env.DNS_VALUATION_STALE_HOURS || 6));
const portfolioEstimatesEnabled = process.env.DNS_PORTFOLIO_ESTIMATES_ENABLED === "1";
const vectorDatabaseUrl = String(process.env.DNS_VECTOR_DATABASE_URL || "").trim();
const seedIntervalMs = Math.max(30_000, Number(process.env.DNS_PIPELINE_SEED_INTERVAL_MS || 5 * 60 * 1000));
const seedLimit = Math.max(1, Math.min(10_000, Number(process.env.DNS_PIPELINE_SEED_LIMIT || 1_000)));
const marketHistoryDays = Math.max(365, Number(process.env.DNS_MARKET_HISTORY_DAYS || 3650));
const estimatorVersion = DNS_ESTIMATOR_VERSION;
const requestedTypes = String(process.env.DNS_PIPELINE_JOB_TYPES || "dns-feature,dns-valuation")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);
const once = process.argv.includes("--once");

if (!databaseUrl) {
  console.error("[dns-pipeline] DNS_DATABASE_URL or DATABASE_URL is required");
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: /localhost|127\.0\.0\.1/i.test(databaseUrl) ? false : { rejectUnauthorized: false },
  max: Math.max(2, Number(process.env.DNS_DATABASE_POOL_MAX || 6)),
});
const store = createDnsStore(pool);
const vectorPool = vectorDatabaseUrl ? new Pool({
  connectionString: vectorDatabaseUrl,
  ssl: /localhost|127\.0\.0\.1/i.test(vectorDatabaseUrl) ? false : { rejectUnauthorized: false },
  max: 2,
}) : null;
let lastSeedAt = 0;

function featureRecord(nftAddress, classification) {
  return {
    nftAddress,
    primaryRoute: classification.primaryRoute,
    characterLength: classification.characterLength,
    byteLength: classification.byteLength,
    script: classification.primaryScript,
    languageHints: [],
    characterClass: classification.characterClass,
    scarcityClass: classification.scarcityClass,
    repetitionSignature: classification.patternSignature,
    uniqueCharacterCount: classification.uniqueCharacterCount,
    tokenCount: Math.max(1, classification.compoundTokens?.length || 1),
    hasSequence: Boolean(classification.sequence),
    hasPalindrome: Boolean(classification.palindrome || classification.nearPalindrome),
    hasRepeatedRun: classification.maxRunLength > 1,
    hasRepeatedSubstring: Boolean(classification.repeatedSubstring),
    hasLeadingZero: Boolean(classification.leadingZero),
    hasTrailingZero: Boolean(classification.trailingZero),
    hasSeparator: Boolean(classification.containsSeparator),
    isMixedScript: Boolean(classification.mixedScript),
    hasConfusable: Boolean(classification.mixedScript),
    pronounceabilityScore: classification.pronounceabilityScore,
    featureJson: classification,
    classifierVersion: classification.classifierVersion,
    computedAt: new Date(),
  };
}

async function processFeatureJob(job) {
  const nftAddress = String(job.payload_json?.nftAddress || "").toLowerCase();
  const domain = String(job.payload_json?.domain || "");
  if (!nftAddress || !domain) throw new Error("dns-feature job is missing nftAddress or domain");
  const classification = classifyTonDns(domain);
  await store.upsertStructuralFeatures(featureRecord(nftAddress, classification));
  await store.enqueueJob({
    jobType: "dns-semantic",
    dedupeKey: `${nftAddress}:dns-semantic-v1`,
    priority: classification.primaryRoute === "residual" ? 40 : 10,
    payload: { nftAddress, domain: classification.normalizedDomain, classification },
  });
  await store.enqueueJob({
    jobType: "dns-valuation",
    dedupeKey: `${nftAddress}:${DNS_ESTIMATOR_VERSION}`,
    priority: 60,
    payload: { nftAddress, domain: classification.normalizedDomain },
  });
  return { route: classification.primaryRoute, domain: classification.normalizedDomain };
}

function semanticOverlap(target = [], comparable = []) {
  const left = new Set(target || []);
  const right = new Set(comparable || []);
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const value of left) if (right.has(value)) shared += 1;
  return shared / new Set([...left, ...right]).size;
}

async function semanticCandidateMap(nftAddress) {
  if (!vectorPool) return new Map();
  try {
    const result = await vectorPool.query(`
      WITH target AS (
        SELECT embedding
        FROM dns_embeddings
        WHERE nft_address = $1
        ORDER BY generated_at DESC
        LIMIT 1
      )
      SELECT candidate.nft_address,
        GREATEST(0, LEAST(1, 1 - (candidate.embedding <=> target.embedding))) AS similarity
      FROM dns_embeddings candidate
      CROSS JOIN target
      WHERE candidate.nft_address <> $1
      ORDER BY candidate.embedding <=> target.embedding
      LIMIT 100
    `, [nftAddress]);
    return new Map(result.rows.map((row) => [String(row.nft_address).toLowerCase(), Number(row.similarity) || 0]));
  } catch (error) {
    console.warn(`[dns-pipeline] semantic vector retrieval deferred: ${error.message}`);
    return new Map();
  }
}

async function valuationInputs(nftAddress, fallbackDomain) {
  const targetResult = await pool.query(`
    SELECT d.nft_address, d.domain_normalized,
      sf.primary_route, sf.character_length, sf.feature_json,
      COALESCE(sp.semantic_categories, ARRAY[]::text[]) AS semantic_categories,
      sp.profile_version AS semantic_version,
      cm.listing_gram, cm.highest_bid_gram, cm.is_verified,
      cm.observed_at, cm.stale_at
    FROM dns_domains d
    LEFT JOIN dns_structural_features sf ON sf.nft_address = d.nft_address
    LEFT JOIN dns_semantic_profiles sp ON sp.nft_address = d.nft_address
    LEFT JOIN dns_current_market cm ON cm.nft_address = d.nft_address
    WHERE d.nft_address = $1
  `, [nftAddress]);
  const targetRow = targetResult.rows[0];
  if (!targetRow) throw new Error(`Unknown DNS NFT ${nftAddress}`);
  const target = targetRow.feature_json?.primaryRoute
    ? targetRow.feature_json
    : classifyTonDns(targetRow.domain_normalized || fallbackDomain);
  const maxLengthDelta = target.primaryRoute === "numeric" || target.primaryRoute === "short-letters" ? 0 : 3;
  const semanticCandidates = await semanticCandidateMap(nftAddress);
  const semanticAddresses = [...semanticCandidates.keys()];
  const candidatesResult = await pool.query(`
    SELECT e.event_id, e.nft_address, e.domain_normalized, e.event_type,
      e.event_time, e.price_gram, e.payment_asset, e.is_finalized,
      e.is_cancelled, e.quality_flags_json, e.marketplace_name,
      sf.feature_json,
      COALESCE(sp.semantic_categories, ARRAY[]::text[]) AS semantic_categories
    FROM dns_market_events e
    JOIN dns_structural_features sf ON sf.nft_address = e.nft_address
    LEFT JOIN dns_semantic_profiles sp ON sp.nft_address = e.nft_address
    WHERE e.is_finalized = TRUE
      AND e.is_cancelled = FALSE
      AND e.price_gram > 0
      AND lower(e.payment_asset) IN ('gram', 'ton', 'toncoin', 'native')
      AND lower(e.event_type) IN ('sale', 'fixed-sale', 'fixed_sale', 'completed-sale', 'completed_sale', 'auction-settlement', 'auction_settlement')
      AND e.event_time >= NOW() - ($6 * INTERVAL '1 day')
      AND NOT (COALESCE(e.quality_flags_json->'flags', '[]'::jsonb) ?| ARRAY[
        'cancelled', 'currency-mismatch', 'duplicate', 'failed', 'reverted',
        'self-sale', 'unsupported-contract', 'unknown_secondary_marketplace', 'wash-trade'
      ])
      AND (
        COALESCE(e.quality_flags_json->>'market_kind', '') IN ('registration_auction', 'secondary_getgems')
        OR lower(COALESCE(e.marketplace_name, '')) IN ('getgems', 'ton dns auction')
      )
      AND (
        e.nft_address = $1
        OR sf.primary_route = $2
        OR abs(sf.character_length - $3) <= $4
        OR e.nft_address = ANY($5::text[])
      )
    ORDER BY (e.nft_address = $1) DESC, e.event_time DESC
    LIMIT 750
  `, [nftAddress, target.primaryRoute, target.characterLength, maxLengthDelta, semanticAddresses, marketHistoryDays]);
  const targetCategories = targetRow.semantic_categories || [];
  const events = candidatesResult.rows.map((row) => ({
    eventId: row.event_id,
    nftAddress: row.nft_address,
    domain: row.domain_normalized,
    classification: row.feature_json?.primaryRoute ? row.feature_json : classifyTonDns(row.domain_normalized),
    eventType: row.event_type,
    eventTime: row.event_time,
    priceGram: Number(row.price_gram),
    paymentAsset: row.payment_asset,
    completed: Boolean(row.is_finalized),
    cancelled: Boolean(row.is_cancelled),
    qualityFlags: row.quality_flags_json || {},
    semanticSimilarity: Math.max(
      semanticCandidates.get(String(row.nft_address).toLowerCase()) || 0,
      semanticOverlap(targetCategories, row.semantic_categories || [])
    ),
    verified: ["registration_auction", "secondary_getgems"].includes(row.quality_flags_json?.market_kind)
      || ["getgems", "ton dns auction"].includes(String(row.marketplace_name || "").toLowerCase()),
  }));
  return { target, targetRow, events };
}

async function processValuationJob(job) {
  const nftAddress = String(job.payload_json?.nftAddress || "").toLowerCase();
  const domain = String(job.payload_json?.domain || "");
  if (!nftAddress) throw new Error("dns-valuation job is missing nftAddress");
  const { target, targetRow, events } = await valuationInputs(nftAddress, domain);
  const marketSignalFresh = Boolean(targetRow.is_verified)
    && Number.isFinite(Date.parse(targetRow.stale_at || ""))
    && Date.parse(targetRow.stale_at) > Date.now();
  const marketSignals = {
    asks: marketSignalFresh && Number(targetRow.listing_gram) > 0 ? [Number(targetRow.listing_gram)] : [],
    bids: marketSignalFresh && Number(targetRow.highest_bid_gram) > 0 ? [Number(targetRow.highest_bid_gram)] : [],
  };
  const estimate = estimateTonDnsValue(target, events, marketSignals);
  const valuedAt = new Date();
  const staleAt = new Date(valuedAt.getTime() + staleHours * 60 * 60 * 1000);
  const portfolioEligible = portfolioEstimatesEnabled
    && estimate.status === "estimated"
    && (estimate.confidenceBand === "medium" || estimate.confidenceBand === "high");
  const eventsById = new Map(events.map((event) => [event.eventId, event]));
  const comparables = estimate.comparables.map((comparable, index) => {
    const event = eventsById.get(comparable.eventId) || {};
    return {
      rank: index + 1,
      nftAddress: event.nftAddress,
      marketEventId: comparable.eventId,
      structuralSimilarity: comparable.structuralSimilarity,
      semanticSimilarity: comparable.semanticSimilarity,
      finalWeight: comparable.weight,
      priceGram: comparable.priceGram,
      metadata: { domain: comparable.domain, exactDomain: comparable.exactDomain },
    };
  }).filter((item) => item.nftAddress && item.marketEventId);
  await store.upsertValuation({
    nftAddress,
    domainNormalized: estimate.domain,
    estimateGram: estimate.estimateGram,
    rangeLowGram: estimate.rangeLowGram,
    rangeHighGram: estimate.rangeHighGram,
    confidenceScore: estimate.confidenceScore,
    confidenceBand: estimate.confidenceBand,
    valuationStatus: estimate.status,
    portfolioEligible,
    evidenceCount: estimate.evidenceCount,
    effectiveCompCount: estimate.effectiveCompCount,
    ownSaleCount: estimate.ownSaleCount,
    currentListingGram: marketSignalFresh ? (Number(targetRow.listing_gram) || null) : null,
    currentBidGram: marketSignalFresh ? (Number(targetRow.highest_bid_gram) || null) : null,
    marketRegimeId: "gram-market-current",
    featureVersion: target.classifierVersion || DNS_FEATURE_VERSION,
    semanticVersion: targetRow.semantic_version || null,
    estimatorVersion,
    calibrationVersion: DNS_CALIBRATION_VERSION,
    evidenceSummary: { signalCounts: estimate.signalCounts, completedSales: estimate.completedSaleCount },
    explanation: {
      route: estimate.route,
      confidenceBand: estimate.confidenceBand,
      evidenceCount: estimate.evidenceCount,
      note: `${target.scarcityClass || target.primaryRoute} comparable market evidence`,
    },
    valuedAt,
    staleAt,
  }, comparables);
  return { domain: estimate.domain, status: estimate.status, confidence: estimate.confidenceBand, evidence: estimate.evidenceCount };
}

async function processJob(job) {
  if (job.job_type === "dns-feature") return processFeatureJob(job);
  if (job.job_type === "dns-valuation") return processValuationJob(job);
  throw new Error(`Unsupported DNS job type ${job.job_type}`);
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runBatch() {
  const jobs = await store.claimJobs({ workerId, jobTypes: requestedTypes, limit: batchSize, leaseSeconds: 300 });
  for (const job of jobs) {
    try {
      const result = await processJob(job);
      await store.completeJob(job.id, workerId, result);
      console.log(`[dns-pipeline] completed ${job.job_type} ${job.dedupe_key}`);
    } catch (error) {
      await store.failJob(job.id, workerId, error, { retryDelaySeconds: Math.min(3600, 30 * (2 ** Math.max(0, job.attempts - 1))) });
      console.warn(`[dns-pipeline] failed ${job.job_type} ${job.dedupe_key}: ${error.message}`);
    }
  }
  return jobs.length;
}

async function seedPipeline(force = false) {
  if (!force && Date.now() - lastSeedAt < seedIntervalMs) return null;
  const seeded = await store.seedPipelineJobs({ staleHours, limit: seedLimit, estimatorVersion });
  const baselines = await store.refreshArchetypeBaselines({
    estimatorVersion,
    historyDays: marketHistoryDays,
    staleHours: Math.max(24, staleHours),
  });
  lastSeedAt = Date.now();
  await store.setCheckpoint({
    workerName: "dns-pipeline",
    checkpointKey: "heartbeat",
    cursor: { seededAt: new Date(lastSeedAt).toISOString() },
    metadata: { workerId, ...seeded, baselines },
    checkpointVersion: "dns-pipeline-v1",
  });
  if (Number(seeded.feature_jobs) || Number(seeded.valuation_jobs)) {
    console.log(`[dns-pipeline] seeded features=${seeded.feature_jobs} valuations=${seeded.valuation_jobs}`);
  }
  return seeded;
}

async function main() {
  await store.init();
  console.log(`[dns-pipeline] worker=${workerId} jobs=${requestedTypes.join(",")} batch=${batchSize}`);
  do {
    await seedPipeline(lastSeedAt === 0);
    const processed = await runBatch();
    if (once) break;
    if (!processed) await delay(pollMs);
  } while (true);
}

main()
  .catch((error) => {
    console.error(`[dns-pipeline] fatal: ${error.stack || error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (once) {
      await pool.end();
      if (vectorPool) await vectorPool.end();
    }
  });

"use strict";

const os = require("node:os");
const { Pool } = require("pg");
const { createUsernameStore } = require("../lib/username-store");
const { classifyTelegramUsername } = require("../lib/username-structural");
const { estimateTelegramUsernameValue } = require("../lib/username-estimator");
const { USERNAME_CALIBRATION_VERSION, USERNAME_ESTIMATOR_VERSION, USERNAME_FEATURE_VERSION } = require("../lib/username-engine");

const databaseUrl = String(process.env.USERNAME_DATABASE_URL || process.env.DNS_DATABASE_URL || process.env.DATABASE_URL || "").trim();
if (!databaseUrl) throw new Error("USERNAME_DATABASE_URL, DNS_DATABASE_URL, or DATABASE_URL is required");
const pool = new Pool({ connectionString: databaseUrl, ssl: /localhost|127\.0\.0\.1/i.test(databaseUrl) ? false : { rejectUnauthorized: false }, max: 4 });
const store = createUsernameStore(pool);
const workerId = process.env.USERNAME_WORKER_ID || `${os.hostname()}:${process.pid}`;
const once = process.argv.includes("--once");
const batchSize = Math.max(1, Math.min(50, Number(process.env.USERNAME_WORKER_BATCH_SIZE || 15)));
const staleHours = Math.max(1, Number(process.env.USERNAME_VALUATION_STALE_HOURS || 12));
const baselineRefreshMs = Math.max(60_000, Number(process.env.USERNAME_BASELINE_REFRESH_MS || 15 * 60 * 1000));
let lastBaselineRefresh = 0;
let lastSeed = 0;
let lastPrune = 0;
const seedIntervalMs = Math.max(60_000, Number(process.env.USERNAME_PIPELINE_SEED_INTERVAL_MS || 5 * 60 * 1000));
const seedLimit = Math.max(10, Math.min(5000, Number(process.env.USERNAME_PIPELINE_SEED_LIMIT || 1000)));

async function processJob(job) {
  const nftAddress = String(job.payload_json?.nftAddress || "").toLowerCase();
  const username = String(job.payload_json?.username || "");
  if (!nftAddress || !username) throw new Error("username job is missing nftAddress or username");
  if (job.job_type === "username-feature") {
    const feature = classifyTelegramUsername(username);
    await store.upsertFeatures({ nftAddress, featureVersion: USERNAME_FEATURE_VERSION, primaryRoute: feature.primaryRoute, characterLength: feature.characterLength, script: feature.primaryScript, scarcityClass: feature.scarcityClass, feature, semantic: {} });
    if (process.env.USERNAME_SEMANTIC_SERVICE_URL) await store.enqueueJob({ jobType: "username-semantic", dedupeKey: `${nftAddress}:username-semantic-v1`, priority: feature.primaryRoute === "residual" ? 50 : 15, payload: { nftAddress, username: feature.normalizedUsername, feature } });
    await store.enqueueJob({ jobType: "username-valuation", dedupeKey: `${nftAddress}:${USERNAME_ESTIMATOR_VERSION}`, priority: 80, payload: { nftAddress, username: feature.normalizedUsername } });
    return;
  }
  const inputs = await store.valuationInputs(nftAddress, Math.max(365, Number(process.env.USERNAME_MARKET_HISTORY_DAYS || 3650)));
  if (!inputs.target) throw new Error(`unknown username asset ${nftAddress}`);
  const target = inputs.target.feature_json?.normalizedUsername ? inputs.target.feature_json : classifyTelegramUsername(inputs.target.username_normalized || username);
  const events = inputs.events.map((row) => ({ eventId: row.event_id, nftAddress: row.nft_address, username: row.username_normalized, eventType: row.event_type, eventTime: row.event_time, priceUsd: Number(row.price_usd), finalized: row.is_finalized, cancelled: row.is_cancelled, paymentAsset: row.payment_asset, reliabilityScore: Number(row.reliability_score), selfSale: Boolean(row.quality_flags_json?.self_sale), washTrade: Boolean(row.quality_flags_json?.wash_trade), classification: row.feature_json }));
  const estimate = estimateTelegramUsernameValue(target, events);
  const valuedAt = new Date();
  // A broad market segment can provide a useful indicative range, but it
  // cannot put an identity into a portfolio total. That needs repeated sales
  // of this exact username, regardless of how confident a generic model is.
  const portfolioEligible = process.env.USERNAME_PORTFOLIO_ESTIMATES_ENABLED === "1"
    && estimate.status === "estimated"
    && estimate.ownSaleCount >= 2
    && ["medium", "high"].includes(estimate.confidenceBand);
  await store.upsertValuation({ nftAddress, usernameNormalized: estimate.username, estimateUsd: estimate.estimateUsd, rangeLowUsd: estimate.rangeLowUsd, rangeHighUsd: estimate.rangeHighUsd, confidenceScore: estimate.confidenceScore, confidenceBand: estimate.confidenceBand, valuationStatus: estimate.status, portfolioEligible, evidenceCount: estimate.evidenceCount, effectiveCompCount: estimate.effectiveCompCount, ownSaleCount: estimate.ownSaleCount, currentListingGram: inputs.target.lowest_ask_gram, currentBidGram: inputs.target.highest_bid_gram, estimatorVersion: USERNAME_ESTIMATOR_VERSION, calibrationVersion: USERNAME_CALIBRATION_VERSION, explanation: { route: target.primaryRoute, evidence: "public-finalized-market-sale-ledger" }, valuedAt, staleAt: new Date(valuedAt.getTime() + staleHours * 3_600_000) }, estimate.comparables);
}
async function cycle() {
  await store.init();
  if (Date.now() - lastSeed >= seedIntervalMs) {
    const seeded = await store.seedDueJobs(USERNAME_ESTIMATOR_VERSION, USERNAME_FEATURE_VERSION, seedLimit);
    lastSeed = Date.now();
    console.log(`[username-pipeline] seeded-features=${seeded.features} seeded-valuations=${seeded.valuations}`);
  }
  if (Date.now() - lastPrune >= 24 * 60 * 60 * 1000) {
    const pruned = await store.pruneJobs(30);
    lastPrune = Date.now();
    console.log(`[username-pipeline] pruned-jobs=${pruned}`);
  }
  if (Date.now() - lastBaselineRefresh >= baselineRefreshMs) {
    const refreshed = await store.refreshArchetypeBaselines(USERNAME_ESTIMATOR_VERSION);
    lastBaselineRefresh = Date.now();
    console.log(`[username-pipeline] refreshed-baselines=${refreshed}`);
  }
  const jobs = await store.claimJobs(workerId, batchSize, ["username-feature", "username-valuation"]);
  for (const job of jobs) { try { await processJob(job); await store.completeJob(job.id, workerId); } catch (error) { await store.failJob(job.id, workerId, error); console.warn(`[username-pipeline] job ${job.id} failed: ${error.message}`); } }
  console.log(`[username-pipeline] processed=${jobs.length}`);
  return jobs.length;
}
(async () => { try { do { const count = await cycle(); if (once || !count) { if (!once) await new Promise((resolve) => setTimeout(resolve, 5000)); else break; } } while (true); } finally { await pool.end(); } })().catch((error) => { console.error(`[username-pipeline] fatal: ${error.stack || error.message}`); process.exit(1); });

"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { DNS_ESTIMATOR_VERSION } = require("../lib/dns-engine");
const { dnsLengthBucket } = require("../lib/dns-engine");
const { classifyTonDns } = require("../lib/dns-structural");
const { USERNAME_ESTIMATOR_VERSION, USERNAME_CALIBRATION_VERSION } = require("../lib/username-engine");
const { predictUsernameLearnedModel, trainUsernameLearnedModel } = require("../lib/username-learned-model");
const { createValuationLedgerClient } = require("../lib/valuation-ledger-client");

function loadLocalEnv() {
  if (typeof __dirname === "undefined") return;
  const envPath = path.join(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, "");
    if (!(key in process.env)) process.env[key] = value;
  }
}

// Match the app server locally without replacing variables supplied by a worker.
loadLocalEnv();

let ledgerClient = null;
function ledger() { return ledgerClient || (ledgerClient = createValuationLedgerClient()); }
function configureLedger(options = {}) { ledgerClient = createValuationLedgerClient(options); }
const kinds = process.argv.includes("--dns") ? ["dns"] : process.argv.includes("--username") ? ["username"] : ["dns", "username"];

class LogHistogram {
  constructor() { this.bins = new Uint32Array(2400); this.count = 0; }
  add(value) {
    const usd = Number(value);
    if (!(usd > 0)) return;
    const position = Math.max(0, Math.min(this.bins.length - 1, Math.round((Math.log10(usd) + 2) * 240)));
    this.bins[position] += 1;
    this.count += 1;
  }
  quantile(ratio) {
    if (!this.count) return 0;
    const target = Math.max(1, Math.ceil(this.count * ratio));
    let seen = 0;
    for (let index = 0; index < this.bins.length; index += 1) {
      seen += this.bins[index];
      if (seen >= target) return 10 ** ((index / 240) - 2);
    }
    return 0;
  }
}

function groupKey(scope, route = "*", length = "*", script = "*", scarcity = "*") {
  return [scope, route || "*", length || "*", script || "*", scarcity || "*"].join("|");
}

function addGroup(groups, key, priceUsd) {
  if (!groups.has(key)) groups.set(key, new LogHistogram());
  groups.get(key).add(priceUsd);
}

function addComparableGroups(groups, sale) {
  addGroup(groups, groupKey("global"), sale.price_usd);
  addGroup(groups, groupKey("route", sale.primary_route), sale.price_usd);
  addGroup(groups, groupKey("route-length", sale.primary_route, sale.length_bucket), sale.price_usd);
  addGroup(groups, groupKey("archetype", sale.primary_route, sale.length_bucket, sale.script, sale.scarcity_class), sale.price_usd);
}

function stableHash(value) {
  let hash = 2166136261;
  for (const character of String(value || "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function boundedTrainingSample(rows, limit = 2048) {
  if (rows.length <= limit) return rows;
  const highValueCount = Math.min(160, Math.max(32, Math.floor(limit * 0.08)));
  const highValue = [...rows].sort((left, right) => Number(right.price_usd) - Number(left.price_usd)).slice(0, highValueCount);
  const selected = new Map(highValue.map((row) => [String(row.sale_id || `${row.normalized_name}:${row.sold_at}:${row.price_usd}`), row]));
  const remainder = rows
    .map((row) => ({ row, key: String(row.sale_id || `${row.normalized_name}:${row.sold_at}:${row.price_usd}`) }))
    .filter(({ key }) => !selected.has(key))
    .sort((left, right) => stableHash(left.key) - stableHash(right.key))
    .slice(0, limit - selected.size);
  for (const { key, row } of remainder) selected.set(key, row);
  return [...selected.values()];
}

function canonicalSale(kind, sale) {
  if (kind !== "dns") return sale;
  const classification = classifyTonDns(sale.normalized_name || "");
  return {
    ...sale,
    primary_route: classification.primaryRoute,
    length_bucket: dnsLengthBucket(classification.characterLength),
    script: classification.primaryScript,
    scarcity_class: classification.scarcityClass || "standard",
  };
}

function learnedUsernameSale(sale) {
  return {
    normalized_name: sale.normalized_name,
    price_usd: Number(sale.price_usd),
    sold_at: Number(sale.sold_at),
    reliability_score: Number(sale.reliability_score ?? 1),
    semantic_json: sale.semantic_json || {},
  };
}

function rememberOwnSale(assets, sale) {
  const key = String(sale.asset_key || "").toLowerCase();
  if (!key) return;
  const current = assets.get(key) || {
    name: sale.normalized_name,
    count: 0,
    histogram: new LogHistogram(),
    lastSoldAt: 0,
  };
  current.count += 1;
  current.histogram.add(sale.price_usd);
  const soldAt = Number(sale.sold_at || 0);
  if (soldAt > current.lastSoldAt) {
    current.lastSoldAt = soldAt;
    current.lastPriceUsd = Number(sale.price_usd);
  }
  assets.set(key, current);
}

function exactValuation(kind, assetKey, evidence, options = {}) {
  const histogram = evidence.histogram || new LogHistogram();
  for (const price of evidence.prices || []) histogram.add(price);
  const valueAt = (ratio) => histogram.quantile(ratio);
  let midpoint = valueAt(0.5);
  const exactSaleAnchor = Number(evidence.lastPriceUsd || midpoint || 0);
  const learned = kind === "username" ? predictUsernameLearnedModel(options.learnedModel, evidence.name) : null;
  const ageDays = (Date.now() / 1000 - evidence.lastSoldAt) / 86400;
  if (learned && midpoint > 0) {
    const freshness = Math.max(0.3, Math.min(1, 0.5 ** (Math.max(0, ageDays) / 540)));
    const ownShare = Math.max(0.45, Math.min(0.88, (evidence.count >= 2 ? 0.82 : 0.65) * freshness));
    midpoint = Math.exp(Math.log(midpoint) * ownShare + Math.log(learned.estimateUsd) * (1 - ownShare));
  }
  if (kind === "username" && exactSaleAnchor > 0) midpoint = Math.max(midpoint, exactSaleAnchor);
  // One finalized sale is useful price evidence, but it is not enough to
  // establish a durable portfolio value on its own. It remains visible as a
  // low-confidence estimate until repeated sales or independent comparables
  // corroborate the asset's market.
  const confidenceBand = evidence.count >= 3 ? "high" : evidence.count >= 2 ? "medium" : "low";
  const version = kind === "dns" ? DNS_ESTIMATOR_VERSION : USERNAME_ESTIMATOR_VERSION;
  return {
    assetKind: kind,
    assetKey,
    displayName: kind === "username" ? `@${evidence.name}` : evidence.name,
    estimateUsd: midpoint,
    rangeLowUsd: Math.min(valueAt(0.2) || midpoint, learned?.rangeLowUsd || midpoint),
    rangeHighUsd: Math.max(valueAt(0.8) || midpoint, learned?.rangeHighUsd || midpoint),
    confidenceScore: confidenceBand === "high" ? 0.82 : confidenceBand === "medium" ? 0.62 : 0.38,
    confidenceBand,
    valuationStatus: "estimated",
    portfolioEligible: kind === "username" ? midpoint > 0 : confidenceBand !== "low",
    evidenceCount: evidence.count,
    effectiveCompCount: Math.min(evidence.count, 20),
    ownSaleCount: evidence.count,
    currentListingGram: 0,
    currentBidGram: 0,
    marketPlatform: kind === "username" ? "Fragment" : "TON DNS market",
    estimatorVersion: version,
    calibrationVersion: kind === "username" ? USERNAME_CALIBRATION_VERSION : "dns-calibration-v1",
    valuedAt: new Date().toISOString(),
    staleAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    explanation: {
      provenance: "compact-public-finalized-own-sales",
      historicalUsd: true,
      saleCount: evidence.count,
      lastSoldAt: new Date(evidence.lastSoldAt * 1000).toISOString(),
      displayedComparableCount: Math.min(evidence.count, 20),
      learnedModel: learned ? learned.modelVersion : null,
    },
  };
}

async function refreshKind(kind, options = {}) {
  if (options.aggregateSource) return refreshKindFromAggregate(kind);
  const writeExactValuations = options.writeExactValuations !== false;
  const groups = new Map();
  const assets = new Map();
  const learnedSales = [];
  let cursor = null;
  let sales = 0;
  do {
    const page = await ledger().readSales(kind, cursor, 5000);
    for (const sourceSale of page.records || []) {
      const sale = canonicalSale(kind, sourceSale);
      addComparableGroups(groups, sale);
      if (writeExactValuations) rememberOwnSale(assets, sale);
      if (kind === "username") learnedSales.push(learnedUsernameSale(sale));
      sales += 1;
    }
    cursor = page.nextCursor;
  } while (cursor);

  const estimatorVersion = kind === "dns" ? DNS_ESTIMATOR_VERSION : USERNAME_ESTIMATOR_VERSION;
  const trainingSales = kind === "username" ? boundedTrainingSample(learnedSales) : [];
  const learnedModel = kind === "username" ? trainUsernameLearnedModel(trainingSales) : null;
  const generatedAt = new Date().toISOString();
  const staleAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const baselines = [];
  for (const [key, histogram] of groups) {
    if (histogram.count < 3) continue;
    const [scope, primaryRoute, lengthBucket, script, scarcityClass] = key.split("|");
    baselines.push({
      assetKind: kind, estimatorVersion, scope, primaryRoute, lengthBucket, script, scarcityClass,
      midpointUsd: histogram.quantile(0.5), rangeLowUsd: histogram.quantile(0.2), rangeHighUsd: histogram.quantile(0.8),
      evidenceCount: histogram.count, effectiveCompCount: histogram.count, generatedAt, staleAt,
      provenance: {
        verifiedSalesOnly: true,
        publicCompletedMarketSalesOnly: true,
        chainConfirmationRequired: false,
        aggregation: "bounded-log-histogram-quantiles",
        historicalUsd: true,
        ...(scope === "global" && learnedModel ? { learnedModel: { ...learnedModel, ledgerSaleCount: sales } } : {}),
      },
    });
  }
  const valuations = writeExactValuations
    ? [...assets].map(([assetKey, evidence]) => exactValuation(kind, assetKey, evidence, { learnedModel }))
    : [];
  const baselineWrites = await ledger().ingestBaselines(baselines);
  const valuationWrites = valuations.length ? await ledger().ingestValuations(valuations) : 0;
  console.log(`[identity-baselines] kind=${kind} sales=${sales} groups=${baselines.length} exact=${valuations.length} baselineWrites=${baselineWrites} valuationWrites=${valuationWrites}`);
  return { kind, sales, groups: baselines.length, exact: valuations.length, baselineWrites, valuationWrites };
}

async function refreshKindFromAggregate(kind) {
  const source = await ledger().readBaselineSource(kind, 2048);
  const estimatorVersion = kind === "dns" ? DNS_ESTIMATOR_VERSION : USERNAME_ESTIMATOR_VERSION;
  const marketPremiumRate = Number(source.marketPremiumRate || 0);
  const premiumRates = new Map((source.premiumCohorts || []).map((row) => {
    const populationCount = Number(row.total_count || 0);
    const premiumCount = Number(row.premium_count || 0);
    const priorWeight = 24;
    return [
      `${row.primary_route}|${row.length_bucket}|${row.script}`,
      {
        premiumRate: populationCount
          ? (premiumCount + marketPremiumRate * priorWeight) / (populationCount + priorWeight)
          : marketPremiumRate,
        populationCount,
      },
    ];
  }));
  const cohortOverrides = Object.fromEntries((source.groups || []).filter((row) => row.scope === "archetype").map((row) => {
    const key = `${row.primary_route}|${row.script}|${row.length_bucket}`;
    return [key, {
      ...(premiumRates.get(`${row.primary_route}|${row.length_bucket}|${row.script}`) || {}),
      medianUsd: Number(row.midpoint_usd || 0), upperUsd: Number(row.range_high_usd || 0),
    }];
  }));
  const learnedModel = kind === "username" ? trainUsernameLearnedModel(source.training || [], {
    marketPremiumRate: source.marketPremiumRate,
    cohortStats: cohortOverrides,
  }) : null;
  const generatedAt = new Date().toISOString();
  const staleAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  const baselines = (source.groups || []).flatMap((row) => {
    const midpointUsd = Number(row.midpoint_usd || 0);
    const evidenceCount = Number(row.evidence_count || 0);
    if (!(midpointUsd > 0) || evidenceCount < 3) return [];
    return [{
      assetKind: kind,
      estimatorVersion,
      scope: row.scope,
      primaryRoute: row.primary_route,
      lengthBucket: row.length_bucket,
      script: row.script,
      scarcityClass: row.scarcity_class,
      midpointUsd,
      rangeLowUsd: Number(row.range_low_usd || midpointUsd),
      rangeHighUsd: Number(row.range_high_usd || midpointUsd),
      evidenceCount,
      effectiveCompCount: evidenceCount,
      generatedAt,
      staleAt,
      provenance: {
        verifiedSalesOnly: true,
        publicCompletedMarketSalesOnly: true,
        aggregation: "d1-window-quantiles",
        historicalUsd: true,
        ...(row.scope === "global" && learnedModel
          ? { learnedModel: { ...learnedModel, ledgerSaleCount: Number(source.ledgerSaleCount || evidenceCount) } }
          : {}),
      },
    }];
  });
  const baselineWrites = await ledger().ingestBaselines(baselines);
  const sales = Number(source.groups?.find((row) => row.scope === "global")?.evidence_count || 0);
  console.log(`[identity-baselines] aggregate kind=${kind} sales=${sales} groups=${baselines.length} training=${source.training?.length || 0} baselineWrites=${baselineWrites}`);
  return { kind, sales, groups: baselines.length, exact: 0, baselineWrites, valuationWrites: 0, training: source.training?.length || 0 };
}

async function main() {
  for (const kind of kinds) await refreshKind(kind);
  await ledger().maintain();
}

if (require.main === module) main().catch((error) => {
  console.error(`[identity-baselines] fatal: ${error.stack || error.message}`);
  process.exit(1);
});

module.exports = { LogHistogram, addComparableGroups, boundedTrainingSample, canonicalSale, configureLedger, exactValuation, groupKey, learnedUsernameSale, refreshKind, refreshKindFromAggregate };

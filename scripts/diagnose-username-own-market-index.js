"use strict";

// Frozen, exposed-history signal diagnostic. Never a live or portfolio price.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { loadHistoricalSales } = require("./evaluate-username-rebuild");

const ROOT = path.resolve(__dirname, "..");
const PROTOCOL = path.join(ROOT, "research/telegram-usernames/secondary-own-market-index-diagnostic-protocol-2026-09-27.json");
const DAY = 86400000;
const MIN_LOG = -10;
const MAX_LOG = 20;
const STEP = 0.025;
const BINS = Math.ceil((MAX_LOG - MIN_LOG) / STEP);
const hash = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const valid = value => Number.isFinite(value) && value > 0;
const dayOf = time => Math.floor(Date.parse(time) / DAY);
const bucketOf = name => name.length <= 4 ? 1 : name.length <= 7 ? 2 : 3;

function readChecked(spec) {
  const bytes = fs.readFileSync(path.join(ROOT, spec.path));
  if (hash(bytes) !== spec.sha256) throw new Error(`Frozen input changed: ${spec.path}`);
  return JSON.parse(bytes);
}

function buildMarketIndex(sales) {
  const dayNumbers = sales.map(row => dayOf(row.eventTime));
  let firstDay = Infinity, lastDay = -Infinity;
  for (const day of dayNumbers) { firstDay = Math.min(firstDay, day); lastDay = Math.max(lastDay, day); }
  if (!Number.isFinite(firstDay) || lastDay - firstDay > 5000) throw new Error("Invalid market index time span");
  const length = lastDay - firstDay + 1;
  const daily = Array.from({ length }, () => Array.from({ length: 4 }, () => new Uint32Array(BINS)));
  const dailyTotals = Array.from({ length }, () => new Uint32Array(4));
  let clippedLow = 0, clippedHigh = 0;
  for (let i = 0; i < sales.length; i += 1) {
    const sale = sales[i];
    if (!valid(sale.priceUsd) || !sale.username) throw new Error("Invalid historical index sale");
    const value = Math.log(sale.priceUsd);
    if (value < MIN_LOG) clippedLow += 1;
    if (value >= MAX_LOG) clippedHigh += 1;
    const bin = Math.max(0, Math.min(BINS - 1, Math.floor((value - MIN_LOG) / STEP)));
    const day = dayNumbers[i] - firstDay;
    for (const group of [0, bucketOf(sale.username)]) {
      daily[day][group][bin] += 1;
      dailyTotals[day][group] += 1;
    }
  }
  const prefix = [], totals = [];
  for (let day = 0; day < length; day += 1) {
    prefix[day] = [];
    totals[day] = [];
    for (let group = 0; group < 4; group += 1) {
      const current = day ? new Uint32Array(prefix[day - 1][group]) : new Uint32Array(BINS);
      for (let bin = 0; bin < BINS; bin += 1) current[bin] += daily[day][group][bin];
      prefix[day][group] = current;
      totals[day][group] = (day ? totals[day - 1][group] : 0) + dailyTotals[day][group];
    }
  }
  const cache = new Map();
  function p90(referenceMs, group, minimum) {
    const referenceDay = Math.floor(referenceMs / DAY);
    const key = `${referenceDay}:${group}:${minimum}`;
    if (cache.has(key)) return cache.get(key);
    const end = Math.min(length - 1, referenceDay - firstDay - 1);
    const before = Math.min(length - 1, referenceDay - firstDay - 29);
    const count = index => index < 0 ? 0 : totals[index][group];
    const total = count(end) - count(before);
    let answer = null;
    if (total >= minimum) {
      const target = Math.ceil(0.9 * total);
      let cumulative = 0;
      for (let bin = 0; bin < BINS; bin += 1) {
        const upper = end < 0 ? 0 : prefix[end][group][bin];
        const lower = before < 0 ? 0 : prefix[before][group][bin];
        cumulative += upper - lower;
        if (cumulative >= target) { answer = MIN_LOG + (bin + 0.5) * STEP; break; }
      }
    }
    cache.set(key, answer);
    return answer;
  }
  return { p90, firstDay, lastDay, clippedLow, clippedHigh, sales: sales.length };
}

function addIndexFeatures(paired, ownByKey, market, minimumBucket = 100, minimumGlobal = 300) {
  const rows = [];
  for (const row of paired) {
    const key = `${row.eventId}\u001f${row.nftAddress}\u001f${row.eventTime}\u001f${row.username}`;
    const own = ownByKey.get(key);
    if (!own || own.actualUsd !== row.actualUsd || own.realizedVenue !== row.realizedVenue)
      throw new Error("Own-history outcome or identity mismatch");
    let raw = null, globalAdjusted = null, lengthAdjusted = null, lengthSpecific = false;
    if (own.hasPriorOwnSale) {
      if (!valid(own.priorOwnPriceUsd) || !(own.priorOwnAgeDays >= 0))
        throw new Error("Invalid prior exact-own-sale evidence");
      const targetMs = Date.parse(row.eventTime);
      const priorMs = targetMs - Math.round(own.priorOwnAgeDays * DAY);
      if (!Number.isFinite(priorMs) || !(priorMs < targetMs))
        throw new Error("Own sale is not strictly prior");
      raw = own.priorOwnPriceUsd;
      const targetGlobal = market.p90(targetMs, 0, minimumGlobal);
      const priorGlobal = market.p90(priorMs, 0, minimumGlobal);
      if (targetGlobal !== null && priorGlobal !== null) {
        globalAdjusted = raw * Math.exp(targetGlobal - priorGlobal);
        const bucket = bucketOf(row.username);
        const targetBucket = market.p90(targetMs, bucket, minimumBucket);
        const priorBucket = market.p90(priorMs, bucket, minimumBucket);
        lengthSpecific = targetBucket !== null && priorBucket !== null;
        lengthAdjusted = lengthSpecific ? raw * Math.exp(targetBucket - priorBucket) : globalAdjusted;
      }
    }
    for (const value of [raw, globalAdjusted, lengthAdjusted]) {
      if (value !== null && !valid(value)) throw new Error("Invalid market-adjusted own anchor");
    }
    rows.push({ eventId: row.eventId, nftAddress: row.nftAddress, eventTime: row.eventTime,
      actualUsd: row.actualUsd, realizedVenue: row.realizedVenue, raw, globalAdjusted, lengthAdjusted,
      lengthSpecific, v25: valid(row.v25EstimateUsd) ? row.v25EstimateUsd : null,
      ownHgb: valid(row.ownHistoryCandidate?.estimateUsd) ? row.ownHistoryCandidate.estimateUsd : null });
  }
  return rows;
}

function metrics(rows, field) {
  const errors = rows.filter(row => valid(row[field])).map(row => Math.abs(Math.log(row[field] / row.actualUsd))).sort((a, b) => a - b);
  const midpoint = Math.floor(errors.length / 2);
  return { attempts: rows.length, available: errors.length, abstentions: rows.length - errors.length,
    male: errors.length ? errors.reduce((sum, value) => sum + value, 0) / errors.length : null,
    medianFactor: errors.length ? Math.exp(errors.length % 2 ? errors[midpoint] : (errors[midpoint - 1] + errors[midpoint]) / 2) : null,
    p95Factor: errors.length ? Math.exp(errors[Math.ceil(0.95 * errors.length) - 1]) : null };
}

function summarize(rows) {
  const groups = { all: rows, secondary: rows.filter(row => row.realizedVenue.startsWith("secondary/")),
    "secondary/ordinary": rows.filter(row => row.realizedVenue.startsWith("secondary/") && row.actualUsd < 100),
    "secondary/intermediate": rows.filter(row => row.realizedVenue.startsWith("secondary/") && row.actualUsd >= 100 && row.actualUsd < 500),
    "secondary/premium": rows.filter(row => row.realizedVenue.startsWith("secondary/") && row.actualUsd >= 500),
    "primary/premium": rows.filter(row => row.realizedVenue === "primary/auction" && row.actualUsd >= 500) };
  return Object.fromEntries(Object.entries(groups).map(([name, group]) => {
    const common = group.filter(row => valid(row.raw) && valid(row.globalAdjusted) && valid(row.lengthAdjusted) && valid(row.v25) && valid(row.ownHgb));
    return [name, { attempts: group.length,
      all: Object.fromEntries(["raw", "globalAdjusted", "lengthAdjusted", "v25", "ownHgb"].map(key => [key, metrics(group, key)])),
      common: Object.fromEntries(["raw", "globalAdjusted", "lengthAdjusted", "v25", "ownHgb"].map(key => [key, metrics(common, key)])),
      lengthSpecific: group.filter(row => row.lengthSpecific).length }];
  }));
}

function bootstrap(rows, field) {
  const groups = new Map();
  for (const row of rows.filter(item => valid(item.raw) && valid(item[field]))) {
    if (!groups.has(row.nftAddress)) groups.set(row.nftAddress, []);
    groups.get(row.nftAddress).push(row);
  }
  const ids = [...groups.keys()].sort();
  let state = 27092026;
  const next = () => ((state = (1664525 * state + 1013904223) >>> 0) / 4294967296);
  const values = [];
  for (let iteration = 0; iteration < 2000; iteration += 1) {
    let rawSum = 0, adjustedSum = 0, count = 0;
    for (let i = 0; i < ids.length; i += 1) for (const row of groups.get(ids[Math.floor(next() * ids.length)])) {
      rawSum += Math.abs(Math.log(row.raw / row.actualUsd));
      adjustedSum += Math.abs(Math.log(row[field] / row.actualUsd));
      count += 1;
    }
    values.push(count && rawSum > 0 ? (rawSum - adjustedSum) / rawSum : 0);
  }
  values.sort((a, b) => a - b);
  return { identities: ids.length, lower95: values[49] ?? null, median: values[999] ?? null, upper95: values[1949] ?? null };
}

async function main() {
  const protocolBytes = fs.readFileSync(PROTOCOL);
  const protocol = JSON.parse(protocolBytes);
  if (protocol.version !== "secondary-own-market-index-diagnostic-v1" || !protocol.frozenBeforeEvaluation)
    throw new Error("Unexpected market-index diagnostic protocol");
  const auditOnly = process.argv.includes("--audit-only");
  if (!auditOnly && hash(fs.readFileSync(__filename)) !== protocol.sourceCodeSha256)
    throw new Error("Diagnostic source changed after protocol freeze");
  const paired = readChecked(protocol.sources.pairedV25Report);
  const own = readChecked(protocol.sources.ownHistoryReport);
  if (paired.pairedCases.length !== protocol.sources.pairedV25Report.cases
    || own.results.length !== protocol.sources.ownHistoryReport.cases)
    throw new Error("Frozen exposed case set changed");
  const ownByKey = new Map();
  for (const row of own.results) {
    const key = `${row.eventId}\u001f${row.nftAddress}\u001f${row.eventTime}\u001f${row.username}`;
    if (ownByKey.has(key)) throw new Error("Duplicate own-history case");
    ownByKey.set(key, row);
  }
  const { sales, sourceHashes, rejected } = await loadHistoricalSales(undefined, { fingerprint: true });
  if (sourceHashes["dune_username_sales.part"] !== protocol.sources.historicalSales.sha256
    || sourceHashes["tonapi_username_universe.csv"] !== protocol.sources.historicalInventory.sha256
    || sales.length !== 340000) throw new Error("Frozen historical sale source changed");
  const market = buildMarketIndex(sales);
  const rows = addIndexFeatures(paired.pairedCases, ownByKey, market);
  if (ownByKey.size !== rows.length) throw new Error("Case population mismatch");
  const coverage = { attempts: rows.length, own: rows.filter(row => row.raw !== null).length,
    global: rows.filter(row => row.globalAdjusted !== null).length,
    lengthSpecific: rows.filter(row => row.lengthSpecific).length };
  if (auditOnly) {
    console.log(JSON.stringify({ caseSetVerified: true, fitRun: false, evaluatedLabels: false,
      historySales: sales.length, rejected, market: { firstDay: market.firstDay, lastDay: market.lastDay,
        clippedLow: market.clippedLow, clippedHigh: market.clippedHigh }, coverage }, null, 2));
    return;
  }
  const windows = Object.fromEntries(protocol.windows.map(([start, end]) =>
    [`${start}/${end}`, summarize(rows.filter(row => start <= row.eventTime && row.eventTime < end))]));
  const pooled = summarize(rows);
  const premium = rows.filter(row => row.realizedVenue.startsWith("secondary/") && row.actualUsd >= 500
    && ["raw", "globalAdjusted", "lengthAdjusted", "v25", "ownHgb"].every(key => valid(row[key])));
  const uncertainty = { globalAdjusted: bootstrap(premium, "globalAdjusted"),
    lengthAdjusted: bootstrap(premium, "lengthAdjusted") };
  function decision(field) {
    const p = pooled["secondary/premium"].common;
    const o = pooled["secondary/ordinary"].common;
    return p[field].male < p.raw.male && uncertainty[field].lower95 > 0
      && o[field].male <= o.raw.male * 1.05;
  }
  const report = { qualification: false, productionIntegrated: false, reservedLabelsOpened: false,
    protocolSha256: hash(protocolBytes), sourceCodeSha256: hash(fs.readFileSync(__filename)),
    sourceHashes, historySales: sales.length, rejectedSales: rejected,
    marketIndex: { firstDay: market.firstDay, lastDay: market.lastDay,
      clippedLow: market.clippedLow, clippedHigh: market.clippedHigh }, coverage,
    windows, pooled, uncertainty,
    decision: { globalSignalPromising: decision("globalAdjusted"), lengthSignalPromising: decision("lengthAdjusted"),
      productionQualification: false },
    limitations: ["Both historical windows are exposed development data.",
      "This is a point-only signal test; intervals, publication policy and current-market accuracy are unevaluated.",
      "The index uses historical completed sales, not executable bids or an active floor."] };
  const at = process.argv.indexOf("--output");
  if (at < 0 || !process.argv[at + 1]) throw new Error("--output required");
  fs.writeFileSync(path.resolve(process.argv[at + 1]), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ coverage, secondaryPremium: pooled["secondary/premium"],
    secondaryOrdinary: pooled["secondary/ordinary"], uncertainty, decision: report.decision }, null, 2));
}

if (require.main === module) main().catch(error => { console.error(error.stack || error.message); process.exitCode = 1; });
module.exports = { buildMarketIndex, addIndexFeatures, metrics, summarize };

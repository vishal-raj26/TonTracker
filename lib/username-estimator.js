"use strict";

const { USERNAME_ESTIMATOR_VERSION } = require("./username-engine");
const { predictUsernameLearnedModel } = require("./username-learned-model");
const { classifyTelegramUsername } = require("./username-structural");
const { usernameSemanticProfile, usernameSemanticSimilarity } = require("./username-semantic");

const FINALISED_TYPES = new Set(["sale", "completed-sale", "auction-settlement", "auction_settlement", "fixed-sale", "fixed_sale"]);
const DAY_MS = 86_400_000;

function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
function round(value, digits = 2) { const factor = 10 ** digits; return Math.round((value + Number.EPSILON) * factor) / factor; }
function weightedQuantile(values, quantile) {
  const rows = values.filter((row) => Number(row.weight) > 0 && Number.isFinite(Number(row.value))).sort((a, b) => a.value - b.value);
  const total = rows.reduce((sum, row) => sum + row.weight, 0);
  if (!total) return null;
  const target = total * clamp(quantile, 0, 1);
  let carried = 0;
  for (const row of rows) { carried += row.weight; if (carried >= target) return row.value; }
  return rows.at(-1).value;
}
function completedSale(event) {
  const type = String(event?.eventType || event?.type || "").toLocaleLowerCase("en-US");
  const native = String(event?.paymentAsset || event?.currency || "GRAM").toLocaleLowerCase("en-US");
  return FINALISED_TYPES.has(type) && event?.finalized !== false && !event?.cancelled && !event?.reverted
    && !event?.selfSale && !event?.washTrade && ["gram", "ton", "toncoin", "native"].includes(native)
    && Number(event?.priceUsd) > 0;
}
function eventTime(event) {
  const parsed = Date.parse(event.eventTime || event.soldAt || event.timestamp || "");
  return Number.isFinite(parsed) ? parsed : 0;
}
function routeCompatibility(target, candidate) {
  if (target.primaryRoute === candidate.primaryRoute) return 1;
  if (target.routes?.includes(candidate.primaryRoute) || candidate.routes?.includes(target.primaryRoute)) return 0.58;
  if ([target.primaryRoute, candidate.primaryRoute].includes("numeric")) return 0;
  if ([target.primaryRoute, candidate.primaryRoute].includes("short")) return 0.04;
  if (target.characterClass === candidate.characterClass) return 0.18;
  return 0.08;
}
function bigrams(value) {
  const text = String(value || "");
  if (text.length < 2) return new Set(text ? [text] : []);
  return new Set(Array.from({ length: text.length - 1 }, (_, index) => text.slice(index, index + 2)));
}
function lexicalSimilarity(left, right) {
  const a = String(left || "");
  const b = String(right || "");
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aPairs = bigrams(a);
  const bPairs = bigrams(b);
  const overlap = [...aPairs].filter((pair) => bPairs.has(pair)).length;
  const dice = aPairs.size + bPairs.size ? (2 * overlap) / (aPairs.size + bPairs.size) : 0;
  let prefix = 0;
  while (prefix < Math.min(a.length, b.length) && a[prefix] === b[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < Math.min(a.length, b.length) - prefix
    && a[a.length - suffix - 1] === b[b.length - suffix - 1]) suffix += 1;
  const edge = Math.max(prefix, suffix) / Math.max(a.length, b.length);
  const containment = a.includes(b) || b.includes(a) ? Math.min(a.length, b.length) / Math.max(a.length, b.length) : 0;
  return clamp(Math.max(dice, edge, containment), 0, 1);
}
function similarity(target, candidate) {
  if (target.normalizedUsername === candidate.normalizedUsername) return 1;
  const route = routeCompatibility(target, candidate);
  if (!route) return 0;
  const lengthDelta = Math.abs(target.characterLength - candidate.characterLength);
  let score = route * 0.4;
  score += Math.max(0, 0.24 - lengthDelta * 0.055);
  if (target.primaryScript === candidate.primaryScript) score += 0.07;
  if (target.scarcityClass === candidate.scarcityClass) score += 0.1;
  if (target.characterClass === candidate.characterClass) score += 0.06;
  if (target.shapeSignature === candidate.shapeSignature) score += 0.06;
  if (target.patternSignature === candidate.patternSignature) score += 0.05;
  if (target.pronounceability === candidate.pronounceability) score += 0.04;
  if (target.containsUnderscore === candidate.containsUnderscore) score += 0.025;
  if (target.primaryRoute === "numeric") {
    if (lengthDelta) score *= 0.18;
    if (target.leadingZero === candidate.leadingZero) score += 0.025;
    if (target.roundNumber === candidate.roundNumber) score += 0.025;
  }
  if (target.primaryRoute === "short" && lengthDelta) score *= 0.28;
  if (target.primaryRoute === "pattern" && target.patternSignature !== candidate.patternSignature) score *= 0.68;
  const semantic = Math.max(
    clamp(Number(candidate.semanticSimilarity || 0), 0, 1),
    usernameSemanticSimilarity(target, candidate),
  );
  const lexical = lexicalSimilarity(target.normalizedUsername, candidate.normalizedUsername);
  const targetMeaning = usernameSemanticProfile(target);
  const candidateMeaning = usernameSemanticProfile(candidate);
  const targetExactTerms = targetMeaning.exactTerms.map((term) => term.split(":").slice(1).join(":"));
  const candidateTerms = new Set(candidateMeaning.terms.map((term) => term.split(":").slice(1).join(":")));
  const sharesStandaloneConcept = targetExactTerms.some((term) => candidateTerms.has(term));
  // Broad meaning classes are not enough to price a standalone word.
  if (targetExactTerms.length && !sharesStandaloneConcept && lexical < 0.72) return 0;
  if (["word", "residual"].includes(target.primaryRoute) && ["word", "residual"].includes(candidate.primaryRoute)
    && Math.max(lexical, semantic) < 0.32) return 0;
  if (targetMeaning.hasMeaningSignal && semantic < 0.18 && lexical < 0.5) return 0;
  return clamp(score * 0.62 + lexical * 0.3 + semantic * 0.2, 0, 1);
}
function ageWeight(timeMs, nowMs) {
  if (!timeMs) return 0.42;
  return clamp(0.5 ** (Math.max(0, nowMs - timeMs) / DAY_MS / 270), 0.06, 1);
}
function medianLog(rows) {
  return weightedQuantile(rows.map((row) => ({ value: Math.log(row.priceUsd), weight: row.weight || 1 })), 0.5);
}
function marketTrend(sales, target) {
  const cohort = sales.filter((row) => row.candidate.primaryRoute === target.primaryRoute);
  const source = cohort.length >= 10 ? cohort : sales;
  const recent = source.filter((row) => row.ageDays <= 120).map((row) => ({ ...row, weight: row.reliability }));
  const prior = source.filter((row) => row.ageDays > 120 && row.ageDays <= 540).map((row) => ({ ...row, weight: row.reliability }));
  if (recent.length < 4 || prior.length < 4) return { multiplier: 1, direction: "flat", strength: 0, recentCount: recent.length, priorCount: prior.length };
  const support = clamp(Math.min(recent.length, prior.length) / 16, 0, 1);
  const raw = clamp(Math.exp(medianLog(recent) - medianLog(prior)), 0.55, 1.8);
  const multiplier = Math.exp(Math.log(raw) * support);
  return {
    multiplier,
    direction: multiplier > 1.08 ? "up" : multiplier < 0.92 ? "down" : "flat",
    strength: support,
    recentCount: recent.length,
    priorCount: prior.length,
  };
}
function robustify(rows) {
  if (rows.length < 5) return rows;
  const center = weightedQuantile(rows.map((row) => ({ value: Math.log(row.adjustedPriceUsd), weight: row.weight })), 0.5);
  const deviation = weightedQuantile(rows.map((row) => ({ value: Math.abs(Math.log(row.adjustedPriceUsd) - center), weight: row.weight })), 0.5) || 0;
  const limit = Math.max(Math.log(4), deviation * 4.5);
  return rows.map((row) => {
    const distance = Math.abs(Math.log(row.adjustedPriceUsd) - center);
    if (row.exact || distance <= limit) return row;
    return { ...row, weight: row.weight * clamp(limit / distance, 0.08, 1), outlierDiscounted: true };
  });
}
function blendExactAndComparable(exactRows, comparableP50, nowMs) {
  if (!exactRows.length) return comparableP50;
  const exactP50 = Math.exp(weightedQuantile(exactRows.map((row) => ({ value: Math.log(row.adjustedPriceUsd), weight: row.weight })), 0.5));
  const newestAge = Math.min(...exactRows.map((row) => Math.max(0, nowMs - row.timeMs) / DAY_MS));
  const freshness = clamp(0.5 ** (newestAge / 540), 0.25, 1);
  const exactShare = clamp((exactRows.length >= 2 ? 0.82 : 0.62) * freshness, 0.35, 0.9);
  return Math.exp(Math.log(exactP50) * exactShare + Math.log(comparableP50) * (1 - exactShare));
}
function estimateTelegramUsernameValue(targetInput, events = [], options = {}) {
  const target = targetInput?.normalizedUsername ? targetInput : classifyTelegramUsername(targetInput);
  const nowMs = Number(options.nowMs) || Date.now();
  const sales = events.filter(completedSale).map((event) => {
    const timeMs = eventTime(event);
    if (timeMs > nowMs + 60_000) return null;
    let candidate;
    try { candidate = event.classification?.normalizedUsername ? event.classification : classifyTelegramUsername(event.username || event.name || event.normalizedUsername || ""); }
    catch { return null; }
    const reliability = clamp(Number(event.reliabilityScore ?? 1), 0.05, 1);
    return { event, candidate, timeMs, ageDays: timeMs ? Math.max(0, nowMs - timeMs) / DAY_MS : 365, priceUsd: Number(event.priceUsd), reliability };
  }).filter(Boolean);
  const trend = marketTrend(sales, target);
  const learned = predictUsernameLearnedModel(options.learnedModel, target);
  let comparable = sales.map((row) => {
    const exact = target.normalizedUsername === row.candidate.normalizedUsername;
    const structural = similarity(target, row.candidate);
    const trendShare = clamp((row.ageDays - 90) / 450, 0, 1);
    const adjustedPriceUsd = row.priceUsd * Math.exp(Math.log(trend.multiplier) * trendShare);
    return { ...row, exact, structural, adjustedPriceUsd, weight: structural * ageWeight(row.timeMs, nowMs) * (exact ? 2.4 : 1) * row.reliability };
  }).filter((row) => row.exact || row.weight >= 0.17);
  if (comparable.length) {
    const exact = comparable.filter((row) => row.exact);
    const nearest = comparable.filter((row) => !row.exact).sort((a, b) => b.weight - a.weight).slice(0, 80);
    comparable = [...exact, ...nearest];
  }
  if (!comparable.length) {
    if (!learned) return unavailable(target, trend);
    // Feature-only learning is useful first-import context, but it cannot
    // establish a portfolio value for a distinct collectible username.
    const confidenceScore = Math.min(0.34, learned.confidenceScore);
    return {
      status: "indicative", estimatorVersion: USERNAME_ESTIMATOR_VERSION, username: target.normalizedUsername,
      estimateUsd: round(learned.estimateUsd), rangeLowUsd: round(learned.rangeLowUsd), rangeHighUsd: round(learned.rangeHighUsd),
      confidenceScore: round(confidenceScore, 3), confidenceBand: "low", evidenceCount: learned.routeEvidenceCount,
      effectiveCompCount: 0, ownSaleCount: 0, trend, learnedModel: learned, comparables: [],
    };
  }
  comparable = robustify(comparable);
  const logs = comparable.map((row) => ({ value: Math.log(row.adjustedPriceUsd), weight: row.weight }));
  const comparableP50 = Math.exp(weightedQuantile(logs, 0.5));
  const exactRows = comparable.filter((row) => row.exact);
  const weightSum = comparable.reduce((sum, row) => sum + row.weight, 0);
  const effective = weightSum ** 2 / comparable.reduce((sum, row) => sum + row.weight ** 2, 0);
  const evidenceP50 = blendExactAndComparable(exactRows, comparableP50, nowMs);
  const learnedShare = learned ? clamp((8 - effective) / 12, 0.12, exactRows.length ? 0.3 : 0.58) : 0;
  const p50 = learned
    ? Math.exp(Math.log(evidenceP50) * (1 - learnedShare) + Math.log(learned.estimateUsd) * learnedShare)
    : evidenceP50;
  const rawLow = Math.min(Math.exp(weightedQuantile(logs, 0.2)), learned?.rangeLowUsd || Infinity);
  const rawHigh = Math.max(Math.exp(weightedQuantile(logs, 0.8)), learned?.rangeHighUsd || 0);
  const spread = effective < 3 ? 1.9 : effective < 7 ? 1.55 : 1.35;
  const low = Math.min(rawLow, p50 / spread);
  const high = Math.max(rawHigh, p50 * spread);
  const averageSimilarity = comparable.reduce((sum, row) => sum + row.structural * row.weight, 0) / weightSum;
  const confidenceScore = clamp((1 - Math.exp(-effective / 5)) * 0.36 + averageSimilarity * 0.32
    + Math.min(1, exactRows.length / 2) * 0.2 + trend.strength * 0.04 + (learned?.confidenceScore || 0) * 0.08, 0, 1);
  // Broad comparable evidence can describe the market, but one username is
  // not interchangeable with another. Repeated finalized sales of this exact
  // username are required before an estimate may be portfolio-eligible.
  const calibratedConfidence = exactRows.length < 2 ? Math.min(confidenceScore, 0.44) : confidenceScore;
  const confidenceBand = calibratedConfidence >= 0.72 ? "high" : calibratedConfidence >= 0.45 ? "medium" : "low";
  return {
    status: exactRows.length ? "estimated" : "indicative", estimatorVersion: USERNAME_ESTIMATOR_VERSION, username: target.normalizedUsername,
    estimateUsd: round(p50), rangeLowUsd: round(low), rangeHighUsd: round(high), confidenceScore: round(calibratedConfidence, 3), confidenceBand,
    evidenceCount: comparable.length, effectiveCompCount: round(effective, 2), ownSaleCount: exactRows.length,
    trend: { ...trend, multiplier: round(trend.multiplier, 4), strength: round(trend.strength, 3) },
    learnedModel: learned ? { ...learned, estimateUsd: round(learned.estimateUsd), rangeLowUsd: round(learned.rangeLowUsd), rangeHighUsd: round(learned.rangeHighUsd) } : null,
    comparables: comparable.sort((a, b) => b.weight - a.weight).slice(0, 40).map((row) => ({
      eventId: row.event.eventId || row.event.id || null, nftAddress: row.event.nftAddress || null, username: row.candidate.normalizedUsername,
      priceUsd: round(row.priceUsd), adjustedPriceUsd: round(row.adjustedPriceUsd), weight: round(row.weight, 5),
      structuralSimilarity: round(row.structural, 4), exact: row.exact, outlierDiscounted: Boolean(row.outlierDiscounted),
    })),
  };
}
function unavailable(target, trend = {}) { return { status: "unavailable", estimatorVersion: USERNAME_ESTIMATOR_VERSION, username: target.normalizedUsername, estimateUsd: 0, rangeLowUsd: 0, rangeHighUsd: 0, confidenceScore: 0, confidenceBand: "low", evidenceCount: 0, effectiveCompCount: 0, ownSaleCount: 0, trend, comparables: [] }; }

module.exports = { estimateTelegramUsernameValue, completedSale, lexicalSimilarity, similarity, weightedQuantile };

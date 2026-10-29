"use strict";

const { USERNAME_ESTIMATOR_VERSION } = require("./username-engine");
const { predictUsernameLearnedModel } = require("./username-learned-model");
const { classifyTelegramUsername } = require("./username-structural");
const { usernameSemanticProfile, usernameSemanticSimilarity } = require("./username-semantic");
const { usableUsernameKnowledge } = require("./username-knowledge");

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
    && event?.isFinalized !== false && !event?.isCancelled
    && Number(event?.reliabilityScore ?? 1) > 0
    && Number.isFinite(Number(event?.reliabilityScore ?? 1))
    && Number.isFinite(Number(event?.priceUsd)) && Number(event?.priceUsd) > 0;
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
function knowledgeTerms(input) {
  const knowledge = input?.knowledge || input?.semantic || {};
  return new Set((Array.isArray(knowledge.relatedTerms) ? knowledge.relatedTerms : [])
    .map((term) => String(term || "").toLowerCase().replace(/[^a-z0-9_]/g, ""))
    .filter(Boolean));
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
  const targetKnowledge = knowledgeTerms(target);
  const candidateKnowledge = knowledgeTerms(candidate);
  const semanticNeighbor = targetKnowledge.has(candidate.normalizedUsername)
    || candidateKnowledge.has(target.normalizedUsername)
    || [...targetKnowledge].some((term) => candidateKnowledge.has(term));
  const targetMeaning = usernameSemanticProfile(target);
  const candidateMeaning = usernameSemanticProfile(candidate);
  const targetExactTerms = targetMeaning.exactTerms.map((term) => term.split(":").slice(1).join(":"));
  const candidateTerms = new Set(candidateMeaning.terms.map((term) => term.split(":").slice(1).join(":")));
  const sharesStandaloneConcept = targetExactTerms.some((term) => candidateTerms.has(term));
  // Broad meaning classes are not enough to price a standalone word.
  if (targetExactTerms.length && !sharesStandaloneConcept && !semanticNeighbor && lexical < 0.72) return 0;
  if (["word", "residual"].includes(target.primaryRoute) && ["word", "residual"].includes(candidate.primaryRoute)
    && Math.max(lexical, semantic, semanticNeighbor ? 0.72 : 0) < 0.32) return 0;
  if (targetMeaning.hasMeaningSignal && !semanticNeighbor && semantic < 0.18 && lexical < 0.5) return 0;
  return clamp(score * 0.58 + lexical * 0.26 + semantic * 0.18 + Number(semanticNeighbor) * 0.38, 0, 1);
}
function ageWeight(timeMs, nowMs) {
  if (!timeMs) return 0.42;
  return clamp(0.5 ** (Math.max(0, nowMs - timeMs) / DAY_MS / 270), 0.06, 1);
}
function medianLog(rows) {
  return weightedQuantile(rows.map((row) => ({ value: Math.log(row.priceUsd), weight: row.weight || 1 })), 0.5);
}
function marketTrend(sales, target) {
  const identities = new Map();
  for (const row of sales) {
    if (row.candidate.primaryRoute !== target.primaryRoute || row.candidate.normalizedUsername === target.normalizedUsername) continue;
    const rows = identities.get(row.candidate.normalizedUsername) || [];
    rows.push(row);
    identities.set(row.candidate.normalizedUsername, rows);
  }
  const pairs = [];
  for (const rows of identities.values()) {
    const recent = rows.filter((row) => row.ageDays <= 120).sort((a, b) => b.timeMs - a.timeMs)[0];
    const prior = rows.filter((row) => row.ageDays > 120 && row.ageDays <= 540).sort((a, b) => b.timeMs - a.timeMs)[0];
    if (recent && prior) pairs.push({ value: Math.log(recent.priceUsd / prior.priceUsd), weight: Math.min(recent.reliability, prior.reliability) });
  }
  // Require independent repeat-sale identities; different sold-name mixes are
  // not evidence of market appreciation. Sparse samples stay unadjusted.
  if (pairs.length < 8) return { multiplier: 1, direction: "flat", strength: 0, recentCount: pairs.length, priorCount: pairs.length, method: "insufficient-repeat-sales" };
  const center = weightedQuantile(pairs, 0.5);
  const q25 = weightedQuantile(pairs, 0.25);
  const q75 = weightedQuantile(pairs, 0.75);
  if (q25 <= 0 && q75 >= 0) return { multiplier: 1, direction: "flat", strength: 0, recentCount: pairs.length, priorCount: pairs.length, method: "disagreeing-repeat-sales" };
  const support = pairs.length / (pairs.length + 16);
  const multiplier = Math.exp(clamp(center, Math.log(0.5), Math.log(2)) * support);
  return {
    multiplier,
    direction: multiplier > 1.08 ? "up" : multiplier < 0.92 ? "down" : "flat",
    strength: support,
    recentCount: pairs.length,
    priorCount: pairs.length,
    method: "repeat-sale-median",
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
  const averageReliability = exactRows.reduce((sum, row) => sum + row.reliability, 0) / exactRows.length;
  // A completed sale of this exact collectible is stronger evidence than a
  // broad structural cohort. Keep it dominant while it is fresh, but allow
  // old evidence to decay back toward the comparable market.
  const baseExactShare = exactRows.length >= 2 ? 0.9 : 0.78 + clamp(averageReliability, 0, 1) * 0.12;
  const exactShare = clamp(baseExactShare * freshness, 0.35, 0.92);
  return Math.exp(Math.log(exactP50) * exactShare + Math.log(comparableP50) * (1 - exactShare));
}
function latestExactAnchor(exactRows, trend) {
  if (!exactRows.length) return null;
  const latest = [...exactRows].sort((left, right) => right.timeMs - left.timeMs)[0];
  const marketShare = clamp((latest.ageDays - 90) / 450, 0, 1);
  const marketAdjustedUsd = latest.adjustedPriceUsd;
  return {
    eventId: latest.event.eventId || latest.event.id || null,
    soldAt: latest.event.eventTime || latest.event.soldAt || latest.event.timestamp || null,
    priceUsd: latest.priceUsd,
    marketAdjustedUsd,
    marketShare,
  };
}
function estimateTelegramUsernameValue(targetInput, events = [], options = {}) {
  const targetSource = targetInput?.normalizedUsername ? targetInput : classifyTelegramUsername(targetInput);
  const target = { ...targetSource, knowledge: usableUsernameKnowledge(targetSource.knowledge || targetSource.semantic || {}) };
  const nowMs = Number(options.nowMs) || Date.now();
  const seen = new Set();
  // Provider response order must not decide which provenance survives the
  // economic-event deduplication below. Sorting a filtered copy preserves input.
  const sales = events.filter(completedSale)
    .sort((a, b) => Number(b.reliabilityScore ?? 1) - Number(a.reliabilityScore ?? 1)).map((event) => {
    const timeMs = eventTime(event);
    if (!timeMs || timeMs > nowMs) return null;
    let candidate;
    try { candidate = event.classification?.normalizedUsername ? { ...event.classification } : classifyTelegramUsername(event.username || event.name || event.normalizedUsername || ""); }
    catch { return null; }
    const identity = `${candidate.normalizedUsername}|${timeMs}|${Number(event.priceUsd)}`;
    if (seen.has(identity)) return null;
    seen.add(identity);
    let knowledge = event.knowledge || event.semantic || event.semantic_json || {};
    if (typeof knowledge === "string") { try { knowledge = JSON.parse(knowledge); } catch { knowledge = {}; } }
    candidate.knowledge = usableUsernameKnowledge(candidate.knowledge || knowledge);
    const reliability = clamp(Number(event.reliabilityScore ?? 1), 0.05, 1);
    return { event, candidate, timeMs, ageDays: timeMs ? Math.max(0, nowMs - timeMs) / DAY_MS : 365, priceUsd: Number(event.priceUsd), reliability };
  }).filter(Boolean);
  const trend = marketTrend(sales, target);
  const learned = Date.parse(options.learnedModel?.trainedAt || "") > nowMs ? null
    : predictUsernameLearnedModel(options.learnedModel, target);
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
    // A broad regression can extrapolate outside its observed cohort. Without
    // direct comps require the same support already used for cohort blending;
    // route-level volume alone does not justify an unrelated numeric price.
    if (learned.cohortEvidenceCount < 8 && learned.knowledgeCohortEvidenceCount < 12) {
      return { ...unavailable(target, trend), reason: "unsupported-model-cohort" };
    }
    const confidenceScore = Math.min(0.54, learned.confidenceScore);
    return {
      status: "estimated", estimatorVersion: USERNAME_ESTIMATOR_VERSION, username: target.normalizedUsername,
      estimateUsd: round(learned.estimateUsd), rangeLowUsd: round(learned.rangeLowUsd), rangeHighUsd: round(learned.rangeHighUsd),
      confidenceScore: round(confidenceScore, 3), confidenceBand: "low", evidenceCount: learned.routeEvidenceCount,
      effectiveCompCount: 0, ownSaleCount: 0, trend, learnedModel: learned, comparables: [],
    };
  }
  comparable = robustify(comparable);
  const logs = comparable.map((row) => ({ value: Math.log(row.adjustedPriceUsd), weight: row.weight }));
  const exactRows = comparable.filter((row) => row.exact);
  const otherRows = comparable.filter((row) => !row.exact);
  const comparableP50 = Math.exp(weightedQuantile((otherRows.length ? otherRows : exactRows)
    .map((row) => ({ value: Math.log(row.adjustedPriceUsd), weight: row.weight })), 0.5));
  const weightSum = comparable.reduce((sum, row) => sum + row.weight, 0);
  const effective = weightSum ** 2 / comparable.reduce((sum, row) => sum + row.weight ** 2, 0);
  const evidenceP50 = blendExactAndComparable(exactRows, comparableP50, nowMs);
  const evidenceShare = exactRows.length ? 0 : clamp((8 - effective) / 12, 0.12, 0.58);
  const premiumShare = learned && !exactRows.length
    ? clamp(0.35 + Number(learned.premiumProbability || 0) * 1.5, 0.35, 0.78)
    : 0;
  const learnedShare = learned ? Math.max(evidenceShare, premiumShare) : 0;
  let p50 = learned
    ? Math.exp(Math.log(evidenceP50) * (1 - learnedShare) + Math.log(learned.estimateUsd) * learnedShare)
    : evidenceP50;
  const lastSaleAnchor = latestExactAnchor(exactRows, trend);
  // Own history already contributes through the recency-weighted evidence
  // blend. Applying it again as a floor double-counts it and prevents losses.
  const rawLow = Math.min(Math.exp(weightedQuantile(logs, 0.2)), learned?.rangeLowUsd || Infinity);
  const rawHigh = Math.max(Math.exp(weightedQuantile(logs, 0.8)), learned?.rangeHighUsd || 0);
  const spread = effective < 3 ? 1.9 : effective < 7 ? 1.55 : 1.35;
  const low = Math.min(rawLow, p50 / spread);
  const high = Math.max(rawHigh, p50 * spread);
  const averageSimilarity = comparable.reduce((sum, row) => sum + row.structural * row.weight, 0) / weightSum;
  const meanReliability = comparable.reduce((sum, row) => sum + row.reliability * row.weight, 0) / weightSum;
  const freshness = comparable.reduce((sum, row) => sum + ageWeight(row.timeMs, nowMs) * row.weight, 0) / weightSum;
  const dispersion = weightedQuantile(logs.map((row) => ({ value: Math.abs(row.value - Math.log(p50)), weight: row.weight })), 0.5);
  // Evidence quality, not a probability that the asking price will be achieved.
  // Each factor is observable; stale or unreliable repeated evidence cannot
  // produce high confidence merely through its row count.
  const confidenceScore = meanReliability * freshness * averageSimilarity
    * (effective / (effective + 3)) / (1 + dispersion);
  // Sparse own history remains low-confidence; portfolio display eligibility
  // is a separate product decision in the runtime.
  const calibratedConfidence = exactRows.length < 2 ? Math.min(confidenceScore, 0.44) : confidenceScore;
  const confidenceBand = calibratedConfidence >= 0.72 ? "high" : calibratedConfidence >= 0.45 ? "medium" : "low";
  return {
    status: exactRows.length ? "estimated" : "indicative", estimatorVersion: USERNAME_ESTIMATOR_VERSION, username: target.normalizedUsername,
    estimateUsd: round(p50), rangeLowUsd: round(low), rangeHighUsd: round(high), confidenceScore: round(calibratedConfidence, 3), confidenceBand,
    evidenceCount: comparable.length, effectiveCompCount: round(effective, 2), ownSaleCount: exactRows.length,
    confidenceBasis: { method: "evidence-quality", reliability: round(meanReliability, 3), freshness: round(freshness, 3),
      similarity: round(averageSimilarity, 3), effectiveObservations: round(effective, 2), logDispersion: round(dispersion, 3),
      probabilityInterpretation: false },
    lastSaleAnchor: lastSaleAnchor ? {
      ...lastSaleAnchor,
      priceUsd: round(lastSaleAnchor.priceUsd),
      marketAdjustedUsd: round(lastSaleAnchor.marketAdjustedUsd),
      marketShare: round(lastSaleAnchor.marketShare, 4),
    } : null,
    trend: { ...trend, multiplier: round(trend.multiplier, 4), strength: round(trend.strength, 3) },
    learnedModel: learned ? { ...learned, estimateUsd: round(learned.estimateUsd), rangeLowUsd: round(learned.rangeLowUsd), rangeHighUsd: round(learned.rangeHighUsd) } : null,
    comparables: comparable.sort((a, b) => b.weight - a.weight).slice(0, 40).map((row) => ({
      eventId: row.event.eventId || row.event.id || null, nftAddress: row.event.nftAddress || null, username: row.candidate.normalizedUsername,
      priceUsd: round(row.priceUsd), adjustedPriceUsd: round(row.adjustedPriceUsd), weight: round(row.weight, 5),
      structuralSimilarity: round(row.structural, 4), exact: row.exact, outlierDiscounted: Boolean(row.outlierDiscounted),
      soldAt: new Date(row.timeMs).toISOString(), marketplace: row.event.marketplace || null,
      sourceUrl: row.event.sourceUrl || row.event.source_url || null,
      reliability: row.reliability,
      reasons: row.exact ? ["own completed sale"] : [
        ...(usernameSemanticSimilarity(target, row.candidate) > 0 ? ["shared semantic terms or category"] : []),
        ...(lexicalSimilarity(target.normalizedUsername, row.candidate.normalizedUsername) >= 0.5 ? ["shared word structure"] : []),
        ...(target.primaryRoute === row.candidate.primaryRoute ? [`same ${target.primaryRoute} category`] : []),
      ],
    })),
  };
}
function unavailable(target, trend = {}) { return { status: "unavailable", estimatorVersion: USERNAME_ESTIMATOR_VERSION, username: target.normalizedUsername, estimateUsd: 0, rangeLowUsd: 0, rangeHighUsd: 0, confidenceScore: 0, confidenceBand: "low", evidenceCount: 0, effectiveCompCount: 0, ownSaleCount: 0, trend, comparables: [] }; }

module.exports = { estimateTelegramUsernameValue, completedSale, lexicalSimilarity, similarity, weightedQuantile };

"use strict";

const {
  ROUTES,
  classifyTonDns,
  scoreStructuralSimilarity,
} = require("./dns-structural");
const { DNS_ESTIMATOR_VERSION } = require("./dns-engine");

const COMPLETED_EVENT_TYPES = new Set([
  "auction-settlement",
  "auction_settlement",
  "completed-sale",
  "completed_sale",
  "fixed-sale",
  "fixed_sale",
  "sale",
]);

const COMPLETED_STATUSES = new Set(["complete", "completed", "final", "finalized", "settled", "sold"]);
const FATAL_QUALITY_FLAGS = new Set([
  "cancelled",
  "currency-mismatch",
  "duplicate",
  "failed",
  "reverted",
  "self-sale",
  "unsupported-contract",
  "wash-trade",
]);

// Number and short-letter names can be compared from structure. For textual
// labels, spelling similarity is useful for candidate discovery, but it is not
// sufficient price evidence: "blockchain" and "theblockhain" may be related,
// while countless other near spellings are not interchangeable assets.
const STRUCTURE_LED_ROUTES = new Set([
  ROUTES.NUMERIC,
  ROUTES.SHORT_LETTERS,
]);

const ROUTE_COMPATIBILITY = Object.freeze({
  [ROUTES.NUMERIC]: {
    [ROUTES.NUMERIC]: 1,
  },
  [ROUTES.SHORT_LETTERS]: {
    [ROUTES.SHORT_LETTERS]: 1,
    [ROUTES.ACRONYM]: 0.72,
    [ROUTES.ENTITY]: 0.52,
  },
  [ROUTES.ALPHANUMERIC]: {
    [ROUTES.ALPHANUMERIC]: 1,
    [ROUTES.PATTERN]: 0.55,
    [ROUTES.CRYPTO_TON]: 0.48,
  },
  [ROUTES.DICTIONARY_COMPOUND]: {
    [ROUTES.DICTIONARY_COMPOUND]: 1,
    [ROUTES.ENTITY]: 0.78,
    [ROUTES.CRYPTO_TON]: 0.74,
    [ROUTES.INVENTED_BRANDABLE]: 0.52,
  },
  [ROUTES.ACRONYM]: {
    [ROUTES.ACRONYM]: 1,
    [ROUTES.SHORT_LETTERS]: 0.86,
    [ROUTES.ENTITY]: 0.7,
    [ROUTES.DICTIONARY_COMPOUND]: 0.48,
  },
  [ROUTES.ENTITY]: {
    [ROUTES.ENTITY]: 1,
    [ROUTES.DICTIONARY_COMPOUND]: 0.8,
    [ROUTES.ACRONYM]: 0.68,
    [ROUTES.CRYPTO_TON]: 0.62,
  },
  [ROUTES.CRYPTO_TON]: {
    [ROUTES.CRYPTO_TON]: 1,
    [ROUTES.DICTIONARY_COMPOUND]: 0.76,
    [ROUTES.ENTITY]: 0.62,
    [ROUTES.INVENTED_BRANDABLE]: 0.5,
  },
  [ROUTES.INVENTED_BRANDABLE]: {
    [ROUTES.INVENTED_BRANDABLE]: 1,
    [ROUTES.DICTIONARY_COMPOUND]: 0.6,
    [ROUTES.CRYPTO_TON]: 0.52,
    [ROUTES.RESIDUAL]: 0.48,
  },
  [ROUTES.MULTILINGUAL]: {
    [ROUTES.MULTILINGUAL]: 1,
    [ROUTES.ENTITY]: 0.55,
    [ROUTES.DICTIONARY_COMPOUND]: 0.48,
  },
  [ROUTES.PATTERN]: {
    [ROUTES.PATTERN]: 1,
    [ROUTES.NUMERIC]: 0.62,
    [ROUTES.ALPHANUMERIC]: 0.6,
    [ROUTES.SHORT_LETTERS]: 0.48,
  },
  [ROUTES.UNUSUAL_VALID]: {
    [ROUTES.UNUSUAL_VALID]: 1,
    [ROUTES.MULTILINGUAL]: 0.45,
    [ROUTES.PATTERN]: 0.42,
    [ROUTES.RESIDUAL]: 0.35,
  },
  [ROUTES.RESIDUAL]: {
    [ROUTES.RESIDUAL]: 1,
    [ROUTES.INVENTED_BRANDABLE]: 0.52,
    [ROUTES.DICTIONARY_COMPOUND]: 0.38,
    [ROUTES.UNUSUAL_VALID]: 0.3,
  },
});

function estimateTonDnsValue(targetInput, comparableEvents = [], marketSignals = {}, options = {}) {
  const target = coerceClassification(targetInput, options.classificationOptions);
  if (!target) throw new TypeError("A target TON DNS name or classification is required");

  const nowMs = parseTime(options.now) ?? Date.now();
  const minimumComparableScore = finiteOr(options.minimumComparableScore, 0.08);
  const scoredSales = [];

  for (const event of Array.isArray(comparableEvents) ? comparableEvents : []) {
    if (!isCompletedSale(event)) continue;
    const priceGram = eventPriceGram(event);
    if (!(priceGram > 0)) continue;
    const score = scoreComparable(target, event, {
      ...options,
      now: nowMs,
    });
    if (!(score.weight >= minimumComparableScore)) continue;
    scoredSales.push({
      event,
      priceGram,
      logPrice: Math.log(priceGram),
      ...score,
    });
  }

  if (!scoredSales.length) {
    return indicativeBaselineResult(target, options.marketBaseline, marketSignals)
      || unavailableResult(target, comparableEvents, marketSignals);
  }

  scoredSales.sort((left, right) => {
    if (left.priceGram !== right.priceGram) return left.priceGram - right.priceGram;
    return String(left.event.eventId || left.event.txHash || left.classification.normalizedDomain)
      .localeCompare(String(right.event.eventId || right.event.txHash || right.classification.normalizedDomain));
  });

  const weightedLogs = scoredSales.map((sale) => ({ value: sale.logPrice, weight: sale.weight }));
  const midpointGram = Math.exp(weightedQuantile(weightedLogs, 0.5));
  const effectiveCompCount = effectiveSampleSize(scoredSales.map((sale) => sale.weight));
  const averageSimilarity = weightedAverage(scoredSales, (sale) => sale.comparableSimilarity);
  const averageRecency = weightedAverage(scoredSales, (sale) => sale.recencyWeight);
  const averageQuality = weightedAverage(scoredSales, (sale) => sale.qualityWeight);
  const ownSaleCount = scoredSales.filter((sale) => sale.exactDomain).length;

  let lowGram = Math.exp(weightedQuantile(weightedLogs, 0.2));
  let highGram = Math.exp(weightedQuantile(weightedLogs, 0.8));
  const uncertaintyFactor = rangeExpansionFactor(target.primaryRoute, effectiveCompCount);
  lowGram = Math.min(lowGram, midpointGram / uncertaintyFactor);
  highGram = Math.max(highGram, midpointGram * uncertaintyFactor);

  const baseLowGram = lowGram;
  const baseHighGram = highGram;
  const signals = collectMarketSignals(comparableEvents, marketSignals);
  ({ lowGram, highGram } = applyBoundedSignals({
    midpointGram,
    lowGram,
    highGram,
    bids: signals.bids,
    asks: signals.asks,
  }));

  const logSpread = Math.max(0, Math.log(highGram) - Math.log(lowGram));
  const confidence = confidenceFor({
    target,
    effectiveCompCount,
    averageSimilarity,
    averageRecency,
    averageQuality,
    ownSaleCount,
    logSpread,
  });

  const roundedMidpoint = roundGram(midpointGram);
  const roundedLow = roundGram(Math.min(lowGram, midpointGram));
  const roundedHigh = roundGram(Math.max(highGram, midpointGram));

  return {
    status: "estimated",
    estimatorVersion: DNS_ESTIMATOR_VERSION,
    domain: target.normalizedDomain,
    route: target.primaryRoute,
    midpointGram: roundedMidpoint,
    estimateGram: roundedMidpoint,
    range: {
      lowGram: roundedLow,
      highGram: roundedHigh,
    },
    rangeLowGram: roundedLow,
    rangeHighGram: roundedHigh,
    confidence,
    confidenceScore: confidence.score,
    confidenceBand: confidence.band,
    evidenceCount: scoredSales.length,
    completedSaleCount: scoredSales.length,
    effectiveCompCount: round(effectiveCompCount, 2),
    ownSaleCount,
    signalCounts: {
      asks: signals.asks.length,
      bids: signals.bids.length,
    },
    boundedSignals: {
      changedLowerRange: lowGram > baseLowGram,
      changedUpperRange: highGram !== baseHighGram,
    },
    comparables: scoredSales.map((sale) => ({
      domain: sale.classification.normalizedDomain,
      priceGram: roundGram(sale.priceGram),
      weight: round(sale.weight, 6),
      routeCompatibility: round(sale.routeCompatibility, 4),
      structuralSimilarity: round(sale.structuralSimilarity, 4),
      semanticSimilarity: round(sale.semanticSimilarity, 4),
      exactDomain: sale.exactDomain,
      eventId: sale.event.eventId || sale.event.txHash || null,
    })),
  };
}

function indicativeBaselineResult(target, baseline, marketSignals) {
  if (!baseline || baseline.verifiedSalesOnly !== true) return null;
  const midpointGram = finiteOr(baseline.midpointGram, 0);
  const evidenceCount = Math.max(0, Math.round(finiteOr(baseline.evidenceCount, 0)));
  if (!(midpointGram > 0) || !evidenceCount) return null;
  const expansion = target.primaryRoute === ROUTES.RESIDUAL || target.primaryRoute === ROUTES.UNUSUAL_VALID
    ? 3.4
    : 3;
  const lowGram = Math.min(
    finiteOr(baseline.rangeLowGram, midpointGram / expansion),
    midpointGram / expansion,
  );
  const highGram = Math.max(
    finiteOr(baseline.rangeHighGram, midpointGram * expansion),
    midpointGram * expansion,
  );
  const effectiveCompCount = finiteOr(baseline.effectiveCompCount, evidenceCount);
  const confidenceScore = round(Math.min(0.34, 0.12 + (0.04 * Math.log1p(effectiveCompCount))), 3);
  const signals = collectMarketSignals([], marketSignals);

  return {
    status: "indicative",
    estimatorVersion: DNS_ESTIMATOR_VERSION,
    domain: target.normalizedDomain,
    route: target.primaryRoute,
    midpointGram: roundGram(midpointGram),
    estimateGram: roundGram(midpointGram),
    range: {
      lowGram: roundGram(lowGram),
      highGram: roundGram(highGram),
    },
    rangeLowGram: roundGram(lowGram),
    rangeHighGram: roundGram(highGram),
    confidence: { score: confidenceScore, band: "low" },
    confidenceScore,
    confidenceBand: "low",
    evidenceCount,
    completedSaleCount: evidenceCount,
    effectiveCompCount: round(effectiveCompCount, 2),
    ownSaleCount: 0,
    signalCounts: { asks: signals.asks.length, bids: signals.bids.length },
    boundedSignals: { changedLowerRange: false, changedUpperRange: false },
    comparables: [],
    provenance: String(baseline.provenance || `${baseline.scope || "market"}-verified-sales-baseline`),
  };
}

function scoreComparable(targetInput, comparable, options = {}) {
  const target = coerceClassification(targetInput, options.classificationOptions);
  const classification = coerceClassification(
    comparable && (comparable.classification || comparable.features || comparable.domain || comparable.name),
    options.classificationOptions,
  );
  if (!target || !classification) return emptyComparableScore(classification);

  const routeCompatibility = routeCompatibilityFor(target, classification);
  const structuralSimilarity = scoreStructuralSimilarity(target, classification);
  const exactDomain = target.normalizedDomain === classification.normalizedDomain;
  const lexicalSimilarity = lexicalSimilarityFor(target, classification);
  // A semantic score is accepted only when a caller has supplied it from a
  // verified semantic source. Never manufacture one from route overlap.
  const explicitSemanticSimilarity = Number.isFinite(Number(comparable?.semanticSimilarity))
    ? clamp(Number(comparable.semanticSimilarity), 0, 1)
    : null;
  const semanticSimilarity = explicitSemanticSimilarity ?? lexicalSimilarity;
  const textLed = !STRUCTURE_LED_ROUTES.has(target.primaryRoute);
  // A textual DNS can borrow a sale only from its own history, unless a
  // separate verified semantic system explicitly attests to a strong relation.
  // Do not turn character overlap into a financial claim.
  const hasVerifiedTextEvidence = exactDomain || explicitSemanticSimilarity >= 0.72;
  if (textLed && !hasVerifiedTextEvidence) {
    return emptyComparableScore(classification, {
      routeCompatibility,
      structuralSimilarity,
      lexicalSimilarity,
      semanticSimilarity,
      exactDomain,
    });
  }
  const structuralWeight = structuralWeightFor(target.primaryRoute);
  const comparableSimilarity = clamp(
    (structuralSimilarity * structuralWeight)
      + (semanticSimilarity * (1 - structuralWeight)),
    0,
    1,
  );
  const recencyWeight = recencyWeightFor(comparable, options);
  const qualityWeight = qualityWeightFor(comparable);
  const liquidityWeight = clamp(finiteOr(comparable.liquidityWeight, 1), 0.1, 1.5);
  const exactDomainBoost = exactDomain ? 1.35 : 1;
  const weight = routeCompatibility
    * comparableSimilarity
    * recencyWeight
    * qualityWeight
    * liquidityWeight
    * exactDomainBoost;

  return {
    classification,
    exactDomain,
    routeCompatibility,
    structuralSimilarity,
    lexicalSimilarity,
    semanticSimilarity,
    comparableSimilarity,
    recencyWeight,
    qualityWeight,
    liquidityWeight,
    weight: Number.isFinite(weight) ? Math.max(0, weight) : 0,
  };
}

function routeCompatibilityFor(target, comparable) {
  const direct = ROUTE_COMPATIBILITY[target.primaryRoute]?.[comparable.primaryRoute];
  let compatibility = Number.isFinite(direct) ? direct : 0.18;

  const targetRoutes = target.routes || [target.primaryRoute];
  const comparableRoutes = comparable.routes || [comparable.primaryRoute];
  for (const targetRoute of targetRoutes) {
    for (const comparableRoute of comparableRoutes) {
      compatibility = Math.max(
        compatibility,
        ROUTE_COMPATIBILITY[targetRoute]?.[comparableRoute] || 0,
      );
    }
  }

  if (target.primaryRoute === ROUTES.NUMERIC && comparable.primaryRoute !== ROUTES.NUMERIC) return 0;
  if (target.primaryRoute === ROUTES.NUMERIC && target.characterLength !== comparable.characterLength) {
    compatibility *= Math.max(0.15, 1 - (Math.abs(target.characterLength - comparable.characterLength) * 0.35));
  }
  if (target.primaryRoute === ROUTES.SHORT_LETTERS && target.characterLength !== comparable.characterLength) {
    compatibility *= 0.35;
  }
  if (target.primaryRoute === ROUTES.MULTILINGUAL) {
    const targetScripts = new Set(target.scripts || []);
    const hasSharedScript = (comparable.scripts || []).some((script) => targetScripts.has(script));
    if (!hasSharedScript) compatibility *= 0.25;
  }
  return clamp(compatibility, 0, 1);
}

function lexicalSimilarityFor(target, comparable) {
  const left = dnsLabel(target);
  const right = dnsLabel(comparable);
  if (!left || !right) return 0;
  if (left === right) return 1;

  const longest = Math.max(left.length, right.length);
  const editSimilarity = longest ? 1 - (levenshteinDistance(left, right) / longest) : 0;
  const diceSimilarity = bigramDiceSimilarity(left, right);
  const containsSimilarity = left.length >= 4 && right.length >= 4
    && (left.includes(right) || right.includes(left))
    ? Math.min(left.length, right.length) / longest
    : 0;
  return clamp(Math.max(editSimilarity, diceSimilarity, containsSimilarity), 0, 1);
}

function dnsLabel(classification) {
  return String(classification?.normalizedDomain || "")
    .toLocaleLowerCase("und")
    .replace(/\.ton$/u, "");
}

function bigramDiceSimilarity(left, right) {
  if (left.length < 2 || right.length < 2) return 0;
  const leftBigrams = new Map();
  for (let index = 0; index < left.length - 1; index += 1) {
    const gram = left.slice(index, index + 2);
    leftBigrams.set(gram, (leftBigrams.get(gram) || 0) + 1);
  }
  let intersection = 0;
  for (let index = 0; index < right.length - 1; index += 1) {
    const gram = right.slice(index, index + 2);
    const count = leftBigrams.get(gram) || 0;
    if (count) {
      intersection += 1;
      leftBigrams.set(gram, count - 1);
    }
  }
  return (2 * intersection) / ((left.length - 1) + (right.length - 1));
}

function levenshteinDistance(left, right) {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution = previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      current[rightIndex] = Math.min(
        previous[rightIndex] + 1,
        current[rightIndex - 1] + 1,
        substitution,
      );
    }
    previous = current;
  }
  return previous[right.length];
}

function structuralWeightFor(route) {
  if (route === ROUTES.NUMERIC || route === ROUTES.SHORT_LETTERS || route === ROUTES.PATTERN) return 0.82;
  if (route === ROUTES.ALPHANUMERIC || route === ROUTES.MULTILINGUAL) return 0.68;
  return 0.56;
}

function isCompletedSale(event) {
  if (!event || typeof event !== "object") return false;
  if (event.completed === false || event.isComplete === false || event.cancelled || event.reverted) return false;
  if (hasFatalQualityFlag(event)) return false;
  if (!hasNativePayment(event)) return false;

  const type = String(event.eventType || event.type || "").trim().toLocaleLowerCase("en-US");
  if (!COMPLETED_EVENT_TYPES.has(type)) return false;
  const status = String(event.status || "").trim().toLocaleLowerCase("en-US");
  return event.completed === true
    || event.isComplete === true
    || event.finalized === true
    || COMPLETED_STATUSES.has(status);
}

function hasNativePayment(event) {
  const payment = event.paymentAsset || event.currency || event.currencyType || event.currency_type;
  if (payment === undefined || payment === null || payment === "") return true;
  const normalized = String(payment).trim().toLocaleLowerCase("en-US");
  return normalized === "gram" || normalized === "native" || normalized === "ton" || normalized === "toncoin";
}

function hasFatalQualityFlag(event) {
  const flags = Array.isArray(event.qualityFlags)
    ? event.qualityFlags
    : event.qualityFlags && typeof event.qualityFlags === "object"
      ? Object.keys(event.qualityFlags).filter((key) => event.qualityFlags[key])
      : [];
  return flags.some((flag) => FATAL_QUALITY_FLAGS.has(String(flag).toLocaleLowerCase("en-US")));
}

function qualityWeightFor(event) {
  if (hasFatalQualityFlag(event)) return 0;
  let weight = clamp(finiteOr(event.qualityScore, 1), 0, 1);
  if (!parseTime(event.eventTime || event.timestamp || event.soldAt || event.time)) weight *= 0.72;
  if (event.verified === false) weight *= 0.55;
  return weight;
}

function recencyWeightFor(event, options) {
  const eventMs = parseTime(event.eventTime || event.timestamp || event.soldAt || event.time);
  if (eventMs === null) return 0.62;
  const nowMs = parseTime(options.now) ?? Date.now();
  const ageDays = Math.max(0, (nowMs - eventMs) / 86_400_000);
  const halfLifeDays = Math.max(1, finiteOr(options.halfLifeDays, 240));
  return clamp(Math.pow(0.5, ageDays / halfLifeDays), 0.08, 1);
}

function eventPriceGram(event) {
  const candidates = [
    event.priceGram,
    event.salePriceGram,
    event.amountGram,
    event.price_gram,
    event.price,
  ];
  for (const candidate of candidates) {
    const number = Number(candidate);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
}

function weightedMedian(entries) {
  return weightedQuantile(entries, 0.5);
}

function weightedQuantile(entries, quantile) {
  if (!Array.isArray(entries) || !entries.length) return null;
  const normalized = entries
    .map((entry) => typeof entry === "number" ? { value: entry, weight: 1 } : entry)
    .filter((entry) => Number.isFinite(entry?.value) && Number.isFinite(entry?.weight) && entry.weight > 0)
    .sort((left, right) => left.value - right.value);
  if (!normalized.length) return null;

  const q = clamp(Number(quantile), 0, 1);
  const totalWeight = normalized.reduce((sum, entry) => sum + entry.weight, 0);
  const targetWeight = totalWeight * q;
  let cumulative = 0;
  for (const entry of normalized) {
    cumulative += entry.weight;
    if (cumulative >= targetWeight) return entry.value;
  }
  return normalized[normalized.length - 1].value;
}

function effectiveSampleSize(weights) {
  const valid = weights.filter((weight) => Number.isFinite(weight) && weight > 0);
  const sum = valid.reduce((total, weight) => total + weight, 0);
  const squareSum = valid.reduce((total, weight) => total + (weight * weight), 0);
  return squareSum > 0 ? (sum * sum) / squareSum : 0;
}

function weightedAverage(entries, selector) {
  const totalWeight = entries.reduce((sum, entry) => sum + entry.weight, 0);
  if (!(totalWeight > 0)) return 0;
  return entries.reduce((sum, entry) => sum + (selector(entry) * entry.weight), 0) / totalWeight;
}

function rangeExpansionFactor(route, effectiveCompCount) {
  let factor = effectiveCompCount < 1.5
    ? 1.9
    : effectiveCompCount < 3
      ? 1.62
      : effectiveCompCount < 6
        ? 1.38
        : 1.24;

  if (route === ROUTES.RESIDUAL || route === ROUTES.UNUSUAL_VALID) factor *= 1.18;
  if (route === ROUTES.MULTILINGUAL) factor *= 1.08;
  return factor;
}

function collectMarketSignals(comparableEvents, marketSignals) {
  const asks = [];
  const bids = [];

  for (const signal of normalizeSignalList(marketSignals.asks || marketSignals.ask)) {
    const price = signalPrice(signal);
    if (price && signalIsUsable(signal)) asks.push(price);
  }
  for (const signal of normalizeSignalList(marketSignals.bids || marketSignals.bid)) {
    const price = signalPrice(signal);
    if (price && signalIsUsable(signal)) bids.push(price);
  }

  for (const event of Array.isArray(comparableEvents) ? comparableEvents : []) {
    const type = String(event?.eventType || event?.type || "").toLocaleLowerCase("en-US");
    if (type === "ask" || type === "listing" || type === "active-listing") {
      const price = signalPrice(event);
      if (price && signalIsUsable(event)) asks.push(price);
    } else if (type === "bid" || type === "offer") {
      const price = signalPrice(event);
      if (price && signalIsUsable(event)) bids.push(price);
    }
  }

  return {
    asks: asks.sort((a, b) => a - b),
    bids: bids.sort((a, b) => a - b),
  };
}

function normalizeSignalList(value) {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}

function signalPrice(signal) {
  if (typeof signal === "number") return signal > 0 ? signal : null;
  return eventPriceGram(signal || {});
}

function signalIsUsable(signal) {
  if (typeof signal === "number") return Number.isFinite(signal) && signal > 0;
  if (!signal || signal.verified === false || signal.active === false || signal.cancelled || signal.reverted) return false;
  return hasNativePayment(signal) && !hasFatalQualityFlag(signal);
}

function applyBoundedSignals({ midpointGram, lowGram, highGram, bids, asks }) {
  let low = lowGram;
  let high = highGram;

  if (bids.length) {
    const bid = bids[bids.length - 1];
    if (bid <= midpointGram * 1.5 && bid <= highGram * 1.35) {
      if (bid <= midpointGram) {
        low = Math.max(low, Math.min(bid, midpointGram * 0.98));
      } else {
        low = Math.max(low, midpointGram * 0.88);
        high = Math.max(high, Math.min(bid, highGram * 1.1));
      }
    }
  }

  if (asks.length) {
    const ask = weightedMedian(asks);
    const plausible = ask >= midpointGram * 0.5 && ask <= highGram * 2;
    if (plausible) {
      if (ask < high) {
        high = Math.max(midpointGram * 1.02, ask);
      } else {
        high = Math.min(ask, highGram * 1.1);
      }
    }
  }

  low = Math.min(low, midpointGram);
  high = Math.max(high, midpointGram);
  return { lowGram: low, highGram: high };
}

function confidenceFor({
  target,
  effectiveCompCount,
  averageSimilarity,
  averageRecency,
  averageQuality,
  ownSaleCount,
  logSpread,
}) {
  const countScore = 1 - Math.exp(-effectiveCompCount / 4);
  const dispersionScore = Math.exp(-Math.max(0, logSpread - 0.25) / 1.35);
  const ownHistoryScore = Math.min(1, ownSaleCount / 2);
  let score = (countScore * 0.3)
    + (averageSimilarity * 0.25)
    + (averageRecency * 0.14)
    + (averageQuality * 0.13)
    + (dispersionScore * 0.13)
    + (ownHistoryScore * 0.05);

  if (target.primaryRoute === ROUTES.RESIDUAL) score *= 0.76;
  if (target.primaryRoute === ROUTES.UNUSUAL_VALID) score *= 0.8;
  // One finalized sale is informative, but not enough to put a DNS value into
  // the portfolio. Match the compact precomputed read model in this direct
  // path so imports cannot bypass the same confidence rule.
  if (ownSaleCount < 2) score = Math.min(score, 0.44);
  else if (effectiveCompCount < 4) score = Math.min(score, 0.69);
  score = clamp(score, 0, 1);

  return {
    score: round(score, 3),
    band: score >= 0.75 ? "high" : score >= 0.45 ? "medium" : "low",
  };
}

function unavailableResult(target, comparableEvents, marketSignals) {
  const signals = collectMarketSignals(comparableEvents, marketSignals);
  return {
    status: "unavailable",
    estimatorVersion: DNS_ESTIMATOR_VERSION,
    domain: target.normalizedDomain,
    route: target.primaryRoute,
    midpointGram: null,
    estimateGram: null,
    range: { lowGram: null, highGram: null },
    rangeLowGram: null,
    rangeHighGram: null,
    confidence: { score: 0, band: "low" },
    confidenceScore: 0,
    confidenceBand: "low",
    evidenceCount: 0,
    completedSaleCount: 0,
    effectiveCompCount: 0,
    ownSaleCount: 0,
    signalCounts: { asks: signals.asks.length, bids: signals.bids.length },
    boundedSignals: { changedLowerRange: false, changedUpperRange: false },
    comparables: [],
  };
}

function coerceClassification(value, classificationOptions) {
  if (!value) return null;
  if (typeof value === "string") return classifyTonDns(value, classificationOptions);
  if (typeof value === "object" && value.primaryRoute && value.normalizedDomain) return value;
  if (typeof value === "object" && typeof value.domain === "string") {
    return classifyTonDns(value.domain, classificationOptions);
  }
  if (typeof value === "object" && typeof value.name === "string") {
    return classifyTonDns(value.name, classificationOptions);
  }
  return null;
}

function emptyComparableScore(classification = null, overrides = {}) {
  return {
    classification,
    exactDomain: false,
    routeCompatibility: 0,
    structuralSimilarity: 0,
    lexicalSimilarity: 0,
    semanticSimilarity: 0,
    comparableSimilarity: 0,
    recencyWeight: 0,
    qualityWeight: 0,
    liquidityWeight: 0,
    weight: 0,
    ...overrides,
  };
}

function parseTime(value) {
  if (value === undefined || value === null || value === "") return null;
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? value.getTime() : null;
  if (typeof value === "number") {
    const milliseconds = value < 10_000_000_000 ? value * 1000 : value;
    return Number.isFinite(milliseconds) ? milliseconds : null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function finiteOr(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function roundGram(value) {
  if (!Number.isFinite(value)) return null;
  if (value >= 1000) return round(value, 2);
  if (value >= 1) return round(value, 4);
  return round(value, 8);
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

module.exports = {
  ROUTE_COMPATIBILITY,
  effectiveSampleSize,
  estimateTonDnsValue,
  isCompletedSale,
  routeCompatibilityFor,
  lexicalSimilarityFor,
  scoreComparable,
  weightedMedian,
  weightedQuantile,
};

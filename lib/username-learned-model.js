"use strict";

const { classifyTelegramUsername } = require("./username-structural");
const { CATEGORY_NAMES, usernameSemanticProfile } = require("./username-semantic");
const { usableUsernameKnowledge } = require("./username-knowledge");

const FEATURE_NAMES = Object.freeze([
  "intercept", "log_length", "inverse_length", "length_le_3", "length_eq_4", "length_eq_5", "length_le_5", "length_ge_13",
  "route_numeric", "route_short", "route_pattern", "route_alphanumeric", "route_word", "route_multilingual",
  "script_latin", "script_cyrillic", "script_arabic", "script_han",
  "class_numeric", "class_alphanumeric", "class_mixed", "unique_ratio", "digit_ratio",
  "contains_underscore", "pronounceable", "vowel_balance", "all_letters", "repeated", "palindrome", "sequence", "repeated_block",
  "leading_zero", "round_number", "numeric_inverse_length", "short_inverse_length",
  "knowledge_dictionary", "knowledge_frequency", "knowledge_entity", "knowledge_entity_strength", "knowledge_attention", "knowledge_ecosystem",
  ...CATEGORY_NAMES.map((category) => `semantic_${category}`),
  "semantic_exact_term",
  ...CATEGORY_NAMES.map((category) => `semantic_exact_${category}`),
  "semantic_category_count",
]);

function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
function quantile(values, ratio) {
  const rows = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!rows.length) return 0;
  const position = clamp(ratio, 0, 1) * (rows.length - 1);
  const low = Math.floor(position);
  const high = Math.ceil(position);
  return rows[low] + (rows[high] - rows[low]) * (position - low);
}
function featureVector(input) {
  const value = input?.normalizedUsername ? input : classifyTelegramUsername(input);
  const length = Math.max(1, Number(value.characterLength) || 1);
  const inverse = 1 / length;
  const uniqueRatio = clamp(Number(value.uniqueCharacterCount || 0) / length, 0, 1);
  const semanticProfile = usernameSemanticProfile(value);
  const knowledge = value.knowledge || value.semantic || {};
  const semanticCategories = new Set(semanticProfile.categories);
  return [
    1, Math.log(length), inverse, Number(length <= 3), Number(length === 4), Number(length === 5), Number(length <= 5), Number(length >= 13),
    Number(value.primaryRoute === "numeric"), Number(value.primaryRoute === "short"), Number(value.primaryRoute === "pattern"),
    Number(value.primaryRoute === "alphanumeric"), Number(value.primaryRoute === "word"), Number(value.primaryRoute === "multilingual"),
    Number(value.primaryScript === "Latin"), Number(value.primaryScript === "Cyrillic"), Number(value.primaryScript === "Arabic"), Number(value.primaryScript === "Han"),
    Number(value.characterClass === "numeric"), Number(value.characterClass === "alphanumeric"), Number(value.characterClass === "mixed"),
    uniqueRatio, clamp(Number(value.digitRatio || 0), 0, 1), Number(value.containsUnderscore), Number(value.pronounceability === "balanced"),
    Number(value.vowelRatio >= 0.22 && value.vowelRatio <= 0.72), Number(value.characterClass === "letters"),
    Number(Number(value.maxRunLength || 0) > 1), Number(value.palindrome), Number(Boolean(value.sequence)), Number(Boolean(value.repeatedBlock)),
    Number(value.leadingZero), Number(value.roundNumber), Number(value.primaryRoute === "numeric") * inverse,
    Number(value.primaryRoute === "short") * inverse,
    Number(Boolean(knowledge.dictionaryMatch)), clamp(Math.log1p(Number(knowledge.lexicalFrequency || 0)) / Math.log(1001), 0, 1), Number(Boolean(knowledge.entityMatch)),
    clamp(Number(knowledge.entityMatchStrength || 0), 0, 1),
    clamp(Number(knowledge.attentionScore || 0), 0, 1), Number(Boolean(knowledge.ecosystemRelevance)),
    ...CATEGORY_NAMES.map((category) => Number(semanticCategories.has(category))),
    Number(semanticProfile.exactTerms.length > 0),
    ...CATEGORY_NAMES.map((category) => Number(semanticProfile.exactTerms.some((term) => term.startsWith(`${category}:`)))),
    Math.min(4, semanticProfile.categories.length) / 4,
  ];
}
function solve(matrix, vector) {
  const size = vector.length;
  const rows = matrix.map((row, index) => [...row, vector[index]]);
  for (let column = 0; column < size; column += 1) {
    let pivot = column;
    for (let row = column + 1; row < size; row += 1) if (Math.abs(rows[row][column]) > Math.abs(rows[pivot][column])) pivot = row;
    if (Math.abs(rows[pivot][column]) < 1e-10) continue;
    [rows[column], rows[pivot]] = [rows[pivot], rows[column]];
    const divisor = rows[column][column];
    for (let index = column; index <= size; index += 1) rows[column][index] /= divisor;
    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = rows[row][column];
      if (!factor) continue;
      for (let index = column; index <= size; index += 1) rows[row][index] -= factor * rows[column][index];
    }
  }
  return rows.map((row, index) => Number.isFinite(row[size]) ? row[size] : index === 0 ? 0 : 0);
}
function fit(rows, ridge = 1.5) {
  const width = FEATURE_NAMES.length;
  const matrix = Array.from({ length: width }, () => Array(width).fill(0));
  const vector = Array(width).fill(0);
  for (const row of rows) {
    for (let left = 0; left < width; left += 1) {
      vector[left] += row.weight * row.x[left] * row.y;
      for (let right = 0; right < width; right += 1) matrix[left][right] += row.weight * row.x[left] * row.x[right];
    }
  }
  for (let index = 1; index < width; index += 1) matrix[index][index] += ridge;
  matrix[0][0] += 0.001;
  return solve(matrix, vector);
}
function dot(left, right) { return left.reduce((sum, value, index) => sum + value * right[index], 0); }
function sigmoid(value) { return value >= 0 ? 1 / (1 + Math.exp(-value)) : Math.exp(value) / (1 + Math.exp(value)); }
function logit(value) { const safe = clamp(Number(value) || 0, 1e-6, 1 - 1e-6); return Math.log(safe / (1 - safe)); }
function fitPremiumClassifier(rows, iterations = 360) {
  const coefficients = Array(FEATURE_NAMES.length).fill(0);
  const positives = rows.filter((row) => Math.exp(row.y) >= 100).length;
  const negatives = rows.length - positives;
  if (positives < 12 || negatives < 12) return null;
  const positiveWeight = rows.length / (2 * positives);
  const negativeWeight = rows.length / (2 * negatives);
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const gradient = Array(coefficients.length).fill(0);
    for (const row of rows) {
      const label = Math.exp(row.y) >= 100 ? 1 : 0;
      const classWeight = label ? positiveWeight : negativeWeight;
      const error = (sigmoid(dot(row.x, coefficients)) - label) * row.weight * classWeight;
      for (let index = 0; index < gradient.length; index += 1) gradient[index] += error * row.x[index];
    }
    const rate = 0.08 / Math.sqrt(1 + iteration / 30);
    for (let index = 0; index < coefficients.length; index += 1) {
      const regularization = index === 0 ? 0 : coefficients[index] * 0.015;
      coefficients[index] -= rate * ((gradient[index] / rows.length) + regularization);
    }
  }
  return { coefficients, positiveRate: positives / rows.length, positives, negatives };
}
function marketPatternKeys(input) {
  const value = input?.normalizedUsername ? input : classifyTelegramUsername(input);
  const name = String(value.normalizedUsername || "").toLowerCase();
  const keys = new Set();
  for (let size = 2; size <= Math.min(5, name.length); size += 1) {
    keys.add(`prefix:${name.slice(0, size)}`);
    keys.add(`suffix:${name.slice(-size)}`);
  }
  for (let size = 3; size <= Math.min(5, name.length); size += 1) {
    for (let index = 0; index <= name.length - size; index += 1) keys.add(`gram:${name.slice(index, index + size)}`);
  }
  return [...keys];
}
function normalizedSale(event, nowMs) {
  const name = event.normalized_name || event.normalizedName || event.username || event.name;
  const priceUsd = Number(event.price_usd || event.priceUsd || 0);
  const soldAt = Number(event.sold_at || 0) > 1_000_000_000
    ? Number(event.sold_at) * 1000
    : Date.parse(event.soldAt || event.eventTime || "");
  if (!name || !(priceUsd > 0) || !Number.isFinite(soldAt) || soldAt > nowMs + 60_000) return null;
  let classification;
  try { classification = classifyTelegramUsername(name); } catch { return null; }
  const reliability = clamp(Number(event.reliability_score ?? event.reliabilityScore ?? 1), 0.05, 1);
  const ageDays = Math.max(0, nowMs - soldAt) / 86_400_000;
  let knowledge = event.knowledge || event.semantic || event.semantic_json || {};
  if (typeof knowledge === "string") { try { knowledge = JSON.parse(knowledge); } catch { knowledge = {}; } }
  classification.knowledge = usableUsernameKnowledge(knowledge);
  return { classification, x: featureVector(classification), y: Math.log(priceUsd), weight: reliability * clamp(0.5 ** (ageDays / 540), 0.08, 1) };
}
function cohortKey(classification) {
  const length = Number(classification.characterLength || 0);
  const bucket = length <= 3 ? "1-3" : length === 4 ? "4" : length === 5 ? "5" : length <= 8 ? "6-8" : length <= 12 ? "9-12" : "13+";
  return `${classification.primaryRoute}|${classification.primaryScript}|${bucket}`;
}
function qualityKey(classification) {
  const length = Number(classification.characterLength || 0);
  const bucket = length <= 4 ? "4" : length === 5 ? "5" : length <= 8 ? "6-8" : length <= 12 ? "9-12" : "13+";
  const quality = classification.containsUnderscore
    ? "underscore"
    : classification.characterClass === "alphanumeric" ? "mixed-digit" : "clean";
  return `${bucket}|${quality}`;
}
function qualityAdjustmentStats(rows) {
  const groups = new Map();
  for (const row of rows) {
    const key = qualityKey(row.classification);
    const values = groups.get(key) || [];
    values.push(Math.exp(row.y));
    groups.set(key, values);
  }
  const output = {};
  for (const bucket of ["4", "5", "6-8", "9-12", "13+"]) {
    const clean = groups.get(`${bucket}|clean`) || [];
    if (clean.length < 20) continue;
    const cleanMedian = quantile(clean, 0.5);
    for (const quality of ["underscore", "mixed-digit"]) {
      const values = groups.get(`${bucket}|${quality}`) || [];
      if (values.length < 20) continue;
      const observed = quantile(values, 0.5) / cleanMedian;
      // Active-name selection can make awkward names look more expensive in
      // raw auction samples. Complexity may reduce a fallback estimate but
      // may never create a premium. Exact sale history is handled separately.
      const ceiling = quality === "underscore" ? 0.92 : 0.95;
      output[`${bucket}|${quality}`] = {
        adjustment: Number(clamp(observed, 0.45, ceiling).toFixed(6)),
        evidenceCount: values.length,
        observedRatio: Number(observed.toFixed(6)),
      };
    }
  }
  return output;
}
function knowledgeCohortKeys(classification) {
  const knowledge = classification.knowledge || classification.semantic || {};
  const semantic = usernameSemanticProfile(classification);
  const keys = [];
  if (knowledge.dictionaryMatch) keys.push("knowledge:dictionary");
  if (knowledge.entityMatch) keys.push("knowledge:entity");
  if (knowledge.ecosystemRelevance) keys.push("knowledge:ecosystem");
  for (const category of semantic.categories) keys.push(`semantic:${category}`);
  return keys;
}
function knowledgeCohortStats(rows) {
  const groups = new Map();
  for (const row of rows) {
    for (const key of knowledgeCohortKeys(row.classification)) {
      const values = groups.get(key) || [];
      values.push(row);
      groups.set(key, values);
    }
  }
  return Object.fromEntries([...groups].filter(([, values]) => values.length >= 12).map(([key, values]) => {
    const prices = values.map((row) => Math.exp(row.y));
    const premium = prices.filter((price) => price >= 100).length;
    return [key, {
      count: values.length,
      medianUsd: Number(quantile(prices, 0.5).toFixed(4)),
      upperUsd: Number(quantile(prices, 0.75).toFixed(4)),
      premiumRate: Number(((premium + 2) / (values.length + 8)).toFixed(6)),
    }];
  }));
}
function cohortStats(rows, overrides = {}) {
  const groups = new Map();
  for (const row of rows) {
    const key = cohortKey(row.classification);
    const current = groups.get(key) || [];
    current.push(row);
    groups.set(key, current);
  }
  return Object.fromEntries([...groups].map(([key, values]) => {
    const prices = values.map((row) => Math.exp(row.y));
    const premium = values.filter((row) => Math.exp(row.y) >= 100).length;
    const override = overrides[key] || {};
    return [key, {
      count: values.length,
      medianUsd: Number((Number(override.medianUsd) > 0 ? Number(override.medianUsd) : quantile(prices, 0.5)).toFixed(4)),
      upperUsd: Number((Number(override.upperUsd) > 0 ? Number(override.upperUsd) : quantile(prices, 0.75)).toFixed(4)),
      premiumRate: Number((Number.isFinite(Number(override.premiumRate))
        ? clamp(Number(override.premiumRate), 0, 1)
        : (premium + 2) / (values.length + 8)).toFixed(6)),
      populationCount: Number(override.populationCount || values.length),
    }];
  }));
}
function trainUsernameLearnedModel(events = [], options = {}) {
  const nowMs = Number(options.nowMs) || Date.now();
  const marketRows = events.map((event) => normalizedSale(event, nowMs)).filter(Boolean);
  if (marketRows.length < 25) return null;
  const low = quantile(marketRows.map((row) => row.y), 0.01);
  const high = quantile(marketRows.map((row) => row.y), 0.99);
  let rows = marketRows.map((row) => ({ ...row, y: clamp(row.y, low, high) }));
  let coefficients = fit(rows);
  const residuals = rows.map((row) => row.y - dot(row.x, coefficients));
  const medianAbsolute = quantile(residuals.map(Math.abs), 0.5) || 0.5;
  rows = rows.map((row, index) => ({ ...row, weight: row.weight * clamp((medianAbsolute * 2.5) / Math.max(medianAbsolute * 2.5, Math.abs(residuals[index])), 0.08, 1) }));
  coefficients = fit(rows);
  const calibrated = rows.map((row) => row.y - dot(row.x, coefficients));
  const patternStats = new Map();
  for (let index = 0; index < rows.length; index += 1) {
    for (const key of marketPatternKeys(rows[index].classification)) {
      const current = patternStats.get(key) || { count: 0, weight: 0, residual: 0 };
      current.count += 1;
      current.weight += rows[index].weight;
      current.residual += rows[index].weight * calibrated[index];
      patternStats.set(key, current);
    }
  }
  const marketPatterns = Object.fromEntries([...patternStats]
    .filter(([, stat]) => stat.count >= 5 && stat.weight > 0)
    .map(([key, stat]) => [key, {
      count: stat.count,
      effect: Number(clamp((stat.residual / stat.weight) * (stat.count / (stat.count + 12)), -1.25, 1.25).toFixed(6)),
    }])
    .sort((left, right) => (Math.abs(right[1].effect) * Math.log1p(right[1].count)) - (Math.abs(left[1].effect) * Math.log1p(left[1].count)))
    .slice(0, 900));
  const routeCounts = {};
  for (const row of rows) routeCounts[row.classification.primaryRoute] = (routeCounts[row.classification.primaryRoute] || 0) + 1;
  const baseRows = rows.filter((row) => Math.exp(row.y) < 100);
  // Premium sales are signal, not regression noise. Train this branch and its
  // classifier from the original time-weighted observations before robust
  // residual suppression used by the ordinary-price model.
  const premiumHigh = quantile(marketRows.map((row) => row.y), 0.998);
  const premiumRows = marketRows
    .filter((row) => Math.exp(row.y) >= 100)
    .map((row) => ({ ...row, y: Math.min(row.y, premiumHigh) }));
  const premiumClassifier = fitPremiumClassifier(marketRows);
  const marketPremiumRate = options.marketPremiumRate != null && Number.isFinite(Number(options.marketPremiumRate))
    ? clamp(Number(options.marketPremiumRate), 1e-4, 0.9999)
    : premiumClassifier?.positiveRate;
  return {
    version: "username-learned-ridge-v11",
    featureNames: FEATURE_NAMES,
    coefficients: coefficients.map((value) => Number(value.toFixed(8))),
    baseCoefficients: (baseRows.length >= 20 ? fit(baseRows, 2) : coefficients).map((value) => Number(value.toFixed(8))),
    premiumCoefficients: (premiumRows.length >= 20 ? fit(premiumRows, 2.5) : coefficients).map((value) => Number(value.toFixed(8))),
    premiumClassifier: premiumClassifier ? {
      coefficients: premiumClassifier.coefficients.map((value) => Number(value.toFixed(8))),
      positiveRate: Number(marketPremiumRate.toFixed(6)),
      positives: premiumClassifier.positives,
      negatives: premiumClassifier.negatives,
    } : null,
    residualLow: Number(quantile(calibrated, 0.2).toFixed(6)),
    residualHigh: Number(quantile(calibrated, 0.8).toFixed(6)),
    medianAbsoluteLogError: Number(quantile(calibrated.map(Math.abs), 0.5).toFixed(6)),
    sampleCount: rows.length,
    routeCounts,
    cohortStats: cohortStats(rows, options.cohortStats || {}),
    qualityAdjustments: qualityAdjustmentStats(marketRows),
    knowledgeCohortStats: knowledgeCohortStats(rows),
    marketPatterns,
    trainedAt: new Date(nowMs).toISOString(),
  };
}
function predictUsernameLearnedModel(model, input) {
  if (!model || model.version !== "username-learned-ridge-v11" || !Array.isArray(model.coefficients) || model.coefficients.length !== FEATURE_NAMES.length) return null;
  const classification = input?.normalizedUsername ? input : classifyTelegramUsername(input);
  const patternRows = marketPatternKeys(classification)
    .map((key) => model.marketPatterns?.[key])
    .filter((row) => row && Number(row.count) >= 5 && Number.isFinite(Number(row.effect)))
    .sort((left, right) => Number(right.count) - Number(left.count))
    .slice(0, 12);
  const patternWeight = patternRows.reduce((sum, row) => sum + Math.log1p(Number(row.count)), 0);
  const patternAdjustment = patternWeight
    ? clamp(patternRows.reduce((sum, row) => sum + Number(row.effect) * Math.log1p(Number(row.count)), 0) / patternWeight, -0.9, 0.9)
    : 0;
  const vector = featureVector(classification);
  let center = dot(vector, model.coefficients) + patternAdjustment;
  let premiumProbability = model.premiumClassifier?.coefficients?.length === vector.length
    ? sigmoid(dot(vector, model.premiumClassifier.coefficients))
    : 0;
  if (model.premiumClassifier) {
    const marketPrior = clamp(Number(model.premiumClassifier.positiveRate || 0), 1e-4, 0.9999);
    premiumProbability = sigmoid(logit(premiumProbability) + logit(marketPrior));
  }
  const cohort = model.cohortStats?.[cohortKey(classification)] || null;
  const knowledgeCohorts = knowledgeCohortKeys(classification)
    .map((key) => model.knowledgeCohortStats?.[key])
    .filter((row) => row && Number(row.count) >= 12);
  const cohortSignals = [cohort, ...knowledgeCohorts].filter((row) => row && Number(row.count) >= 8);
  const signalWeight = cohortSignals.reduce((sum, row) => sum + Math.log1p(Number(row.count)), 0);
  const cohortPremiumRate = signalWeight
    ? cohortSignals.reduce((sum, row) => sum + Number(row.premiumRate || 0) * Math.log1p(Number(row.count)), 0) / signalWeight
    : premiumProbability;
  const effectivePremiumProbability = signalWeight
    ? clamp((premiumProbability * 0.62) + (cohortPremiumRate * 0.38), 0, 1)
    : premiumProbability;
  if (model.baseCoefficients?.length === vector.length && model.premiumCoefficients?.length === vector.length) {
    const baseCenter = dot(vector, model.baseCoefficients);
    const premiumCenter = dot(vector, model.premiumCoefficients);
    const baseUsd = Math.exp(baseCenter);
    const premiumUsd = Math.exp(premiumCenter);
    center = Math.log(Math.max(1, baseUsd * (1 - effectivePremiumProbability) + premiumUsd * effectivePremiumProbability)) + patternAdjustment;
  }
  if (cohort?.count >= 8) {
    const structuralShare = clamp(Math.log1p(cohort.count) / 9, 0.18, 0.48);
    const cohortTarget = cohort.premiumRate >= 0.35 ? cohort.upperUsd : cohort.medianUsd;
    center = center * (1 - structuralShare) + Math.log(Math.max(1, cohortTarget)) * structuralShare;
  }
  if (knowledgeCohorts.length) {
    const knowledgeWeight = knowledgeCohorts.reduce((sum, row) => sum + Math.log1p(Number(row.count)), 0);
    const knowledgeTarget = knowledgeCohorts.reduce((sum, row) => {
      const targetUsd = Number(row.premiumRate || 0) >= 0.22 ? Number(row.upperUsd) : Number(row.medianUsd);
      return sum + Math.log(Math.max(1, targetUsd)) * Math.log1p(Number(row.count));
    }, 0) / knowledgeWeight;
    const knowledgeShare = clamp(knowledgeWeight / 80, 0.08, 0.22);
    center = center * (1 - knowledgeShare) + knowledgeTarget * knowledgeShare;
  }
  const qualityAdjustment = model.qualityAdjustments?.[qualityKey(classification)] || null;
  if (qualityAdjustment && classification.characterClass !== "numeric") {
    center += Math.log(clamp(Number(qualityAdjustment.adjustment) || 1, 0.45, 1));
  }
  const estimateUsd = Math.exp(center);
  const routeCount = Number(model.routeCounts?.[classification.primaryRoute] || 0);
  const support = clamp(Math.log1p(routeCount) / Math.log(101), 0, 1);
  return {
    estimateUsd,
    rangeLowUsd: Math.exp(center + Number(model.residualLow || -0.8)),
    rangeHighUsd: Math.exp(center + Number(model.residualHigh || 0.8)),
    confidenceScore: clamp(0.22 + support * 0.38, 0, 0.6),
    routeEvidenceCount: routeCount,
    sampleCount: Number(model.sampleCount || 0),
    modelVersion: model.version,
    marketPatternAdjustment: patternAdjustment,
    marketPatternEvidence: patternRows.reduce((sum, row) => sum + Number(row.count), 0),
    premiumProbability: Number(effectivePremiumProbability.toFixed(6)),
    rawPremiumProbability: Number(premiumProbability.toFixed(6)),
    baseEstimateUsd: model.baseCoefficients?.length === vector.length ? Math.exp(dot(vector, model.baseCoefficients)) : estimateUsd,
    premiumEstimateUsd: model.premiumCoefficients?.length === vector.length ? Math.exp(dot(vector, model.premiumCoefficients)) : estimateUsd,
    cohortEvidenceCount: Number(cohort?.count || 0),
    knowledgeCohortEvidenceCount: knowledgeCohorts.reduce((sum, row) => sum + Number(row.count || 0), 0),
    qualityAdjustment: qualityAdjustment ? Number(qualityAdjustment.adjustment || 1) : 1,
    qualityAdjustmentEvidenceCount: Number(qualityAdjustment?.evidenceCount || 0),
  };
}

module.exports = { FEATURE_NAMES, featureVector, knowledgeCohortKeys, marketPatternKeys, predictUsernameLearnedModel, trainUsernameLearnedModel };

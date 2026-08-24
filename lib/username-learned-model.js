"use strict";

const { classifyTelegramUsername } = require("./username-structural");

const FEATURE_NAMES = Object.freeze([
  "intercept", "log_length", "inverse_length", "length_le_3", "length_le_5", "length_ge_13",
  "route_numeric", "route_short", "route_pattern", "route_alphanumeric", "route_word", "route_multilingual",
  "script_latin", "script_cyrillic", "script_arabic", "script_han",
  "class_numeric", "class_alphanumeric", "class_mixed", "unique_ratio", "digit_ratio",
  "contains_underscore", "pronounceable", "repeated", "palindrome", "sequence", "repeated_block",
  "leading_zero", "round_number", "numeric_inverse_length", "short_inverse_length",
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
  return [
    1, Math.log(length), inverse, Number(length <= 3), Number(length <= 5), Number(length >= 13),
    Number(value.primaryRoute === "numeric"), Number(value.primaryRoute === "short"), Number(value.primaryRoute === "pattern"),
    Number(value.primaryRoute === "alphanumeric"), Number(value.primaryRoute === "word"), Number(value.primaryRoute === "multilingual"),
    Number(value.primaryScript === "Latin"), Number(value.primaryScript === "Cyrillic"), Number(value.primaryScript === "Arabic"), Number(value.primaryScript === "Han"),
    Number(value.characterClass === "numeric"), Number(value.characterClass === "alphanumeric"), Number(value.characterClass === "mixed"),
    uniqueRatio, clamp(Number(value.digitRatio || 0), 0, 1), Number(value.containsUnderscore), Number(value.pronounceability === "balanced"),
    Number(Number(value.maxRunLength || 0) > 1), Number(value.palindrome), Number(Boolean(value.sequence)), Number(Boolean(value.repeatedBlock)),
    Number(value.leadingZero), Number(value.roundNumber), Number(value.primaryRoute === "numeric") * inverse,
    Number(value.primaryRoute === "short") * inverse,
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
  return { classification, x: featureVector(classification), y: Math.log(priceUsd), weight: reliability * clamp(0.5 ** (ageDays / 540), 0.08, 1) };
}
function trainUsernameLearnedModel(events = [], options = {}) {
  const nowMs = Number(options.nowMs) || Date.now();
  let rows = events.map((event) => normalizedSale(event, nowMs)).filter(Boolean);
  if (rows.length < 25) return null;
  const low = quantile(rows.map((row) => row.y), 0.01);
  const high = quantile(rows.map((row) => row.y), 0.99);
  rows = rows.map((row) => ({ ...row, y: clamp(row.y, low, high) }));
  let coefficients = fit(rows);
  const residuals = rows.map((row) => row.y - dot(row.x, coefficients));
  const medianAbsolute = quantile(residuals.map(Math.abs), 0.5) || 0.5;
  rows = rows.map((row, index) => ({ ...row, weight: row.weight * clamp((medianAbsolute * 2.5) / Math.max(medianAbsolute * 2.5, Math.abs(residuals[index])), 0.08, 1) }));
  coefficients = fit(rows);
  const calibrated = rows.map((row) => row.y - dot(row.x, coefficients));
  const routeCounts = {};
  for (const row of rows) routeCounts[row.classification.primaryRoute] = (routeCounts[row.classification.primaryRoute] || 0) + 1;
  return {
    version: "username-learned-ridge-v1",
    featureNames: FEATURE_NAMES,
    coefficients: coefficients.map((value) => Number(value.toFixed(8))),
    residualLow: Number(quantile(calibrated, 0.2).toFixed(6)),
    residualHigh: Number(quantile(calibrated, 0.8).toFixed(6)),
    medianAbsoluteLogError: Number(quantile(calibrated.map(Math.abs), 0.5).toFixed(6)),
    sampleCount: rows.length,
    routeCounts,
    trainedAt: new Date(nowMs).toISOString(),
  };
}
function predictUsernameLearnedModel(model, input) {
  if (!model || model.version !== "username-learned-ridge-v1" || !Array.isArray(model.coefficients)) return null;
  const classification = input?.normalizedUsername ? input : classifyTelegramUsername(input);
  const center = dot(featureVector(classification), model.coefficients);
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
  };
}

module.exports = { FEATURE_NAMES, featureVector, predictUsernameLearnedModel, trainUsernameLearnedModel };

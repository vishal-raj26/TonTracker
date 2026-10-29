"use strict";
const { fitEvidenceFusion } = require("./username-evidence-fusion");
function features(baseUsd, vectorUsd, username) {
  return [1, Math.log(baseUsd), Math.log(vectorUsd / baseUsd), Math.log(Math.max(1, Array.from(username || "").length))];
}
function sigmoid(value) { return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, value)))); }
function weight(model, baseUsd, vectorUsd, username) {
  const x = features(baseUsd, vectorUsd, username).map((v, i) => (v - model.means[i]) / model.scales[i]);
  return sigmoid(x.reduce((sum, v, i) => sum + v * model.coefficients[i], 0));
}
function fitConditionalFusion(observations, cutoff) {
  const rows = observations.filter(row => Number.isFinite(row.time) && row.time < cutoff
    && [row.baseUsd, row.vectorUsd, row.actualUsd].every(v => Number.isFinite(v) && v > 0))
    .slice().sort((a, b) => a.time - b.time).slice(-200);
  const global = fitEvidenceFusion(rows, cutoff);
  if (!global) return null;
  const training = rows.slice(0, global.trainingCount);
  const raw = training.map(row => features(row.baseUsd, row.vectorUsd, row.username));
  const means = [0, ...[1, 2, 3].map(i => raw.reduce((sum, x) => sum + x[i], 0) / raw.length)];
  const scales = means.map((mean, i) => i ? Math.sqrt(raw.reduce((sum, x) => sum + (x[i] - mean) ** 2, 0) / raw.length) || 1 : 1);
  const xs = raw.map(x => x.map((v, i) => (v - means[i]) / scales[i]));
  const prior = Math.max(0.01, Math.min(0.99, global.vectorWeight));
  const coefficients = [Math.log(prior / (1 - prior)), 0, 0, 0];
  for (let iteration = 0; iteration < 400; iteration += 1) {
    const gradient = [0, 0, 0, 0];
    training.forEach((row, index) => {
      const x = xs[index], w = sigmoid(x.reduce((sum, v, i) => sum + v * coefficients[i], 0));
      const delta = Math.log(row.vectorUsd / row.baseUsd);
      const error = Math.log(row.baseUsd / row.actualUsd) + w * delta;
      x.forEach((v, i) => { gradient[i] += error * delta * w * (1 - w) * v; });
    });
    coefficients.forEach((v, i) => { coefficients[i] -= 0.05 * (gradient[i] / training.length + (i ? 0.02 * v : 0)); });
  }
  return { version: "username-conditional-fusion-experiment-v1", means, scales, coefficients,
    latestEvidenceTime: global.latestEvidenceTime, trainingCount: global.trainingCount,
    calibrationCount: global.calibrationCount };
}
function predictConditionalFusion(model, baseUsd, vectorUsd, username, cutoff) {
  if (!model || !(model.latestEvidenceTime < cutoff) || ![baseUsd, vectorUsd].every(v => Number.isFinite(v) && v > 0)) return null;
  const vectorWeight = weight(model, baseUsd, vectorUsd, username);
  return { estimateUsd: Math.exp(Math.log(baseUsd) * (1 - vectorWeight) + Math.log(vectorUsd) * vectorWeight), vectorWeight };
}
module.exports = { fitConditionalFusion, predictConditionalFusion };

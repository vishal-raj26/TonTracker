"use strict";

function quantile(values, fraction) {
  const ordered = values.slice().sort((a, b) => a - b);
  const position = (ordered.length - 1) * fraction;
  const lo = Math.floor(position), hi = Math.ceil(position);
  return ordered[lo] + (ordered[hi] - ordered[lo]) * (position - lo);
}
function vectorCandidateEstimate(candidates) {
  const logs = (candidates || []).map(row => Number(row.sale.priceUsd))
    .filter(value => Number.isFinite(value) && value > 0).map(Math.log);
  return logs.length ? Math.exp(quantile(logs, 0.5)) : null;
}
function fitEvidenceFusion(observations, cutoff) {
  if (!Number.isFinite(cutoff)) return null;
  const rows = (observations || []).filter(row => Number.isFinite(row.time) && row.time < cutoff
    && [row.baseUsd, row.vectorUsd, row.actualUsd].every(value => Number.isFinite(value) && value > 0))
    .slice().sort((a, b) => a.time - b.time).slice(-200);
  if (rows.length < 50) return null;
  // Keep the fitted blend frozen while calibrating on a separate later block.
  // Move all simultaneous observations onto the calibration side of the split.
  let boundary = rows.length - Math.max(20, Math.floor(rows.length * 0.2));
  while (boundary > 0 && rows[boundary - 1].time === rows[boundary].time) boundary -= 1;
  if (boundary < 30) return null;
  const training = rows.slice(0, boundary), calibration = rows.slice(boundary);
  let numerator = 0, denominator = 0;
  for (const row of training) {
    const difference = Math.log(row.vectorUsd / row.baseUsd);
    numerator += difference * Math.log(row.actualUsd / row.baseUsd);
    denominator += difference * difference;
  }
  const vectorWeight = denominator > 1e-12 ? Math.max(0, Math.min(1, numerator / denominator)) : 0;
  const residuals = calibration.map(row => Math.log(row.actualUsd)
    - ((1 - vectorWeight) * Math.log(row.baseUsd) + vectorWeight * Math.log(row.vectorUsd)));
  return { version: "username-evidence-fusion-experiment-v1", vectorWeight,
    residualLow: quantile(residuals, 0.1), residualHigh: quantile(residuals, 0.9),
    trainingCount: training.length, calibrationCount: calibration.length,
    latestEvidenceTime: rows.at(-1).time };
}
function predictEvidenceFusion(model, baseUsd, vectorUsd, cutoff) {
  if (!model || !(model.latestEvidenceTime < cutoff)
    || ![baseUsd, vectorUsd].every(value => Number.isFinite(value) && value > 0)) return null;
  const center = (1 - model.vectorWeight) * Math.log(baseUsd) + model.vectorWeight * Math.log(vectorUsd);
  return { estimateUsd: Math.exp(center), rangeLowUsd: Math.exp(center + model.residualLow),
    rangeHighUsd: Math.exp(center + model.residualHigh), vectorWeight: model.vectorWeight };
}
module.exports = { fitEvidenceFusion, predictEvidenceFusion, vectorCandidateEstimate };

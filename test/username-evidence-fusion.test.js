"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { fitEvidenceFusion, predictEvidenceFusion } = require("../lib/username-evidence-fusion");
const rows = Array.from({ length: 60 }, (_, i) => ({ time: i + 1, baseUsd: 100, vectorUsd: 400, actualUsd: 200 }));
test("evidence blend learns from earlier observations and keeps later calibration separate", () => {
  const model = fitEvidenceFusion(rows, 61);
  assert.ok(Math.abs(model.vectorWeight - 0.5) < 1e-10);
  assert.equal(model.trainingCount, 40);
  assert.equal(model.calibrationCount, 20);
  assert.ok(Math.abs(predictEvidenceFusion(model, 100, 400, 61).estimateUsd - 200) < 1e-8);
  const future = fitEvidenceFusion([...rows, { time: 61, baseUsd: 1, vectorUsd: 1e9, actualUsd: 1e9 }], 61);
  assert.deepEqual(future, model);
  assert.equal(predictEvidenceFusion(model, 100, 400, 60), null);
  const changedCalibration = rows.map(row => row.time > 40 ? { ...row, actualUsd: 300 } : row);
  assert.equal(fitEvidenceFusion(changedCalibration, 61).vectorWeight, model.vectorWeight);
});
test("unsupported and simultaneous training/calibration blocks cannot manufacture a model", () => {
  assert.equal(fitEvidenceFusion(rows.slice(0, 49), 61), null);
  assert.equal(fitEvidenceFusion(rows.map(row => ({ ...row, time: 1 })), 61), null);
});

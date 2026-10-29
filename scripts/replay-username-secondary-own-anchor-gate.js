"use strict";

// Post-hoc development diagnostic on already exposed historical labels.
// This does not modify the frozen prospective candidate or production.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { summarize } = require("../lib/username-backtest");
const { clusteredBootstrapImprovement } = require("./evaluate-username-secondary-qualification");

const INPUTS = [
  ["username-secondary-full-context-development-2025-Q1-2026-09-25.json", "318f5bc90ec527cba402acdd7a614b1f29a136ba317b635fd73513fa4a6121fb"],
  ["username-secondary-full-context-development-2025-Q2-2026-09-25.json", "e8fce3d1d3f199ac9a9da2f02b3d9fd60409c8cf2de0e0d201ebd612a5faf36a"],
];
const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

function useAugmented(row) {
  return Number(row.candidate?.ownSaleCount) > Number(row.baseline?.ownSaleCount);
}

function evaluation(row, variant) {
  const source = variant === "gated" && useAugmented(row) ? row.candidate : row.baseline;
  const actual = Number(row.actualUsd), estimate = Number(source?.estimateUsd);
  const available = source?.available === true && actual > 0 && estimate > 0;
  return { available, prediction: source,
    factorError: available ? Math.max(estimate / actual, actual / estimate) : null,
    insideRange: available && actual >= Number(source.rangeLowUsd) && actual <= Number(source.rangeHighUsd) };
}

function cohort(rows, name) {
  if (name === "ordinary") return rows.filter((row) => row.actualUsd < 100);
  if (name === "intermediate") return rows.filter((row) => row.actualUsd >= 100 && row.actualUsd < 500);
  if (name === "premium") return rows.filter((row) => row.actualUsd >= 500);
  return rows;
}

function summarizeCohort(rows) {
  const evaluated = rows.map((row) => ({ sale: { priceUsd: row.actualUsd, nftAddress: row.nftAddress },
    baseline: evaluation(row, "baseline"), candidate: evaluation(row, "gated") }));
  const paired = evaluated.filter((row) => row.baseline.available && row.candidate.available);
  const wrap = (variant) => summarize(paired.map((row) => ({ sale: row.sale,
    prediction: row[variant].prediction, factorError: row[variant].factorError,
    insideRange: row[variant].insideRange })));
  const baseline = wrap("baseline"), gated = wrap("candidate");
  return { attempts: rows.length, paired: paired.length,
    selected: rows.filter(useAugmented).length, baselineAbstentions: rows.filter((row) => !evaluation(row, "baseline").available).length,
    gatedAbstentions: rows.filter((row) => !evaluation(row, "gated").available).length,
    baseline, gated, maleImprovement: baseline.meanAbsoluteLogError > 0
      ? (baseline.meanAbsoluteLogError - gated.meanAbsoluteLogError) / baseline.meanAbsoluteLogError : null,
    intervalScoreImprovement: baseline.meanLogIntervalScore80 > 0
      ? (baseline.meanLogIntervalScore80 - gated.meanLogIntervalScore80) / baseline.meanLogIntervalScore80 : null,
    evaluated };
}

function main() {
  const dir = path.resolve(__dirname, "../research/telegram-usernames/data");
  const output = path.join(dir, "username-secondary-own-anchor-gate-development-2026-09-25.json");
  if (fs.existsSync(output)) throw new Error("Own-anchor development report already exists");
  const folds = INPUTS.map(([name, expected]) => {
    const bytes = fs.readFileSync(path.join(dir, name));
    if (hash(bytes) !== expected) throw new Error(`Development input changed: ${name}`);
    const report = JSON.parse(bytes);
    if (!report.developmentOnly || report.reserved2026OutcomesOpened || !Array.isArray(report.caseDetails))
      throw new Error(`Not a valid exposed development report: ${name}`);
    return { name, sha256: expected, cases: report.caseDetails };
  });
  const rows = folds.flatMap((fold) => fold.cases);
  const summaries = Object.fromEntries(["overall", "ordinary", "intermediate", "premium"].map((name) => {
    const { evaluated, ...summary } = summarizeCohort(cohort(rows, name));
    return [name, summary];
  }));
  const premium = summarizeCohort(cohort(rows, "premium"));
  const bootstrap = clusteredBootstrapImprovement(premium.evaluated, { iterations: 2000, seed: 25092026 });
  const report = { schemaVersion: "username-secondary-own-anchor-gate-development-v1",
    qualification: false, developmentOnly: true, productionChanged: false, reserved2026OutcomesOpened: false,
    createdAt: new Date().toISOString(), inputs: folds.map(({ name, sha256, cases }) => ({ name, sha256, attempts: cases.length })),
    rule: "Choose full-context candidate only when strictly-prior exact-name ownSaleCount exceeds frozen baseline; otherwise baseline. No target price, cohort or outcome is used in routing.",
    cohorts: summaries, bootstrapPremiumMaleImprovement: bootstrap,
    limitations: ["The route was proposed after looking at exposed Q1 results; this is not independent validation.",
      "Q4 lacks saved per-case predictions and is not included; Q2 is exposed test data, not prospective qualification.",
      "The augmented branch includes all prior secondary comparables and a refreshed model, not only own sales.",
      "A passing development score cannot modify the frozen 2026 candidate or authorize production promotion."] };
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ output: path.basename(output), sha256: hash(fs.readFileSync(output)),
    cohorts: summaries, bootstrapPremiumMaleImprovement: bootstrap }, null, 2));
}

module.exports = { useAugmented, evaluation, summarizeCohort };
if (require.main === module) main();

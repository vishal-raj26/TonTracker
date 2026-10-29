"use strict";

// Post-hoc development diagnostic. The oracle uses the actual outcome and is
// impossible to deploy; it bounds what routing between THESE saved points can do.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const mean = (rows) => rows.reduce((sum, value) => sum + value, 0) / rows.length;

function oracleSummary(rows) {
  if (!rows.length) return { cases: 0, baselineMale: null, candidateMale: null, oracleMale: null,
    oracleImprovement: null, candidateBetterCases: 0 };
  const baseline = rows.map((row) => Math.abs(Math.log(row.baselineUsd / row.actualUsd)));
  const candidate = rows.map((row) => Math.abs(Math.log(row.candidateUsd / row.actualUsd)));
  if ([...baseline, ...candidate].some((value) => !Number.isFinite(value))) throw new Error("Invalid saved prediction");
  const best = baseline.map((value, index) => Math.min(value, candidate[index]));
  const baselineMale = mean(baseline);
  return { cases: rows.length, baselineMale, candidateMale: mean(candidate), oracleMale: mean(best),
    oracleImprovement: (baselineMale - mean(best)) / baselineMale,
    candidateBetterCases: candidate.filter((value, index) => value < baseline[index]).length };
}

function main() {
  const dir = path.resolve(__dirname, "../research/telegram-usernames/data");
  const output = path.join(dir, "username-existing-candidate-oracle-bound-2026-09-25.json");
  if (fs.existsSync(output)) throw new Error("Oracle diagnostic already exists");
  const inputs = [
    ["globalFusion", "username-premium-gated-fusion-development-2026-09-19.json"],
    ["secondaryQ1", "username-secondary-full-context-development-2025-Q1-2026-09-25.json"],
    ["secondaryQ2", "username-secondary-full-context-development-2025-Q2-2026-09-25.json"],
  ];
  const reports = Object.fromEntries(inputs.map(([label, name]) => {
    const bytes = fs.readFileSync(path.join(dir, name));
    return [label, { name, sha256: hash(bytes), report: JSON.parse(bytes) }];
  }));
  const fusionRows = reports.globalFusion.report.results.map((row) => ({ actualUsd: row.actualUsd,
    baselineUsd: row.baseUsd, candidateUsd: row.fusedUsd, eventTime: row.eventTime }));
  const secondaryRows = (label) => reports[label].report.caseDetails.map((row) => ({ actualUsd: row.actualUsd,
    baselineUsd: row.baseline.estimateUsd, candidateUsd: row.candidate.estimateUsd }));
  const cohort = (rows, select) => oracleSummary(rows.filter(select));
  const premium = (row) => row.actualUsd >= 500;
  const ordinary = (row) => row.actualUsd < 100;
  const fusionFolds = [
    ["2024Q3-Q4", "2024-07-01", "2025-01-01"],
    ["2025Q1", "2025-01-01", "2025-04-01"],
    ["2025Q2", "2025-04-01", "2025-07-22"],
  ];
  const report = {
    schemaVersion: "username-existing-candidate-oracle-bound-v1",
    qualification: false, developmentOnly: true, productionChanged: false,
    reserved2026OutcomesOpened: false,
    createdAt: new Date().toISOString(),
    method: "For each exposed case, use the actual sale price to choose the lower absolute log error of v25 and the saved candidate. This is an infeasible routing oracle, not a trained classifier or an independent test.",
    inputs: Object.fromEntries(Object.entries(reports).map(([label, value]) => [label, { file: value.name, sha256: value.sha256 }])),
    globalFusion: {
      premium: cohort(fusionRows, premium), ordinary: cohort(fusionRows, ordinary),
      premiumByFold: Object.fromEntries(fusionFolds.map(([label, start, end]) => [label,
        cohort(fusionRows.filter((row) => row.eventTime >= start && row.eventTime < end), premium)])),
    },
    secondaryFullContext: {
      q1Premium: cohort(secondaryRows("secondaryQ1"), premium),
      q2Premium: cohort(secondaryRows("secondaryQ2"), premium),
      q1q2Premium: cohort([...secondaryRows("secondaryQ1"), ...secondaryRows("secondaryQ2")], premium),
    },
    limitation: "This bound applies only to routing between the two saved point predictions in each exposed development experiment. It does not bound a new model, new evidence source, active-auction nowcast, interval quality, or untouched-market performance.",
  };
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ output: path.basename(output), sha256: hash(fs.readFileSync(output)),
    globalFusion: report.globalFusion, secondaryFullContext: report.secondaryFullContext }, null, 2));
}

if (require.main === module) try { main(); } catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }
module.exports = { oracleSummary };

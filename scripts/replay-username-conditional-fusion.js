"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { fitConditionalFusion, predictConditionalFusion } = require("../lib/username-conditional-fusion");
function summarize(rows, field) {
  const errors = rows.map(row => Math.abs(Math.log(row[field] / row.actualUsd))).sort((a, b) => a - b);
  return { samples: rows.length, medianFactorError: errors.length ? Math.exp(errors[Math.floor(errors.length / 2)]) : null,
    meanAbsoluteLogError: errors.length ? errors.reduce((sum, v) => sum + v, 0) / errors.length : null };
}
function replay(evidence) {
  const history = [], results = [];
  for (const row of evidence.slice().sort((a, b) => Date.parse(a.eventTime) - Date.parse(b.eventTime))) {
    const time = Date.parse(row.eventTime);
    const model = row.vectorUsd ? fitConditionalFusion(history, time) : null;
    const predicted = predictConditionalFusion(model, row.baseUsd, row.vectorUsd, row.username, time);
    results.push({ ...row, conditionalUsd: predicted?.estimateUsd || row.baseUsd, conditionalWeight: predicted?.vectorWeight ?? null });
    if (row.vectorUsd) history.push({ ...row, time });
  }
  const bands = { ordinary: row => row.actualUsd < 100, intermediate: row => row.actualUsd >= 100 && row.actualUsd < 500, premium: row => row.actualUsd >= 500 };
  return { baseline: summarize(results, "baseUsd"), candidate: summarize(results, "conditionalUsd"),
    byPriceBand: Object.fromEntries(Object.entries(bands).map(([key, test]) => [key, {
      baseline: summarize(results.filter(test), "baseUsd"), candidate: summarize(results.filter(test), "conditionalUsd") }])), results };
}
if (require.main === module) {
  const input = path.resolve(__dirname, "../research/telegram-usernames/data/username-evidence-fusion-development-2026-09-08.json");
  const bytes = fs.readFileSync(input), source = JSON.parse(bytes);
  const report = { qualification: false, intervalsEvaluated: false, sourceSha256: crypto.createHash("sha256").update(bytes).digest("hex"), ...replay(source.evidence) };
  const index = process.argv.indexOf("--output");
  if (index >= 0) fs.writeFileSync(path.resolve(process.argv[index + 1]), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ ...report, results: undefined }, null, 2));
}
module.exports = { replay };

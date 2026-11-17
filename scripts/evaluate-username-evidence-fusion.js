"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { loadHistoricalSales } = require("./evaluate-username-rebuild");
const { loadGloveSnapshot } = require("./username-glove-snapshot");
const { backtestTelegramUsernameSales, summarize } = require("../lib/username-backtest");
const { createHistoricalVectorRetrieval } = require("../lib/username-vector-retrieval");
const { fitEvidenceFusion, predictEvidenceFusion, vectorCandidateEstimate } = require("../lib/username-evidence-fusion");

async function main() {
  const { sales, sourceHashes } = await loadHistoricalSales(undefined, { fingerprint: true });
  const snapshot = loadGloveSnapshot();
  const retrieve = createHistoricalVectorRetrieval(sales, { knowledge: snapshot.knowledge });
  const baseline = backtestTelegramUsernameSales(sales, { maxEvaluations: 4000, evaluationStride: 50,
    maxHistory: 1500, modelRefreshInterval: 1000 });
  const history = [], results = [], evidence = [];
  for (const row of baseline.results) {
    const time = Date.parse(row.sale.eventTime);
    const candidates = retrieve(row.sale, time, 10);
    const vectorUsd = vectorCandidateEstimate(candidates);
    const model = fitEvidenceFusion(history, time);
    const fused = predictEvidenceFusion(model, row.prediction.estimateUsd, vectorUsd, time);
    const prediction = fused ? { ...row.prediction, ...fused, confidenceBand: "low", portfolioEligible: false } : row.prediction;
    results.push({ ...row, prediction,
      factorError: Math.max(prediction.estimateUsd / row.sale.priceUsd, row.sale.priceUsd / prediction.estimateUsd),
      insideRange: row.sale.priceUsd >= prediction.rangeLowUsd && row.sale.priceUsd <= prediction.rangeHighUsd });
    evidence.push({ eventId: row.sale.eventId, eventTime: row.sale.eventTime, nftAddress: row.sale.nftAddress,
      username: row.sale.username, actualUsd: row.sale.priceUsd, baseUsd: row.prediction.estimateUsd,
      vectorUsd, fusedUsd: fused?.estimateUsd || null, vectorWeight: fused?.vectorWeight ?? null,
      candidateCount: candidates.length });
    // Reveal the historical outcome only AFTER predicting it. The fitter also
    // excludes same-time events, including when records have equal timestamps.
    if (vectorUsd) history.push({ time, baseUsd: row.prediction.estimateUsd, vectorUsd, actualUsd: row.sale.priceUsd });
  }
  const bands = ["under-25", "25-100", "100-500", "500-plus"];
  const report = { experiment: "prequential-vector-evidence-fusion-v1", qualification: false,
    method: "Development-only, 4000 targets at stride50; base refresh1000; previous50–200 covered predictions fit constrained log-space blend with separate later calibration. No production changes.",
    sourceHashes, attempted: baseline.attempted, evaluated: results.length, abstained: baseline.abstained,
    vectorCovered: history.length, fusedCount: evidence.filter(row => row.fusedUsd !== null).length,
    baseline: summarize(baseline.results), candidate: summarize(results),
    byPriceBand: Object.fromEntries(bands.map(band => [band, {
      baseline: summarize(baseline.results.filter(row => row.priceBand === band)),
      candidate: summarize(results.filter(row => row.priceBand === band)) }])),
    evaluationCases: baseline.evaluationCases, evidence };
  const index = process.argv.indexOf("--output");
  if (index >= 0) {
    if (!process.argv[index + 1]) throw new Error("--output requires a path");
    fs.writeFileSync(path.resolve(process.argv[index + 1]), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  }
  console.log(JSON.stringify({ ...report, evaluationCases: undefined, evidence: undefined }, null, 2));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });

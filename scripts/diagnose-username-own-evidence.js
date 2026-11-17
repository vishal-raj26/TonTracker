"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { loadHistoricalSales } = require("./evaluate-username-rebuild");
const { completedSale } = require("../lib/username-estimator");
function ownEvidence(sales, targets) {
  const chronological = sales.filter(row => completedSale(row) && row.nftAddress && Number.isFinite(Date.parse(row.eventTime)))
    .sort((a, b) => Date.parse(a.eventTime) - Date.parse(b.eventTime));
  const sorted = targets.slice().sort((a, b) => Date.parse(a.eventTime) - Date.parse(b.eventTime));
  const histories = new Map(), seen = new Set();
  let cursor = 0;
  return sorted.map(target => {
    const cutoff = Date.parse(target.eventTime);
    if (!Number.isFinite(cutoff)) throw new Error("Invalid target cutoff");
    while (cursor < chronological.length && Date.parse(chronological[cursor].eventTime) < cutoff) {
      const sale = chronological[cursor++];
      const key = `${sale.nftAddress}:${Date.parse(sale.eventTime)}:${sale.priceUsd}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const history = histories.get(sale.nftAddress) || { names: new Set(), count: 0, latest: null };
      history.names.add(sale.username);
      history.count += 1;
      history.latest = sale;
      histories.set(sale.nftAddress, history);
    }
    const history = histories.get(target.nftAddress);
    const valid = history?.names.size === 1 && history.names.has(target.username);
    const last = valid ? history.latest : null;
    return { ...target, ownStatus: !history ? "absent" : !valid ? "ambiguous" : "available",
      ownCount: valid ? history.count : 0, priorOwnEventId: last?.eventId || null,
      priorOwnUsd: last?.priceUsd || null, priorOwnTime: last?.eventTime || null,
      ownAgeDays: last ? (cutoff - Date.parse(last.eventTime)) / 86400000 : null };
  });
}
function metrics(rows, field) {
  const errors = rows.map(row => Math.abs(Math.log(row[field] / row.actualUsd))).sort((a, b) => a - b);
  return { samples: rows.length, meanAbsoluteLogError: errors.length ? errors.reduce((a, b) => a + b, 0) / errors.length : null,
    medianFactorError: errors.length ? Math.exp(errors[Math.floor(errors.length / 2)]) : null };
}
function summarize(rows) {
  const result = {};
  for (const [band, test] of Object.entries({ overall: () => true, ordinary: r => r.actualUsd < 100,
    intermediate: r => r.actualUsd >= 100 && r.actualUsd < 500, premium: r => r.actualUsd >= 500 })) {
    const all = rows.filter(test), covered = all.filter(row => row.ownStatus === "available");
    result[band] = { attempted: all.length, available: covered.length, absent: all.filter(row => row.ownStatus === "absent").length,
      ambiguous: all.filter(row => row.ownStatus === "ambiguous").length, baselineAll: metrics(all, "baseUsd"),
      baselineCovered: metrics(covered, "baseUsd"), lastOwnCovered: metrics(covered, "priorOwnUsd"),
      byAge: Object.fromEntries(Object.entries({ under30: r => r.ownAgeDays < 30, days30to180: r => r.ownAgeDays >= 30 && r.ownAgeDays < 180,
        over180: r => r.ownAgeDays >= 180 }).map(([key, filter]) => { const group = covered.filter(filter); return [key, {
          baseline: metrics(group, "baseUsd"), lastOwn: metrics(group, "priorOwnUsd") }]; })) };
  }
  return result;
}
async function main() {
  const dir = path.resolve(__dirname, "../research/telegram-usernames/data");
  const bytes = fs.readFileSync(path.join(dir, "username-evidence-fusion-development-2026-09-08.json"));
  const sourceSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  if (sourceSha256 !== "0807dc064b5a5653b004ddfd41ba559a6a95b0dd5c605f597214116371a81448") throw new Error("Development source changed");
  const { sales, sourceHashes } = await loadHistoricalSales(undefined, { fingerprint: true });
  const rows = ownEvidence(sales, JSON.parse(bytes).evidence);
  const report = { qualification: false, diagnosticOnly: true, intervalsEvaluated: false, sourceSha256, sourceHashes,
    method: "Latest strictly prior finalized native sale for same contract and unambiguous name; diagnostic baseline, not a floor or publishable current price",
    summary: summarize(rows), rows };
  const index = process.argv.indexOf("--output");
  if (index < 0) throw new Error("--output required");
  fs.writeFileSync(path.resolve(process.argv[index + 1]), JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify(report.summary, null, 2));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { ownEvidence, summarize };

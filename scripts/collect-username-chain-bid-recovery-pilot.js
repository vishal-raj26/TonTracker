"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const {createTonCenterUsernameVerifier} = require("../lib/toncenter-username-verifier");
const {initialBidEvidence} = require("../lib/username-auction-bid-evidence");

const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");

function selectPilot(auditRows, sourceRows, perStratum = 10) {
  const source = new Map(sourceRows.map(row => [row.eventId, row]));
  const eligible = auditRows.filter(row => row.matchingPublicSale && row.status !== "prior-bids-observed")
    .map(row => ({...source.get(row.eventId), ...row}))
    .filter(row => row.eventId && row.priceNative > 0)
    .sort((a, b) => sha256(a.eventId).localeCompare(sha256(b.eventId)));
  const premium = eligible.filter(row => row.stratum === "premium-all").slice(0, perStratum);
  const ordinary = eligible.filter(row => row.stratum === "ordinary-control").slice(0, perStratum);
  if (premium.length !== perStratum || ordinary.length !== perStratum) throw new Error("Insufficient disjoint pilot strata");
  return [...premium, ...ordinary];
}

async function main() {
  const dataDir = path.resolve(__dirname, "../research/telegram-usernames/data");
  const auditFile = path.join(dataDir, "username-development-bids-expanded-2026-09-19.jsonl");
  const sourceFile = path.join(dataDir, "username-market-stage-development-2026-09-09.json");
  const auditBytes = fs.readFileSync(auditFile), sourceBytes = fs.readFileSync(sourceFile);
  const auditRows = auditBytes.toString("utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
  const sourceRows = JSON.parse(sourceBytes).rows;
  const selected = selectPilot(auditRows, sourceRows);
  const manifestFile = path.join(dataDir, "username-chain-bid-recovery-pilot-2026-09-19.manifest.json");
  const outputFile = path.join(dataDir, "username-chain-bid-recovery-pilot-2026-09-19.json");
  const manifest = {
    qualification: false,
    developmentOnly: true,
    createdBeforeFetch: true,
    selection: "Ten deterministic premium and ten ordinary controls with a matching public sale but no currently exposed prior bid",
    queryWindow: "NFT-account transactions from eight to five days before sale; initial bid verifier requires a successful exact username deployment strictly before sale",
    auditSha256: sha256(auditBytes),
    sourceSha256: sha256(sourceBytes),
    eventIds: selected.map(row => row.eventId)
  };
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2) + "\n", {flag: "wx"});
  const verifier = createTonCenterUsernameVerifier({retries: 1, requestDelayMs: 1100});
  const observedAt = new Date().toISOString(), results = [];
  for (const target of selected) {
    const saleSeconds = Date.parse(target.eventTime) / 1000;
    try {
      const transactions = await verifier.fetchTransactions(target.nftAddress, {
        startUtime: saleSeconds - 8 * 86400,
        endUtime: saleSeconds - 5 * 86400,
        limit: 100
      });
      const proofs = transactions.map(transaction => initialBidEvidence(transaction, target, {cutoff: Date.parse(target.eventTime), observedAt})).filter(Boolean);
      results.push({eventId: target.eventId, username: target.username, stratum: target.stratum, eventTime: target.eventTime,
        saleNative: target.priceNative, transactionCount: transactions.length, proofs,
        exactSaleAmount: proofs.some(proof => BigInt(proof.amountNano) === BigInt(Math.round(target.priceNative * 1e9)))});
    } catch (error) {
      results.push({eventId: target.eventId, username: target.username, stratum: target.stratum, eventTime: target.eventTime,
        saleNative: target.priceNative, error: error.message, proofs: []});
    }
    console.log(JSON.stringify({completed: results.length, total: selected.length, username: target.username,
      proofs: results.at(-1).proofs.length, error: results.at(-1).error || null}));
  }
  fs.writeFileSync(outputFile, JSON.stringify({...manifest, observedAt, results}, null, 2) + "\n", {flag: "wx"});
}

if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });

module.exports = {selectPilot};

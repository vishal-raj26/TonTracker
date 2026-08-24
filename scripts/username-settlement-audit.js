"use strict";

// Read-only public-source coverage audit. It deliberately performs no ledger,
// D1, Postgres, or user-session writes.
const { createFragmentUsernameSource } = require("../lib/fragment-username-source");
const { createTonCenterUsernameVerifier } = require("../lib/toncenter-username-verifier");
const { USERNAME_COLLECTION } = require("../lib/username-collection");
const { normalizeTelegramUsername } = require("../lib/username-structural");

const defaults = ["katrinakaif", "kick", "casino", "auto", "scum", "fintopio_bot"];
const configuredNames = String(process.env.USERNAME_AUDIT_NAMES || "")
  .split(",")
  .map((name) => name.trim())
  .filter(Boolean);
const names = [...new Set((configuredNames.length ? configuredNames : defaults).map(normalizeTelegramUsername))];

async function auditUsernameSettlements(options = {}) {
  const source = options.source || createFragmentUsernameSource({ requestDelayMs: options.requestDelayMs ?? 1_600 });
  const verifier = options.verifier || createTonCenterUsernameVerifier();
  const usernames = options.names || names;
  const results = [];
  for (const username of usernames) {
    try {
      const record = await source.fetchUsernameRecord(username);
      const nftAddress = record.currentOwnerAddress
        ? await verifier.findOwnedUsernameNft(record.currentOwnerAddress, username, USERNAME_COLLECTION)
        : null;
      let verifiedSales = 0;
      for (const event of record.events) {
        if (!nftAddress) continue;
        const proof = await verifier.verifyFragmentSale(event, [nftAddress]);
        if (proof.verified) verifiedSales += 1;
      }
      results.push({ username, reportedSales: record.events.length, ownerResolved: Boolean(record.currentOwnerAddress), nftResolved: Boolean(nftAddress), verifiedSales });
    } catch (error) {
      results.push({ username, error: error.message, reportedSales: 0, ownerResolved: false, nftResolved: false, verifiedSales: 0 });
    }
  }
  const totals = results.reduce((summary, result) => ({
    checked: summary.checked + 1,
    reportedSales: summary.reportedSales + result.reportedSales,
    ownerResolved: summary.ownerResolved + Number(result.ownerResolved),
    nftResolved: summary.nftResolved + Number(result.nftResolved),
    verifiedSales: summary.verifiedSales + result.verifiedSales,
    failures: summary.failures + Number(Boolean(result.error)),
  }), { checked: 0, reportedSales: 0, ownerResolved: 0, nftResolved: 0, verifiedSales: 0, failures: 0 });
  return { generatedAt: new Date().toISOString(), results, totals };
}

if (require.main === module) {
  auditUsernameSettlements().then((report) => {
    console.log(JSON.stringify(report, null, 2));
    if (report.totals.failures) process.exitCode = 1;
  }).catch((error) => { console.error(error); process.exitCode = 1; });
}

module.exports = { auditUsernameSettlements };

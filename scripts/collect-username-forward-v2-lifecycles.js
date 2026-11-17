"use strict";

// Run only after the terminal price-blind manifest is sealed. This file opens
// sale labels for outcome diagnostics; it must never select targets by price.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { bidLifecycleEvidence } = require("../lib/username-auction-bid-evidence");
const { canonicalTonAddress } = require("../lib/ton-address");

const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function loadTargets(dir, manifest) {
  const targets = [];
  const seen = new Set();
  for (const page of manifest.integrityAudit.pageHashes) {
    const file = path.join(dir, manifest.window.directory, page.name);
    if (hash(fs.readFileSync(file)) !== page.sha256) throw new Error(`Frozen page changed: ${page.name}`);
    const payload = JSON.parse(fs.readFileSync(file, "utf8"));
    for (const sale of payload.sales || []) {
      if (seen.has(sale.saleId)) throw new Error(`Duplicate sealed sale: ${sale.saleId}`);
      seen.add(sale.saleId);
      targets.push({ eventId: sale.saleId, username: sale.normalizedName,
        nftAddress: canonicalTonAddress(sale.assetKey), eventTime: sale.soldAt,
        priceNative: Number(sale.priceGram), actualUsd: Number(sale.priceUsd),
        historicalUsdRate: Number(sale.historicalUsdRate) });
    }
  }
  if (targets.length !== manifest.integrityAudit.uniqueEvents) throw new Error("Sealed target count changed");
  return targets.sort((a, b) => a.eventId.localeCompare(b.eventId));
}

async function main() {
  const dir = path.resolve(__dirname, "../research/telegram-usernames/data");
  const manifestFile = path.join(dir, "username-forward-v2-qualification-final-manifest.json");
  const manifestBytes = fs.readFileSync(manifestFile);
  const manifest = JSON.parse(manifestBytes);
  if (!manifest.sealedBeforeOutcomeLabelsOpened) throw new Error("Missing terminal pre-label seal");
  const protocolFile = path.join(dir, manifest.evaluationProtocol?.file || "");
  if (!manifest.evaluationProtocol?.file || hash(fs.readFileSync(protocolFile)) !== manifest.evaluationProtocol.sha256) {
    throw new Error("Frozen evaluation protocol missing or changed");
  }
  const protocol = JSON.parse(fs.readFileSync(protocolFile, "utf8"));
  if (hash(fs.readFileSync(__filename)) !== protocol.frozenFiles["scripts/collect-username-forward-v2-lifecycles.js"]) {
    throw new Error("Frozen lifecycle collector changed");
  }
  const targets = loadTargets(dir, manifest);
  const output = path.join(dir, "username-forward-v2-lifecycles.jsonl");
  const prior = fs.existsSync(output) ? fs.readFileSync(output, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse) : [];
  const done = new Set(prior.map((row) => row.eventId));
  if (done.size !== prior.length || [...done].some((id) => !targets.some((target) => target.eventId === id))) {
    throw new Error("Existing lifecycle rows do not match sealed targets");
  }
  const headers = { accept: "application/json", "user-agent": "TonTrack-Forward-V2-Lifecycle/1.0" };
  let lastRequest = 0;
  async function request(batch, attempt = 0) {
    const wait = 1100 - (Date.now() - lastRequest);
    if (wait > 0) await sleep(wait);
    lastRequest = Date.now();
    const times = batch.map((row) => Date.parse(row.eventTime) / 1000);
    const query = new URLSearchParams({ start_utime: String(Math.floor(Math.min(...times) - 8 * 86400)),
      end_utime: String(Math.ceil(Math.max(...times) + 60)), limit: "1000", sort: "asc" });
    for (const row of batch) query.append("account", row.nftAddress);
    const response = await fetch(`https://toncenter.com/api/v3/transactions?${query}`, { headers, signal: AbortSignal.timeout(30_000) });
    if ((response.status === 429 || response.status >= 500) && attempt < 3) {
      await sleep(1000 * 2 ** attempt);
      return request(batch, attempt + 1);
    }
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`TON Center transactions ${response.status}: ${payload.error || "unknown"}`);
    const rows = payload.transactions || [];
    if (rows.length >= 1000) throw new Error("transaction-batch-truncated");
    return rows;
  }
  async function collect(batch) {
    try {
      const transactions = await request(batch);
      const byAccount = new Map();
      for (const transaction of transactions) {
        const key = canonicalTonAddress(transaction.account);
        const rows = byAccount.get(key) || [];
        rows.push(transaction);
        byAccount.set(key, rows);
      }
      return batch.map((target) => ({ target, transactions: byAccount.get(target.nftAddress) || [] }));
    } catch (error) {
      if (batch.length > 1) {
        const middle = Math.ceil(batch.length / 2);
        return [...await collect(batch.slice(0, middle)), ...await collect(batch.slice(middle))];
      }
      return [{ target: batch[0], error: error.message, transactions: [] }];
    }
  }
  const pending = targets.filter((row) => !done.has(row.eventId));
  for (let index = 0; index < pending.length; index += 20) {
    const batch = await collect(pending.slice(index, index + 20));
    for (const { target, transactions, error } of batch) {
      let result;
      if (error) result = { status: "fetch-error", error, bids: [] };
      else try {
        const lifecycle = bidLifecycleEvidence(transactions, target, {
          cutoff: Date.parse(target.eventTime), observedAt: new Date().toISOString() });
        const latest = lifecycle.latestBid?.amountNano;
        result = { transactionCount: transactions.length, ...lifecycle,
          latestBidMatchesSale: latest ? BigInt(latest) === BigInt(Math.round(target.priceNative * 1e9)) : false };
      } catch (cause) { result = { status: "parse-error", error: cause.message, bids: [] }; }
      fs.appendFileSync(output, `${JSON.stringify({ ...target, ...result })}\n`);
      done.add(target.eventId);
    }
    console.log(JSON.stringify({ completed: done.size, total: targets.length, batch: batch.length }));
  }
  const rows = fs.readFileSync(output, "utf8").trim().split(/\r?\n/).filter(Boolean).map(JSON.parse);
  console.log(JSON.stringify({ qualificationInput: true, finalManifestSha256: hash(manifestBytes),
    lifecycleSha256: hash(fs.readFileSync(output)), attempted: rows.length,
    verifiedWithBids: rows.filter((row) => row.status === "verified-bid-lifecycle" && row.bids?.length).length,
    unavailable: rows.filter((row) => row.status !== "verified-bid-lifecycle").length }));
}

if (require.main === module) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });
module.exports = { loadTargets };

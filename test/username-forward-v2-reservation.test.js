"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { FROM, UNTIL, DIRECTORY, cutoff, pageSize, assertCompletePage } = require("../scripts/collect-username-forward-v2-local");
const { audit } = require("../scripts/audit-username-forward-v2-reservation");
const { makeManifest } = require("../scripts/seal-username-forward-v2-reservation");
const { terminalReason } = require("../scripts/seal-username-forward-v2-qualification");

test("forward-v2 collection requires a future-window cutoff and bounded pages", () => {
  const now = Date.parse("2026-09-28T00:00:00Z");
  assert.equal(cutoff(["--until", "2026-09-27T12:00:00Z"], now), Date.parse("2026-09-27T12:00:00Z") / 1000);
  assert.throws(() => cutoff(["--until", FROM], now));
  assert.throws(() => cutoff(["--until", "2026-09-29T00:00:00Z"], now));
  assert.equal(pageSize([]), 80);
  assert.throws(() => pageSize(["--page-size", "9"]));
  assert.ok(Date.parse(UNTIL) > Date.parse(FROM));
});

test("forward-v2 collector refuses a partial FX page before writing a checkpoint", () => {
  assert.doesNotThrow(() => assertCompletePage({ pendingHistoricalUsd: 0 }, 7, 10));
  assert.throws(() => assertCompletePage({ pendingHistoricalUsd: 1 }, 7, 10), /no partial page/);
  assert.throws(() => assertCompletePage({ pendingHistoricalUsd: 0 }, 11, 10), /capacity/);
});

test("forward-v2 audit is price-blind and rejects an out-of-window event", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "username-forward-v2-"));
  const directory = path.join(root, DIRECTORY);
  fs.mkdirSync(directory);
  try {
    const file = "page-fixture.json";
    const sale = { saleId: "sale-1", assetKind: "username", assetKey: "nft-1", soldAt: FROM, priceUsd: 12345 };
    const bytes = `${JSON.stringify({ from: FROM, sales: [sale] })}\n`;
    fs.writeFileSync(path.join(directory, file), bytes);
    const state = { from: FROM, saleRows: 1, cursor: { paginationMode: "time-offset", absoluteOffset: 1 },
      latestPage: file, latestPageSha256: crypto.createHash("sha256").update(bytes).digest("hex") };
    fs.writeFileSync(path.join(directory, "state.json"), JSON.stringify(state));
    const result = audit(directory);
    assert.equal(result.pricesOpened, false);
    assert.equal(result.uniqueEvents, 1);
    assert.equal(JSON.stringify(result).includes("12345"), false);
    sale.soldAt = UNTIL;
    const changed = `${JSON.stringify({ from: FROM, sales: [sale] })}\n`;
    fs.writeFileSync(path.join(directory, file), changed);
    state.latestPageSha256 = crypto.createHash("sha256").update(changed).digest("hex");
    fs.writeFileSync(path.join(directory, "state.json"), JSON.stringify(state));
    assert.throws(() => audit(directory), /reserved end/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("forward-v2 manifest freezes independent weeks and rejects late sealing", () => {
  const repo = path.resolve(__dirname, "..");
  const manifest = makeManifest(repo, "2026-09-25T12:00:00Z");
  assert.equal(manifest.window.maximumRawSaleRows, 10000);
  assert.equal(manifest.window.weeklyBlocks[1], "2026-10-04T00:00:00Z");
  assert.equal(manifest.gates.minimumPremiumWeeklyBlocks, 2);
  assert.equal(manifest.selection.noPoolingWithOriginalForwardCohort, true);
  assert.throws(() => makeManifest(repo, FROM), /before its start/);
});

test("forward-v2 final seal needs capacity exhaustion or caught-up frozen end", () => {
  const report = { pages: [{ eventCount: 100 }] };
  const state = { saleRows: 100, requestedEndUtime: Date.parse(UNTIL) / 1000 - 3600,
    cursor: { caughtUp: true }, metadata: { processedAt: UNTIL } };
  assert.equal(terminalReason(report, state, Date.parse(UNTIL) + 1000), null);
  state.requestedEndUtime = Date.parse(UNTIL) / 1000;
  assert.equal(terminalReason(report, state, Date.parse(UNTIL) + 1000), "untilExclusive");
  report.pages[0].eventCount = 9995;
  state.saleRows = 9995;
  assert.equal(terminalReason(report, state, Date.parse(FROM)), "capacitySafety");
  state.saleRows = 9994;
  assert.throws(() => terminalReason(report, state), /counter mismatch/);
});

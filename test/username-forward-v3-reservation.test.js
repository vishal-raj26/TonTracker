"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { BLOCKS, DIRECTORY, MAX_SALE_ROWS_PER_BLOCK, blockIndex, cutoff, pageSize,
  assertCompletePage } = require("../scripts/collect-username-forward-v3-local");
const { audit } = require("../scripts/audit-username-forward-v3-reservation");
const { makeManifest } = require("../scripts/seal-username-forward-v3-reservation");

test("forward-v3 reserves three disjoint future weekly blocks and fixed per-block capacity", () => {
  assert.equal(BLOCKS.length, 3);
  assert.equal(MAX_SALE_ROWS_PER_BLOCK, 10000);
  for (let i = 0; i < BLOCKS.length; i += 1) {
    assert.equal(Date.parse(BLOCKS[i].until) - Date.parse(BLOCKS[i].from), 2 * 86400000);
    if (i) assert.ok(Date.parse(BLOCKS[i].from) > Date.parse(BLOCKS[i - 1].until));
  }
  assert.equal(blockIndex(["--block", "2"]), 2);
  assert.throws(() => blockIndex(["--block", "3"]));
  assert.throws(() => blockIndex([]));
  assert.equal(pageSize([]), 80);
  assert.throws(() => pageSize(["--page-size", "9"]));
  const now = Date.parse("2026-10-07T00:00:00Z");
  assert.equal(cutoff(["--until", "2026-10-05T12:00:00Z"], BLOCKS[0], now), Date.parse("2026-10-05T12:00:00Z") / 1000);
  assert.equal(cutoff(["--until", "2026-10-07T00:00:00Z"], BLOCKS[0], now), Date.parse(BLOCKS[0].until) / 1000);
  assert.throws(() => cutoff(["--until", BLOCKS[0].from], BLOCKS[0], now));
  assert.throws(() => cutoff(["--until", "2026-10-08T00:00:00Z"], BLOCKS[0], now));
});

test("forward-v3 refuses partial historical FX and unaccounted sales", () => {
  assert.doesNotThrow(() => assertCompletePage({ pendingHistoricalUsd: 0, sales: 4 }, 4, 10));
  assert.throws(() => assertCompletePage({ pendingHistoricalUsd: 1, sales: 4 }, 4, 10));
  assert.throws(() => assertCompletePage({ pendingHistoricalUsd: 0, sales: 3 }, 4, 10));
  assert.throws(() => assertCompletePage({ pendingHistoricalUsd: 0, sales: 11 }, 11, 10));
});

test("forward-v3 manifest fixes independent blocks and qualification gates before collection", () => {
  const repo = path.resolve(__dirname, "..");
  const manifest = makeManifest(repo, "2026-09-27T07:00:00Z");
  assert.equal(manifest.window.blocks.length, 3);
  assert.equal(manifest.window.maximumRawSaleRowsOverall, 30000);
  assert.equal(manifest.selection.rejectAnyEventOverlapWithV2, true);
  assert.equal(manifest.gates.minimumPremiumWeeklyBlocks, 2);
  assert.equal(manifest.gates.minimumPremiumUniqueIdentities, 100);
  assert.throws(() => makeManifest(repo, BLOCKS[0].from), /before its first block/);
});

test("forward-v3 block audit is price-blind and enforces upper time boundary", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "username-forward-v3-"));
  const directory = path.join(root, DIRECTORY, "block-0");
  fs.mkdirSync(directory, { recursive: true });
  try {
    const file = "page-fixture.json";
    const sale = { saleId: "sale-1", assetKind: "username", assetKey: "nft-1",
      soldAt: "2026-10-04T12:00:00Z", priceUsd: 12345 };
    function write() {
      const bytes = `${JSON.stringify({ block: 0, from: BLOCKS[0].from, until: BLOCKS[0].until,
        requestedEndUtime: Date.parse(BLOCKS[0].until) / 1000,
        cursor: { paginationMode: "time-offset", absoluteOffset: 1 },
        metadata: { messages: 1, assets: 0, sales: 1, pendingHistoricalUsd: 0 },
        assets: [], sales: [sale] })}\n`;
      fs.writeFileSync(path.join(directory, file), bytes);
      fs.writeFileSync(path.join(directory, "state.json"), JSON.stringify({
        schemaVersion: "username-forward-v3-local-v1", block: 0,
        from: BLOCKS[0].from, until: BLOCKS[0].until, saleRows: 1,
        cursor: { paginationMode: "time-offset", absoluteOffset: 1 },
        requestedEndUtime: Date.parse(BLOCKS[0].until) / 1000,
        latestPage: file, latestPageSha256: crypto.createHash("sha256").update(bytes).digest("hex"),
      }));
    }
    write();
    const report = audit(root);
    assert.equal(report.pricesOpened, false);
    assert.equal(report.uniqueEvents, 1);
    assert.equal(JSON.stringify(report).includes("12345"), false);
    const v2 = path.join(root, "current-username-settlements-forward-v2");
    fs.mkdirSync(v2);
    const v2Page = `${JSON.stringify({ from: "2026-09-27T00:00:00Z", sales: [sale] })}\n`;
    fs.writeFileSync(path.join(v2, file), v2Page);
    fs.writeFileSync(path.join(v2, "state.json"), JSON.stringify({
      from: "2026-09-27T00:00:00Z", latestPage: file,
      latestPageSha256: crypto.createHash("sha256").update(v2Page).digest("hex"),
      cursor: { paginationMode: "time-offset", absoluteOffset: 1 },
    }));
    assert.throws(() => audit(root), /overlaps the earlier v2 cohort/);
    fs.rmSync(v2, { recursive: true });
    sale.soldAt = BLOCKS[0].until;
    write();
    assert.throws(() => audit(root), /reserved block end/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

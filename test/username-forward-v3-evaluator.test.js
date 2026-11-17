"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { BLOCKS, DIRECTORY } = require("../scripts/collect-username-forward-v3-local");
const { terminalReason, makeFinalManifest } = require("../scripts/seal-username-forward-v3-qualification");
const { loadTargets } = require("../scripts/collect-username-forward-v3-lifecycles");
const { blockFor, blockSummaries } = require("../scripts/evaluate-username-forward-v3-qualification");
const { makeProtocol } = require("../scripts/seal-username-forward-v3-evaluation-protocol");

const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");

test("v3 requires each disjoint block to stop at its own frozen terminal condition", () => {
  const report = { pages: [{ eventCount: 100 }] };
  const state = { saleRows: 100, requestedEndUtime: Date.parse(BLOCKS[0].until) / 1000 - 1,
    cursor: { caughtUp: true }, metadata: { processedAt: BLOCKS[0].until } };
  assert.equal(terminalReason(report, state, BLOCKS[0], Date.parse(BLOCKS[0].until) + 1), null);
  state.requestedEndUtime += 1;
  assert.equal(terminalReason(report, state, BLOCKS[0], Date.parse(BLOCKS[0].until) + 1), "untilExclusive");
  report.pages[0].eventCount = 9991;
  state.saleRows = 9991;
  assert.equal(terminalReason(report, state, BLOCKS[0], Date.parse(BLOCKS[0].from)), "capacitySafety");
  state.saleRows = 9990;
  assert.throws(() => terminalReason(report, state, BLOCKS[0]), /counter mismatch/);
});

test("v3 evaluator protocol freezes exact code and refuses a late seal", () => {
  const repo = path.resolve(__dirname, "..");
  const reservationFile = path.join(repo, "research/telegram-usernames/data",
    "username-forward-v3-reservation-manifest-2026-09-27.json");
  const protocol = makeProtocol(repo, reservationFile, Date.parse(BLOCKS[0].from) - 1);
  assert.equal(protocol.sealedBeforeWindow, true);
  assert.equal(protocol.zeroCollectedEventsAtSeal, true);
  assert.equal(protocol.gates.minimumPremiumWeeklyBlocks, 2);
  assert.ok(protocol.frozenFiles["scripts/evaluate-username-forward-v3-qualification.js"]);
  assert.throws(() => makeProtocol(repo, reservationFile, Date.parse(BLOCKS[0].from)), /before the first block/);
});

test("v3 final manifest rejects an unfinished later block and preserves disjoint boundaries", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "username-forward-v3-final-"));
  try {
    const report = { qualification: false, pricesOpened: false, directory: DIRECTORY,
      crossBlockDuplicateEvents: 0, uniqueEvents: 3, uniqueAssets: 3,
      blocks: BLOCKS.map((block, index) => ({ index, ...block, uniqueEvents: 1,
        uniqueAssets: 1, duplicateRows: 0, pages: [{ name: `page-${index}.json`, sha256: "a", eventCount: 1 }] })) };
    for (const [index, block] of BLOCKS.entries()) {
      const directory = path.join(root, DIRECTORY, `block-${index}`);
      fs.mkdirSync(directory, { recursive: true });
      fs.writeFileSync(path.join(directory, "state.json"), JSON.stringify({ saleRows: 1,
        requestedEndUtime: Date.parse(block.until) / 1000,
        cursor: { caughtUp: true }, metadata: { processedAt: block.until } }));
    }
    const reservation = { reference: { file: "reservation", sha256: "a" }, window: { directory: DIRECTORY,
      blocks: BLOCKS }, candidate: {}, evaluation: {}, gates: {}, trainingSources: {}, limitations: [] };
    const protocol = { reference: { file: "protocol", sha256: "b" } };
    assert.throws(() => makeFinalManifest(root, reservation, protocol, report, root,
      Date.parse(BLOCKS[1].until)), /block 2.*terminal/);
    const manifest = makeFinalManifest(root, reservation, protocol, report, root,
      Date.parse(BLOCKS[2].until) + 1);
    assert.equal(manifest.blocks.length, 3);
    assert.equal(manifest.window.weeklyBlocks[1], BLOCKS[1].from);
    assert.equal(manifest.blocks[2].stoppedBy, "untilExclusive");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("v3 targets include all sealed pages but reject gap cases and changed page bytes", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "username-forward-v3-targets-"));
  try {
    const nftAddress = `0:${"a".repeat(64)}`;
    const blocks = BLOCKS.map((block, index) => {
      const directory = path.join(root, DIRECTORY, `block-${index}`);
      fs.mkdirSync(directory, { recursive: true });
      const sale = { saleId: `event-${index}`, normalizedName: `name${index}`,
        assetKey: nftAddress, soldAt: block.from, priceGram: 10, priceUsd: 20,
        historicalUsdRate: 2 };
      const bytes = Buffer.from(JSON.stringify({ block: index, sales: [sale] }));
      const name = `page-${index}.json`;
      fs.writeFileSync(path.join(directory, name), bytes);
      return { index, ...block, uniqueEvents: 1, pageHashes: [{ name, sha256: hash(bytes), eventCount: 1 }] };
    });
    const manifest = { sealedBeforeOutcomeLabelsOpened: true,
      window: { directory: DIRECTORY }, blocks, integrityAudit: { uniqueEvents: 3 } };
    assert.equal(loadTargets(root, manifest).length, 3);
    assert.throws(() => blockFor("2026-10-07T00:00:00Z", blocks), /outside selected/);
    const rows = blocks.map((block, index) => ({ sale: { eventTime: block.from,
      priceUsd: index === 1 ? 600 : 10, nftAddress: `${nftAddress}-${index}` },
      baseline: { available: false }, candidate: { available: false } }));
    const summaries = blockSummaries(rows, { blocks, gates: { premiumThresholdUsd: 500 } });
    assert.deepEqual(Object.values(summaries).map((item) => item.attempts), [1, 1, 1]);
    assert.deepEqual(Object.values(summaries).map((item) => item.premiumUniqueIdentities), [0, 1, 0]);
    fs.appendFileSync(path.join(root, DIRECTORY, "block-1", "page-1.json"), " ");
    assert.throws(() => loadTargets(root, manifest), /Frozen page changed/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

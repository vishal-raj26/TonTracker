"use strict";

// This is the last price-blind gate. Do not open page sale labels until it seals.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { audit } = require("./audit-username-forward-v3-reservation");
const { BLOCKS, DIRECTORY, MAX_SALE_ROWS_PER_BLOCK } = require("./collect-username-forward-v3-local");

const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const fileHash = (file) => hash(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

function terminalReason(report, state, block, now = Date.now()) {
  const saleRows = report.pages.reduce((sum, page) => sum + page.eventCount, 0);
  if (saleRows !== state.saleRows || saleRows > MAX_SALE_ROWS_PER_BLOCK)
    throw new Error("Forward-v3 block cap/counter mismatch");
  if (MAX_SALE_ROWS_PER_BLOCK - saleRows < 10) return "capacitySafety";
  if (now >= Date.parse(block.until) && state.requestedEndUtime >= Date.parse(block.until) / 1000
    && state.cursor?.caughtUp === true && Date.parse(state.metadata?.processedAt) >= Date.parse(block.until))
    return "untilExclusive";
  return null;
}

function verifyFrozenFiles(repo, reservation, protocol) {
  for (const [name, expected] of Object.entries({ ...reservation.candidate.files,
    ...reservation.collectionFiles, ...reservation.trainingSources, ...protocol.frozenFiles })) {
    if (fileHash(path.join(repo, name)) !== expected) throw new Error(`Frozen file changed: ${name}`);
  }
}

function makeFinalManifest(repo, reservation, protocol, report, root, now = Date.now()) {
  if (report.qualification !== false || report.pricesOpened !== false || report.directory !== DIRECTORY
    || report.blocks.length !== BLOCKS.length || report.crossBlockDuplicateEvents !== 0)
    throw new Error("Final audit is not the unopened complete forward-v3 reservation");
  const blocks = report.blocks.map((observed, index) => {
    const block = BLOCKS[index];
    const state = readJson(path.join(root, DIRECTORY, `block-${index}`, "state.json"));
    if (observed.index !== index || observed.from !== block.from || observed.until !== block.until)
      throw new Error("Forward-v3 block order or boundary changed");
    const stoppedBy = terminalReason(observed, state, block, now);
    if (!stoppedBy) throw new Error(`Forward-v3 block ${index} has not reached its frozen terminal condition`);
    return { index, from: block.from, until: block.until, stoppedBy,
      rawSaleRows: state.saleRows, uniqueEvents: observed.uniqueEvents,
      uniqueAssets: observed.uniqueAssets, duplicateRows: observed.duplicateRows,
      pageHashes: observed.pages.map((page) => ({ name: page.name, sha256: page.sha256,
        eventCount: page.eventCount })) };
  });
  if (blocks.reduce((sum, block) => sum + block.uniqueEvents, 0) !== report.uniqueEvents)
    throw new Error("Forward-v3 combined target count changed");
  return { schemaVersion: "username-forward-v3-qualification-final-v1",
    sealedBeforeOutcomeLabelsOpened: true, createdAt: new Date(now).toISOString(),
    reservation: reservation.reference, evaluationProtocol: protocol.reference,
    integrityAudit: report.reference,
    window: { ...reservation.window,
      // The shared frozen gate uses half-open boundaries. There are no selected
      // events in the gaps, so these boundaries assign each selected case to
      // its predeclared weekly block without admitting any gap events.
      weeklyBlocks: [...BLOCKS.map((block) => block.from), BLOCKS.at(-1).until] },
    blocks, candidate: reservation.candidate, evaluation: reservation.evaluation,
    gates: reservation.gates, trainingSources: reservation.trainingSources,
    limitations: reservation.limitations };
}

function main() {
  const index = process.argv.indexOf("--audit");
  if (index < 0 || !process.argv[index + 1]) throw new Error("--audit required");
  const repo = path.resolve(__dirname, "..");
  const root = path.join(repo, "research/telegram-usernames/data");
  const reservationFile = path.join(root, "username-forward-v3-reservation-manifest-2026-09-27.json");
  const protocolFile = path.join(root, "username-forward-v3-evaluation-protocol-2026-09-27.json");
  const auditFile = path.resolve(process.argv[index + 1]);
  const output = path.join(root, "username-forward-v3-qualification-final-manifest.json");
  if (fs.existsSync(output)) throw new Error("Forward-v3 final manifest already exists");
  const reservation = readJson(reservationFile), protocol = readJson(protocolFile);
  if (!reservation.sealedBeforeWindow || !protocol.sealedBeforeWindow
    || protocol.reservationSha256 !== fileHash(reservationFile)) throw new Error("Frozen protocol lineage changed");
  verifyFrozenFiles(repo, reservation, protocol);
  const report = readJson(auditFile), fresh = audit(root);
  for (const key of ["directory", "blocks", "uniqueEvents", "uniqueAssets", "crossBlockDuplicateEvents"]) {
    if (JSON.stringify(report[key]) !== JSON.stringify(fresh[key]))
      throw new Error(`Stale or modified final audit: ${key}`);
  }
  reservation.reference = { file: path.basename(reservationFile), sha256: fileHash(reservationFile) };
  protocol.reference = { file: path.basename(protocolFile), sha256: fileHash(protocolFile) };
  report.reference = { file: path.basename(auditFile), sha256: fileHash(auditFile),
    uniqueEvents: report.uniqueEvents, uniqueAssets: report.uniqueAssets };
  const manifest = makeFinalManifest(repo, reservation, protocol, report, root);
  fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ output: path.basename(output), sha256: fileHash(output),
    blocks: manifest.blocks.map(({ index, stoppedBy, uniqueEvents }) => ({ index, stoppedBy, uniqueEvents })) }, null, 2));
}

if (require.main === module) try { main(); } catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }
module.exports = { terminalReason, verifyFrozenFiles, makeFinalManifest };

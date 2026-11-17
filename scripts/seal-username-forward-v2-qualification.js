"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { audit } = require("./audit-username-forward-v2-reservation");
const { FROM, UNTIL, DIRECTORY, MAX_SALE_ROWS } = require("./collect-username-forward-v2-local");

const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const fileHash = (file) => hash(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

function terminalReason(report, state, now = Date.now()) {
  const saleRows = report.pages.reduce((sum, page) => sum + page.eventCount, 0);
  if (saleRows !== state.saleRows || saleRows > MAX_SALE_ROWS) throw new Error("Forward-v2 cap/counter mismatch");
  if (MAX_SALE_ROWS - saleRows < 10) return "capacitySafety";
  if (now >= Date.parse(UNTIL) && state.requestedEndUtime >= Date.parse(UNTIL) / 1000
    && state.cursor?.caughtUp === true && Date.parse(state.metadata?.processedAt) >= Date.parse(UNTIL)) return "untilExclusive";
  return null;
}

function verifyFrozenFiles(repo, reservation, supplement) {
  const collector = "scripts/collect-username-forward-v2-local.js";
  for (const [name, expected] of Object.entries({ ...reservation.candidate.files,
    ...reservation.collectionFiles, ...reservation.trainingSources })) {
    const current = name === collector ? supplement.supersedesOnly.newSha256 : expected;
    if (fileHash(path.join(repo, name)) !== current) throw new Error(`Frozen file changed: ${name}`);
  }
}

function main() {
  const index = process.argv.indexOf("--audit");
  if (index < 0) throw new Error("--audit required");
  const repo = path.resolve(__dirname, "..");
  const dir = path.join(repo, "research/telegram-usernames/data");
  const reservationFile = path.join(dir, "username-forward-v2-reservation-manifest-2026-09-25.json");
  const supplementFile = path.join(dir, "username-forward-v2-protocol-supplement-v2-2026-09-25.json");
  const evaluationProtocolFile = path.join(dir, "username-forward-v2-evaluation-protocol-supplement-2026-09-25.json");
  const auditFile = path.resolve(process.argv[index + 1]);
  const output = path.join(dir, "username-forward-v2-qualification-final-manifest.json");
  if (fs.existsSync(output)) throw new Error("Forward-v2 final manifest already exists");
  const reservation = readJson(reservationFile), supplement = readJson(supplementFile);
  const evaluationProtocol = readJson(evaluationProtocolFile), report = readJson(auditFile);
  const state = readJson(path.join(dir, DIRECTORY, "state.json"));
  if (report.qualification !== false || report.pricesOpened !== false || report.directory !== DIRECTORY || report.from !== FROM) {
    throw new Error("Final audit is not the unopened forward-v2 reservation");
  }
  if (fileHash(reservationFile) !== supplement.originalManifestSha256) throw new Error("Frozen reservation changed");
  if (fileHash(reservationFile) !== evaluationProtocol.reservationSha256
    || fileHash(supplementFile) !== evaluationProtocol.collectionSupplementSha256) throw new Error("Evaluation protocol lineage changed");
  for (const [name, expected] of Object.entries(evaluationProtocol.frozenFiles)) {
    if (fileHash(path.join(repo, name)) !== expected) throw new Error(`Frozen evaluation file changed: ${name}`);
  }
  verifyFrozenFiles(repo, reservation, supplement);
  const fresh = audit(path.join(dir, DIRECTORY));
  for (const key of ["cursor", "pages", "events", "uniqueEvents", "uniqueAssets", "duplicateRows"]) {
    if (JSON.stringify(report[key]) !== JSON.stringify(fresh[key])) throw new Error(`Stale or modified final audit: ${key}`);
  }
  const stoppedBy = terminalReason(report, state);
  if (!stoppedBy) throw new Error("Forward-v2 reservation has not reached its frozen terminal condition");
  const manifest = {
    schemaVersion: "username-forward-v2-qualification-final-v1",
    sealedBeforeOutcomeLabelsOpened: true,
    createdAt: new Date().toISOString(), stoppedBy,
    reservation: { file: path.basename(reservationFile), sha256: fileHash(reservationFile) },
    protocolSupplement: { file: path.basename(supplementFile), sha256: fileHash(supplementFile) },
    evaluationProtocol: { file: path.basename(evaluationProtocolFile), sha256: fileHash(evaluationProtocolFile) },
    integrityAudit: { file: path.basename(auditFile), sha256: fileHash(auditFile),
      rawSaleRows: state.saleRows, uniqueEvents: report.uniqueEvents, uniqueAssets: report.uniqueAssets,
      duplicateRows: report.duplicateRows, pageHashes: report.pages.map((page) => ({ name: page.name, sha256: page.sha256, eventCount: page.eventCount })) },
    window: reservation.window, candidate: reservation.candidate, evaluation: reservation.evaluation,
    gates: reservation.gates, trainingSources: reservation.trainingSources,
    limitations: reservation.limitations,
  };
  fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ output: path.basename(output), sha256: fileHash(output), stoppedBy,
    uniqueEvents: report.uniqueEvents, uniqueAssets: report.uniqueAssets, pages: report.pages.length }, null, 2));
}

if (require.main === module) try { main(); } catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }
module.exports = { terminalReason, verifyFrozenFiles };

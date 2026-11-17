"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const fileHash = (file) => hash(fs.readFileSync(file));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

function terminalReason(audit, reservation, now = Date.now()) {
  if (audit.uniqueEvents > reservation.window.maximumUniqueEvents) throw new Error("Secondary reservation exceeded its frozen event cap");
  if (audit.uniqueEvents === reservation.window.maximumUniqueEvents) return "maximumUniqueEvents";
  if (now >= Date.parse(reservation.window.untilExclusive) && audit.cursor?.caughtUp === true) return "untilExclusive";
  return null;
}

function argument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function main() {
  const repo = path.resolve(__dirname, "..");
  const dir = path.join(repo, "research/telegram-usernames/data");
  const reservationFile = path.join(dir, "username-secondary-forward-reservation-manifest-2026-09-20.json");
  const supplementFile = path.join(dir, "username-secondary-qualification-protocol-supplement-v3-2026-09-25.json");
  const auditFile = path.resolve(argument("--audit") || "");
  const output = path.join(dir, "username-secondary-qualification-final-manifest.json");
  if (!argument("--audit")) throw new Error("--audit is required");
  if (fs.existsSync(output)) throw new Error("Secondary final manifest already exists");
  const reservation = readJson(reservationFile);
  const supplement = readJson(supplementFile);
  const audit = readJson(auditFile);
  if (audit.pricesOpened !== false || audit.qualification !== false) throw new Error("Final audit must be price-blind");
  if (audit.directory !== reservation.window.directory || audit.from !== reservation.window.fromInclusive) throw new Error("Final audit window mismatch");
  const stoppedBy = terminalReason(audit, reservation);
  if (!stoppedBy) throw new Error("Secondary reservation has not reached its frozen terminal condition");
  if (fileHash(reservationFile) !== supplement.reservation.sha256) throw new Error("Original reservation changed");
  for (const [name, expected] of Object.entries({ ...reservation.candidate.files, ...supplement.frozenFiles })) {
    if (fileHash(path.join(repo, name)) !== expected) throw new Error(`Frozen file changed: ${name}`);
  }
  const historicalFiles = ["dune_username_sales.part", "tonapi_username_universe.csv"];
  const manifest = { schemaVersion: "username-secondary-qualification-final-manifest-v1", sealedBeforeOutcomeLabelsOpened: true,
    createdAt: new Date().toISOString(), stoppedBy, reservation: { file: path.basename(reservationFile), sha256: fileHash(reservationFile) },
    protocolSupplement: { file: path.basename(supplementFile), sha256: fileHash(supplementFile) },
    integrityAudit: { file: path.basename(auditFile), sha256: fileHash(auditFile), uniqueEvents: audit.uniqueEvents,
      uniqueAssets: audit.uniqueAssets, pageCount: audit.pages.length, duplicateRows: audit.duplicateRows },
    window: reservation.window, candidate: reservation.candidate, baseline: reservation.baseline, gates: supplement.gates,
    frozenFiles: { ...reservation.candidate.files, ...supplement.frozenFiles },
    trainingSources: Object.fromEntries(historicalFiles.map((name) => [name, fileHash(path.join(dir, name))])),
    limitations: reservation.limitations };
  fs.writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ output: path.basename(output), sha256: fileHash(output), stoppedBy,
    uniqueEvents: audit.uniqueEvents, uniqueAssets: audit.uniqueAssets, pages: audit.pages.length }, null, 2));
}

module.exports = { terminalReason };
if (require.main === module) try { main(); } catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }

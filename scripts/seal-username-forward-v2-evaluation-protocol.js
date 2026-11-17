"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { FROM, DIRECTORY } = require("./collect-username-forward-v2-local");

const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const fileHash = (file) => hash(fs.readFileSync(file));

function main() {
  const repo = path.resolve(__dirname, "..");
  const dir = path.join(repo, "research/telegram-usernames/data");
  const reservationFile = path.join(dir, "username-forward-v2-reservation-manifest-2026-09-25.json");
  const supplementFile = path.join(dir, "username-forward-v2-protocol-supplement-v2-2026-09-25.json");
  const output = path.join(dir, "username-forward-v2-evaluation-protocol-supplement-2026-09-25.json");
  const createdAt = new Date().toISOString();
  if (Date.parse(createdAt) >= Date.parse(FROM)) throw new Error("Evaluation protocol must be sealed before the window");
  if (fs.existsSync(path.join(dir, DIRECTORY))) throw new Error("Cannot freeze evaluator after collection began");
  if (fs.existsSync(output)) throw new Error("Evaluation protocol already sealed");
  const reservation = JSON.parse(fs.readFileSync(reservationFile, "utf8"));
  const supplement = JSON.parse(fs.readFileSync(supplementFile, "utf8"));
  if (reservation.window.fromInclusive !== FROM || supplement.originalManifestSha256 !== fileHash(reservationFile)) {
    throw new Error("Frozen protocol lineage mismatch");
  }
  const names = ["scripts/seal-username-forward-v2-qualification.js", "scripts/collect-username-forward-v2-lifecycles.js",
    "scripts/evaluate-username-forward-v2-qualification.js", "scripts/evaluate-username-secondary-qualification.js",
    "scripts/evaluate-username-rebuild.js", "lib/ton-address.js", "lib/username-structural.js",
    "lib/username-semantic.js", "lib/username-snapshot-knowledge.js"];
  const protocol = {
    schemaVersion: "username-forward-v2-evaluation-protocol-v1",
    sealedBeforeWindow: true,
    zeroCollectedEventsAtSeal: true,
    createdAt,
    reservationSha256: fileHash(reservationFile),
    collectionSupplementSha256: fileHash(supplementFile),
    frozenFiles: Object.fromEntries(names.map((name) => [name, fileHash(path.join(repo, name))])),
    evaluation: reservation.evaluation,
    gates: reservation.gates,
    invariant: "Terminal price-blind seal precedes all lifecycle/label access; every sealed event has one lifecycle attempt, unavailable and failed cases remain in denominators, and a single final report applies frozen gates without target tuning",
  };
  fs.writeFileSync(output, `${JSON.stringify(protocol, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ output: path.basename(output), sha256: fileHash(output), createdAt,
    frozenFiles: Object.keys(protocol.frozenFiles).length }, null, 2));
}

if (require.main === module) try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }

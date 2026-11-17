"use strict";

// One-time, pre-window hash seal. The later terminal manifest verifies this file.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { DIRECTORY, BLOCKS } = require("./collect-username-forward-v3-local");

const hash = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const fileHash = (file) => hash(fs.readFileSync(file));
const FROZEN = [
  "scripts/seal-username-forward-v3-qualification.js",
  "scripts/collect-username-forward-v3-lifecycles.js",
  "scripts/evaluate-username-forward-v3-qualification.js",
  "scripts/evaluate-username-forward-v2-qualification.js",
  "scripts/collect-username-forward-v2-lifecycles.js",
  "scripts/evaluate-username-secondary-qualification.js",
  "scripts/evaluate-username-rebuild.js",
  "lib/ton-address.js",
  "lib/username-structural.js",
  "lib/username-semantic.js",
  "lib/username-snapshot-knowledge.js",
];

function makeProtocol(repo, reservationFile, now = Date.now()) {
  const reservation = JSON.parse(fs.readFileSync(reservationFile, "utf8"));
  if (now >= Date.parse(BLOCKS[0].from) || !reservation.sealedBeforeWindow)
    throw new Error("Forward-v3 evaluation protocol must seal before the first block");
  if (fs.existsSync(path.join(repo, "research/telegram-usernames/data", DIRECTORY)))
    throw new Error("Forward-v3 collection directory already exists");
  if (JSON.stringify(reservation.window.blocks) !== JSON.stringify(BLOCKS))
    throw new Error("Frozen block windows differ from collector");
  for (const [name, expected] of Object.entries({ ...reservation.candidate.files,
    ...reservation.collectionFiles, ...reservation.trainingSources })) {
    if (fileHash(path.join(repo, name)) !== expected) throw new Error(`Frozen reservation file changed: ${name}`);
  }
  return { schemaVersion: "username-forward-v3-evaluation-protocol-v1",
    sealedBeforeWindow: true, zeroCollectedEventsAtSeal: true, createdAt: new Date(now).toISOString(),
    reservationSha256: fileHash(reservationFile),
    frozenFiles: Object.fromEntries(FROZEN.map((name) => [name, fileHash(path.join(repo, name))])),
    evaluation: reservation.evaluation, gates: reservation.gates,
    invariant: "All three independently reserved blocks terminal-seal price-blind before lifecycle or label access; every sealed event has one lifecycle attempt; exact predeclared block and all-case gates govern one final report" };
}

function main() {
  const repo = path.resolve(__dirname, "..");
  const root = path.join(repo, "research/telegram-usernames/data");
  const reservationFile = path.join(root, "username-forward-v3-reservation-manifest-2026-09-27.json");
  const output = path.join(root, "username-forward-v3-evaluation-protocol-2026-09-27.json");
  if (fs.existsSync(output)) throw new Error("Forward-v3 evaluation protocol already sealed");
  const protocol = makeProtocol(repo, reservationFile);
  fs.writeFileSync(output, `${JSON.stringify(protocol, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ output: path.basename(output), sha256: fileHash(output),
    frozenFiles: Object.keys(protocol.frozenFiles).length, sealedBeforeWindow: true }, null, 2));
}

if (require.main === module) try { main(); } catch (error) { console.error(error.stack || error.message); process.exitCode = 1; }
module.exports = { makeProtocol, FROZEN };

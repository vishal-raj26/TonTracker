"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { FROM, DIRECTORY } = require("./collect-username-forward-v2-local");

const sha256 = (bytes) => crypto.createHash("sha256").update(bytes).digest("hex");
const fileHash = (file) => sha256(fs.readFileSync(file));

function main() {
  const repo = path.resolve(__dirname, "..");
  const data = path.join(repo, "research/telegram-usernames/data");
  const original = path.join(data, "username-forward-v2-reservation-manifest-2026-09-25.json");
  const output = path.join(data, "username-forward-v2-protocol-supplement-2026-09-25.json");
  const createdAt = new Date().toISOString();
  if (Date.parse(createdAt) >= Date.parse(FROM)) throw new Error("Supplement must be sealed before forward-v2 start");
  if (fs.existsSync(output)) throw new Error("Forward-v2 supplement already exists");
  if (fs.existsSync(path.join(data, DIRECTORY))) throw new Error("Cannot supplement after collection began");
  const manifest = JSON.parse(fs.readFileSync(original, "utf8"));
  if (manifest.window.fromInclusive !== FROM || !manifest.sealedBeforeWindow) throw new Error("Invalid original reservation");
  const collector = "scripts/collect-username-forward-v2-local.js";
  const supplement = {
    schemaVersion: "username-forward-v2-protocol-supplement-v1",
    sealedBeforeWindow: true,
    zeroCollectedEventsAtSeal: true,
    createdAt,
    originalManifestSha256: fileHash(original),
    supersedesOnly: { collectionFile: collector, oldSha256: manifest.collectionFiles[collector],
      newSha256: fileHash(path.join(repo, collector)) },
    invariant: "Reject any page with pending historical-USD conversion before writing it or advancing the cursor; all reservation, candidate, selection, evaluation and gate fields remain frozen by the original manifest",
    testFileSha256: fileHash(path.join(repo, "test/username-forward-v2-reservation.test.js")),
  };
  if (supplement.supersedesOnly.oldSha256 === supplement.supersedesOnly.newSha256) throw new Error("No protocol change to seal");
  fs.writeFileSync(output, `${JSON.stringify(supplement, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ output: path.basename(output), sha256: fileHash(output), createdAt }, null, 2));
}

if (require.main === module) try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }

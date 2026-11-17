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
  const priorFile = path.join(dir, "username-forward-v2-protocol-supplement-2026-09-25.json");
  const output = path.join(dir, "username-forward-v2-protocol-supplement-v2-2026-09-25.json");
  const createdAt = new Date().toISOString();
  if (Date.parse(createdAt) >= Date.parse(FROM)) throw new Error("Supplement v2 must precede reservation start");
  if (fs.existsSync(path.join(dir, DIRECTORY))) throw new Error("Cannot supplement after collection began");
  if (fs.existsSync(output)) throw new Error("Supplement v2 already exists");
  const prior = JSON.parse(fs.readFileSync(priorFile, "utf8"));
  const file = "scripts/collect-username-forward-v2-local.js";
  const supplement = {
    schemaVersion: "username-forward-v2-protocol-supplement-v2",
    sealedBeforeWindow: true,
    zeroCollectedEventsAtSeal: true,
    createdAt,
    originalManifestSha256: prior.originalManifestSha256,
    predecessorSupplementSha256: fileHash(priorFile),
    supersedesOnly: { collectionFile: file, oldSha256: prior.supersedesOnly.newSha256,
      newSha256: fileHash(path.join(repo, file)) },
    invariant: "Retain the partial-FX rejection and save the exact requested cutoff with every page/checkpoint; terminal sealing after the window requires a caught-up cursor for the frozen end time",
    otherReservationFieldsUnchanged: true,
  };
  if (supplement.supersedesOnly.oldSha256 === supplement.supersedesOnly.newSha256) throw new Error("No new collector change");
  fs.writeFileSync(output, `${JSON.stringify(supplement, null, 2)}\n`, { flag: "wx" });
  console.log(JSON.stringify({ output: path.basename(output), sha256: fileHash(output), createdAt }, null, 2));
}

if (require.main === module) try { main(); } catch (error) { console.error(error.message); process.exitCode = 1; }

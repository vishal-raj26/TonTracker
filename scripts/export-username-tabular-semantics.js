"use strict";
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const { loadWordnetSnapshot } = require("./username-wordnet-snapshot");
const { loadGloveSnapshot } = require("./username-glove-snapshot");
const { knowledgeAsOf, WORDNET_SHA256, GLOVE_SHA256 } = require("../lib/username-snapshot-knowledge");
const { classifyTelegramUsername } = require("../lib/username-structural");
const { FEATURE_NAMES, featureVector } = require("../lib/username-learned-model");
function exportFeatures(rows, dictionary, vectors) {
  return rows.map(({ username, eventId, eventTime, nftAddress }) => {
    const cutoff = Date.parse(eventTime);
    if (!Number.isFinite(cutoff)) throw new Error("Invalid feature cutoff");
    const lexical = knowledgeAsOf(dictionary.knowledge(username), cutoff);
    const vector = knowledgeAsOf(vectors.knowledge(username), cutoff);
    const structural = classifyTelegramUsername(username);
    const features = featureVector({ ...structural, knowledge: { ...lexical, ...vector } }, true);
    if (!features.every(Number.isFinite)) throw new Error("Nonfinite feature");
    return { eventId, eventTime, nftAddress, features };
  });
}
if (require.main === module) {
  const dir = path.resolve(__dirname, "../research/telegram-usernames/data");
  const bytes = fs.readFileSync(path.join(dir, "username-evidence-fusion-development-2026-09-08.json"));
  const sourceSha256 = crypto.createHash("sha256").update(bytes).digest("hex");
  if (sourceSha256 !== "0807dc064b5a5653b004ddfd41ba559a6a95b0dd5c605f597214116371a81448") throw new Error("Development source changed");
  const rows = exportFeatures(JSON.parse(bytes).evidence, loadWordnetSnapshot(), loadGloveSnapshot());
  const report = { sourceSha256, snapshotHashes: [WORDNET_SHA256, GLOVE_SHA256],
    featureNames: [...FEATURE_NAMES, "semantic_vector_present", ...Array.from({ length: 50 }, (_, i) => `semantic_vector_${i}`)], rows };
  const index = process.argv.indexOf("--output");
  if (index < 0) throw new Error("--output required");
  fs.writeFileSync(path.resolve(process.argv[index + 1]), JSON.stringify(report) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ rows: rows.length, width: report.featureNames.length, sourceSha256 }));
}
module.exports = { exportFeatures };

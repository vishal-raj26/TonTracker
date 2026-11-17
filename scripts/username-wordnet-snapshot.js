"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { gunzipSync } = require("node:zlib");
const { WORDNET_SHA256, WORDNET_AVAILABLE_BY } = require("../lib/username-snapshot-knowledge");

function parseSynset(line) {
  if (!/^\d{8} /.test(line)) return [];
  const fields = line.split("|")[0].trim().split(/\s+/);
  const count = parseInt(fields[3], 16);
  if (!(count > 0) || fields.length < 4 + count * 2) return [];
  return Array.from({ length: count }, (_, i) => fields[4 + i * 2].toLowerCase())
    .filter(word => /^[a-z_]{1,32}$/.test(word));
}
function loadWordnetSnapshot(dir = path.join(__dirname, "../research/telegram-usernames/data/wordnet-3.0")) {
  const archive = fs.readFileSync(path.join(dir, "WNdb-3.0.tar.gz"));
  if (crypto.createHash("sha256").update(archive).digest("hex") !== WORDNET_SHA256) throw new Error("WordNet snapshot hash mismatch");
  if (!fs.existsSync(path.join(dir, "LICENSE"))) throw new Error("WordNet license must accompany the snapshot");
  // Parse the hash-verified archive itself; do not trust extracted files that
  // could have been changed independently after download.
  const tar = gunzipSync(archive);
  const dataFiles = new Map();
  for (let offset = 0; offset + 512 <= tar.length;) {
    const name = tar.subarray(offset, offset + 100).toString("utf8").split("\0")[0];
    if (!name) break;
    const size = parseInt(tar.subarray(offset + 124, offset + 136).toString("ascii").replace(/\0/g, "").trim(), 8);
    if (!Number.isFinite(size) || size < 0 || offset + 512 + size > tar.length) throw new Error("Invalid WordNet archive entry");
    if (/^dict\/data\.(noun|verb|adj|adv)$/.test(name)) dataFiles.set(name, tar.subarray(offset + 512, offset + 512 + size).toString("utf8"));
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  const dictionary = new Map();
  for (const pos of ["noun", "verb", "adj", "adv"]) {
    if (!dataFiles.has(`dict/data.${pos}`)) throw new Error(`Missing WordNet ${pos} data`);
    for (const line of dataFiles.get(`dict/data.${pos}`).split(/\r?\n/)) {
      const words = parseSynset(line);
      for (const word of words) {
        if (!dictionary.has(word)) dictionary.set(word, new Set());
        for (const peer of words) if (peer !== word) dictionary.get(word).add(peer);
      }
    }
  }
  const observedAt = new Date().toISOString();
  return { size: dictionary.size, release: "WordNet-3.0", availableBy: WORDNET_AVAILABLE_BY,
    knowledge(name) {
      const peers = dictionary.get(name);
      if (!peers) return {};
      const lexical = { dictionaryMatch: true, relatedTerms: [...peers].sort().slice(0, 20) };
      return { schemaVersion: "username-knowledge-v5", observedAt,
        sourceSnapshot: { release: "WordNet-3.0", sha256: WORDNET_SHA256, availableBy: WORDNET_AVAILABLE_BY, lexical },
        ...lexical, sources: ["wordnet-3.0"] };
    } };
}
module.exports = { parseSynset, loadWordnetSnapshot };

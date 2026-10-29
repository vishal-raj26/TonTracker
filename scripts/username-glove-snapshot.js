"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { gunzipSync } = require("node:zlib");
const { GLOVE_SHA256, GLOVE_AVAILABLE_BY } = require("../lib/username-snapshot-knowledge");
function loadGloveSnapshot(file = path.join(__dirname, "../research/telegram-usernames/data/glove-wiki-gigaword-50.gz")) {
  const archive = fs.readFileSync(file);
  if (crypto.createHash("sha256").update(archive).digest("hex") !== GLOVE_SHA256) throw new Error("GloVe snapshot checksum mismatch");
  const vectors = new Map();
  for (const line of gunzipSync(archive).toString("utf8").split(/\r?\n/)) {
    const space = line.indexOf(" ");
    const word = line.slice(0, space);
    if (!/^[a-z0-9_]{1,32}$/.test(word)) continue;
    const vector = line.slice(space + 1).trim().split(/\s+/).map(Number);
    if (vector.length !== 50 || !vector.every(Number.isFinite)) continue;
    const norm = Math.hypot(...vector);
    if (!(norm > 0)) continue;
    vectors.set(word, vector.map(value => value / norm));
  }
  const observedAt = new Date().toISOString();
  return { size: vectors.size, release: "glove-wiki-gigaword-50", availableBy: GLOVE_AVAILABLE_BY,
    knowledge(name) {
      const vector = vectors.get(name);
      if (!vector) return {};
      return { schemaVersion: "username-knowledge-v5", observedAt, semanticVector: vector,
        sourceSnapshot: { release: "glove-wiki-gigaword-50", sha256: GLOVE_SHA256, semanticVector: vector },
        sources: ["glove-wiki-gigaword-50"] };
    } };
}
module.exports = { loadGloveSnapshot };

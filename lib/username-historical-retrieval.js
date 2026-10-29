"use strict";

const { lexicalSimilarity, completedSale } = require("./username-estimator");
const { knowledgeAsOf } = require("./username-snapshot-knowledge");
function grams(name) {
  return new Set(Array.from({ length: Math.max(0, name.length - 1) }, (_, i) => name.slice(i, i + 2)));
}
// Offline candidate index. Values never participate in retrieval ordering.
// Even if built from a complete export, only identities sold before T qualify.
function createHistoricalUsernameRetrieval(sales, options = {}) {
  const histories = new Map();
  const inverted = new Map();
  for (const sale of sales) {
    if (!completedSale(sale) || !Number.isFinite(Date.parse(sale.eventTime))) continue;
    const name = sale.username;
    if (!histories.has(name)) {
      histories.set(name, []);
      for (const gram of grams(name)) {
        if (!inverted.has(gram)) inverted.set(gram, new Set());
        inverted.get(gram).add(name);
      }
    }
    histories.get(name).push(sale);
  }
  for (const rows of histories.values()) rows.sort((a, b) => Date.parse(a.eventTime) - Date.parse(b.eventTime));
  return function retrieve(name, cutoff, limit = 40) {
    if (!Number.isFinite(cutoff)) return [];
    const candidates = new Set();
    if (options.lexical !== false) {
      for (const gram of grams(name)) for (const candidate of inverted.get(gram) || []) candidates.add(candidate);
    }
    const knowledge = knowledgeAsOf(options.knowledge?.(name), cutoff);
    const related = new Set((knowledge.relatedTerms || []).filter(term => typeof term === "string" && /^[a-z0-9_]{1,32}$/.test(term)));
    for (const candidate of related) if (histories.has(candidate)) candidates.add(candidate);
    const ranked = [];
    for (const candidate of candidates) {
      if (candidate === name) continue;
      const score = related.has(candidate) ? 1 : lexicalSimilarity(name, candidate);
      if (score < 0.65) continue;
      const rows = histories.get(candidate);
      let lo = 0, hi = rows.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (Date.parse(rows[mid].eventTime) < cutoff) lo = mid + 1;
        else hi = mid;
      }
      if (!lo) continue;
      ranked.push({ name: candidate, score, row: rows[lo - 1] });
    }
    return ranked.sort((a, b) => b.score - a.score || Date.parse(b.row.eventTime) - Date.parse(a.row.eventTime)
      || a.name.localeCompare(b.name)).slice(0, limit).map(candidate => candidate.row);
  };
}
module.exports = { createHistoricalUsernameRetrieval };

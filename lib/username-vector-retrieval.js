"use strict";

const { completedSale } = require("./username-estimator");
const { knowledgeAsOf } = require("./username-snapshot-knowledge");

function unitVector(vector) {
  if (!Array.isArray(vector) || vector.length !== 50 || !vector.every(Number.isFinite)) return null;
  const norm = Math.hypot(...vector);
  return norm > 0 && Number.isFinite(norm) ? vector.map(value => value / norm) : null;
}

// Candidate discovery only: cosine similarity is not a price or evidence that
// two identities have equal economic value. No sale price enters ranking.
function createHistoricalVectorRetrieval(sales, { knowledge } = {}) {
  if (typeof knowledge !== "function") throw new Error("Historical knowledge resolver required");
  const histories = new Map();
  for (const sale of sales || []) {
    if (!completedSale(sale) || !Number.isFinite(Date.parse(sale.eventTime))
      || typeof sale.nftAddress !== "string" || !sale.nftAddress || !sale.username) continue;
    const entry = histories.get(sale.nftAddress) || { rows: [] };
    entry.rows.push(sale);
    histories.set(sale.nftAddress, entry);
  }
  const knowledgeCache = new Map();
  const resolve = name => {
    if (!knowledgeCache.has(name)) knowledgeCache.set(name, knowledge(name));
    return knowledgeCache.get(name);
  };
  const entries = [...histories.entries()].map(([address, entry]) => ({
    address,
    rows: entry.rows.slice().sort((a, b) => Date.parse(a.eventTime) - Date.parse(b.eventTime)
      || Number(a.reliabilityScore ?? 1) - Number(b.reliabilityScore ?? 1)),
  }));
  return function retrieve(target, cutoff, limit = 10) {
    if (!Number.isFinite(cutoff) || !Number.isInteger(limit) || limit < 1) return [];
    const vector = unitVector(knowledgeAsOf(knowledge(target.username), cutoff).semanticVector);
    if (!vector) return [];
    const candidates = [];
    for (const entry of entries) {
      if (entry.address === target.nftAddress) continue;
      let lo = 0, hi = entry.rows.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (Date.parse(entry.rows[mid].eventTime) < cutoff) lo = mid + 1; else hi = mid;
      }
      if (!lo) continue;
      const names = new Set(entry.rows.slice(0, lo).map(row => row.username));
      if (names.size !== 1 || names.has(target.username)) continue;
      const candidateVector = unitVector(knowledgeAsOf(resolve(entry.rows[lo - 1].username), cutoff).semanticVector);
      if (!candidateVector) continue;
      const score = vector.reduce((sum, value, index) => sum + value * candidateVector[index], 0);
      if (!(score > 0)) continue;
      candidates.push({ sale: entry.rows[lo - 1], cosineSimilarity: Math.min(1, score) });
    }
    return candidates.sort((a, b) => b.cosineSimilarity - a.cosineSimilarity
      || a.sale.nftAddress.localeCompare(b.sale.nftAddress)).slice(0, limit);
  };
}
module.exports = { createHistoricalVectorRetrieval, unitVector };

"use strict";
const { knowledgeAsOf } = require("./username-snapshot-knowledge");
const { unitVector } = require("./username-vector-retrieval");

// Linguistic candidate evidence only; a valid split supplies neither a price
// nor proof that the parts' commercial value transfers to the compound.
function createHistoricalCompoundResolver({ dictionaryKnowledge, vectorKnowledge }) {
  const dictionaryCache = new Map(), vectorCache = new Map();
  function cached(cache, resolver, name, cutoff) {
    if (!cache.has(name)) cache.set(name, resolver(name));
    return knowledgeAsOf(cache.get(name), cutoff);
  }
  return function resolve(username, cutoff) {
    if (!Number.isFinite(cutoff) || typeof username !== "string" || !/^[a-z_]{1,32}$/.test(username)) return { status: "unavailable", parts: [] };
    const vector = name => cached(vectorCache, vectorKnowledge, name, cutoff).semanticVector;
    if (unitVector(vector(username))) return { status: "exact-vector", parts: [username] };
    const known = part => /^[a-z]{3,}$/.test(part)
      && cached(dictionaryCache, dictionaryKnowledge, part, cutoff).dictionaryMatch === true
      && Boolean(unitVector(vector(part)));
    const splits = [];
    if (username.includes("_")) {
      const parts = username.split("_");
      if (parts.length === 2 && parts.every(known)) splits.push(parts);
    } else {
      for (let index = 3; index <= username.length - 3; index += 1) {
        const parts = [username.slice(0, index), username.slice(index)];
        if (parts.every(known)) splits.push(parts);
      }
    }
    if (splits.length !== 1) return { status: splits.length ? "ambiguous" : "unavailable", parts: [] };
    return { status: "compound-candidate", parts: splits[0] };
  };
}
module.exports = { createHistoricalCompoundResolver };

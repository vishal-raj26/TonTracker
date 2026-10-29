"use strict";

const WORDNET_SHA256 = "658b1ba191f5f98c2e9bae3e25c186013158f30ef779f191d2a44e5d25046dc8";
// Conservatively after the archive timestamp shown by the publisher (May 7).
const WORDNET_AVAILABLE_BY = "2007-05-08T00:00:00Z";
const GLOVE_SHA256 = "5c55f98957aa9fed8d2ac5fb1dcff57af3b23c5a3ee7af3f7945f8d49198eb24";
const GLOVE_AVAILABLE_BY = "2017-10-26T00:00:00Z";
function knowledgeAsOf(value, cutoff) {
  if (!Number.isFinite(cutoff)) return {};
  let knowledge = value;
  if (typeof knowledge === "string") { try { knowledge = JSON.parse(knowledge); } catch { return {}; } }
  if (!knowledge || typeof knowledge !== "object") return {};
  const observed = Date.parse(knowledge.observedAt || knowledge.computedAt || "");
  if (Number.isFinite(observed) && observed < cutoff) return knowledge;
  const snapshot = knowledge.sourceSnapshot;
  if (snapshot?.release === "glove-wiki-gigaword-50" && snapshot.sha256 === GLOVE_SHA256
    && Date.parse(GLOVE_AVAILABLE_BY) < cutoff && Array.isArray(snapshot.semanticVector)
    && snapshot.semanticVector.length === 50 && snapshot.semanticVector.every(Number.isFinite)) {
    return { schemaVersion: "username-knowledge-v5", sourceSnapshot: snapshot, observedAt: knowledge.observedAt,
      semanticVector: snapshot.semanticVector.slice(), sources: ["glove-wiki-gigaword-50"] };
  }
  if (snapshot?.release !== "WordNet-3.0" || snapshot.sha256 !== WORDNET_SHA256
    || !snapshot.lexical || Date.parse(WORDNET_AVAILABLE_BY) >= cutoff) return {};
  // A published historical dictionary permits lexical evidence only, never a
  // backdated current entity/popularity record attached to that dictionary.
  return { schemaVersion: "username-knowledge-v5", sourceSnapshot: snapshot,
    observedAt: knowledge.observedAt, dictionaryMatch: snapshot.lexical.dictionaryMatch === true,
    relatedTerms: Array.isArray(snapshot.lexical.relatedTerms) ? snapshot.lexical.relatedTerms.slice(0, 20) : [],
    sources: ["wordnet-3.0"] };
}
module.exports = { knowledgeAsOf, WORDNET_SHA256, WORDNET_AVAILABLE_BY, GLOVE_SHA256, GLOVE_AVAILABLE_BY };

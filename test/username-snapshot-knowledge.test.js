"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { knowledgeAsOf, WORDNET_SHA256 } = require("../lib/username-snapshot-knowledge");
const { parseSynset } = require("../scripts/username-wordnet-snapshot");
const { GLOVE_SHA256, GLOVE_AVAILABLE_BY } = require("../lib/username-snapshot-knowledge");
const { featureVector, FEATURE_NAMES } = require("../lib/username-learned-model");
const { classifyTelegramUsername } = require("../lib/username-structural");

test("historical vectors cannot backdate current entity evidence or precede publication", () => {
  const semanticVector = Array(50).fill(0.1);
  const knowledge = { observedAt: "2026-09-08", entityMatch: true, attentionScore: 1,
    sourceSnapshot: { release: "glove-wiki-gigaword-50", sha256: GLOVE_SHA256, semanticVector } };
  const cutoff = Date.parse("2025-01-01");
  const prior = knowledgeAsOf(knowledge, cutoff);
  assert.deepEqual(prior.semanticVector, semanticVector);
  assert.notEqual(prior.semanticVector, semanticVector);
  assert.equal(prior.entityMatch, undefined);
  assert.equal(prior.attentionScore, undefined);
  assert.deepEqual(knowledgeAsOf(knowledge, Date.parse(GLOVE_AVAILABLE_BY)), {});
  for (const invalid of [{ sha256: "wrong" }, { semanticVector: [1] },
    { semanticVector: Array(50).fill(NaN) }, { semanticVector: Array(50).fill(Infinity) }]) {
    assert.deepEqual(knowledgeAsOf({ ...knowledge, sourceSnapshot: { ...knowledge.sourceSnapshot, ...invalid } }, cutoff), {});
  }
});

test("semantic feature experiment preserves default features and rejects malformed vectors", () => {
  const target = classifyTelegramUsername("example");
  const base = featureVector(target);
  target.knowledge = { semanticVector: Array(50).fill(0.1) };
  assert.deepEqual(featureVector(target), base);
  const extended = featureVector(target, true);
  assert.equal(extended.length, FEATURE_NAMES.length + 51);
  assert.deepEqual(extended.slice(0, FEATURE_NAMES.length), base);
  assert.deepEqual(extended.slice(FEATURE_NAMES.length), [1, ...Array(50).fill(0.1)]);
  target.knowledge.semanticVector[0] = NaN;
  assert.deepEqual(featureVector(target, true).slice(FEATURE_NAMES.length), Array(51).fill(0));
});
test("published dictionary snapshot never backdates current popularity or entity signals", () => {
  const knowledge = { observedAt: "2026-09-06", dictionaryMatch: true, relatedTerms: ["infant"],
    entityMatch: true, attentionScore: 1, sourceSnapshot: { release: "WordNet-3.0", sha256: WORDNET_SHA256,
      lexical: { dictionaryMatch: true, relatedTerms: ["historical_term"] } } };
  const prior = knowledgeAsOf(knowledge, Date.parse("2025-01-01"));
  assert.equal(prior.dictionaryMatch, true);
  assert.equal(prior.entityMatch, undefined);
  assert.equal(prior.attentionScore, undefined);
  assert.deepEqual(prior.relatedTerms, ["historical_term"]);
  assert.deepEqual(knowledgeAsOf(knowledge, Date.parse("2006-01-01")), {});
  assert.deepEqual(knowledgeAsOf(knowledge, NaN), {});
  assert.deepEqual(knowledgeAsOf({ ...knowledge, sourceSnapshot: { release: "WordNet-3.0", sha256: "wrong" } }, Date.parse("2025-01-01")), {});
});
test("WordNet adapter parses synset lemmas, not glosses or pointers", () => {
  assert.deepEqual(parseSynset("00001234 03 n 02 baby 0 infant 0 001 @ 00000000 n 0000 | descriptive words"), ["baby", "infant"]);
  assert.deepEqual(parseSynset("  license header"), []);
});

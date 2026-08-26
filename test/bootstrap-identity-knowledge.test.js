"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { normalizedKnowledge } = require("../scripts/bootstrap-identity-knowledge");

test("legacy username knowledge stays explicitly incomplete after bootstrap", () => {
  const knowledge = normalizedKnowledge({ schemaVersion: "username-knowledge-v2", dictionaryMatch: true, lexicalFrequency: 2 });
  assert.equal(knowledge.schemaVersion, "username-knowledge-v4");
  assert.equal(knowledge.entityLookupComplete, false);
  assert.equal(knowledge.dictionaryMatch, true);
  assert.equal(knowledge.lexicalFrequency, 2);
});

test("current completed username knowledge keeps its completion marker", () => {
  const knowledge = normalizedKnowledge({ schemaVersion: "username-knowledge-v4", entityLookupComplete: true });
  assert.equal(knowledge.entityLookupComplete, true);
});

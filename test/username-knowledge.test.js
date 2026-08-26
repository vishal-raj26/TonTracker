"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { resolveUsernameKnowledge, usableUsernameKnowledge } = require("../lib/username-knowledge");

test("fast username knowledge records lexical completion without Wikipedia requests", async () => {
  const urls = [];
  const fetch = async (url) => {
    urls.push(String(url));
    if (String(url).includes("sp=example")) return Response.json([{ word: "example", defs: ["n"] , tags: ["f:12"] }]);
    return Response.json([{ word: "sample" }]);
  };
  const knowledge = await resolveUsernameKnowledge("example", { fetch, fast: true });
  assert.equal(knowledge.knowledgeStage, "lexical");
  assert.equal(knowledge.lexicalLookupComplete, true);
  assert.match(knowledge.lexicalLookupAttemptedAt, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(knowledge.dictionaryMatch, true);
  assert.equal(knowledge.entityLookupComplete, false);
  assert.equal(urls.some((url) => url.includes("wikipedia.org")), false);
});

test("knowledge lookups honor the Worker retry budget", async () => {
  let calls = 0;
  const fetch = async () => {
    calls += 1;
    return new Response("unavailable", { status: 503 });
  };
  const knowledge = await resolveUsernameKnowledge("example", { fetch, fast: true, maxAttempts: 1 });
  assert.equal(calls, 2);
  assert.equal(knowledge.lexicalLookupComplete, false);
  assert.match(knowledge.lexicalLookupAttemptedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("does not turn a fuzzy Wikipedia search result into username entity evidence", async () => {
  const urls = [];
  const fetch = async (url) => {
    const value = String(url);
    urls.push(value);
    if (value.includes("api.datamuse.com")) return Response.json([]);
    if (value.includes("list=search")) return Response.json({ query: { search: [{ title: "Unrelated Example" }] } });
    if (value.includes("titles=example")) return Response.json({ query: { pages: { "-1": { missing: "" } } } });
    throw new Error(`unexpected request ${value}`);
  };
  const knowledge = await resolveUsernameKnowledge("example", { fetch, maxAttempts: 1 });
  assert.equal(knowledge.entityLookupComplete, true);
  assert.equal(knowledge.entityMatch, false);
  assert.equal(knowledge.entityMatchStrength, 0);
  assert.equal(knowledge.attentionScore, 0);
  assert.equal(urls.some((url) => url.includes("wikimedia.org/api/rest_v1")), false);
});

test("keeps safe v3 lexical evidence while discarding fuzzy entity evidence", () => {
  const knowledge = usableUsernameKnowledge({
    schemaVersion: "username-knowledge-v3", dictionaryMatch: true, lexicalFrequency: 12,
    relatedTerms: ["market"], entityMatch: true, entityMatchStrength: 0.42,
    entityTitle: "Unrelated market", attentionScore: 0.8, ecosystemRelevance: 1,
  });
  assert.equal(knowledge.schemaVersion, "username-knowledge-v4");
  assert.equal(knowledge.dictionaryMatch, true);
  assert.equal(knowledge.lexicalFrequency, 12);
  assert.deepEqual(knowledge.relatedTerms, ["market"]);
  assert.equal(knowledge.entityMatch, false);
  assert.equal(knowledge.attentionScore, 0);
  assert.equal(knowledge.ecosystemRelevance, 0);
});

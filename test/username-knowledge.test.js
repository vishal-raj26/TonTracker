"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { mergeUsernameKnowledge, resolveUsernameKnowledge, usableUsernameKnowledge } = require("../lib/username-knowledge");

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
  assert.equal(calls, 3);
  assert.equal(knowledge.lexicalLookupComplete, false);
  assert.match(knowledge.lexicalLookupAttemptedAt, /^\d{4}-\d{2}-\d{2}T/);
});

test("does not turn a fuzzy Wikipedia search result into username entity evidence", async () => {
  const urls = [];
  const fetch = async (url) => {
    const value = String(url);
    urls.push(value);
    if (value.includes("api.datamuse.com")) return Response.json([]);
    if (value.includes("dictionaryapi.dev")) return new Response("missing", { status: 404 });
    if (value.includes("wikidata.org")) return Response.json({ search: [{ id: "Q1", label: "Unrelated Example" }] });
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

test("uses Free Dictionary as a lexical fallback", async () => {
  const fetch = async (url) => {
    const value = String(url);
    if (value.includes("api.datamuse.com")) return Response.json([]);
    if (value.includes("dictionaryapi.dev")) return Response.json([{ word: "conviction", meanings: [{ partOfSpeech: "noun", synonyms: ["belief"], definitions: [{ definition: "a firmly held belief" }] }] }]);
    throw new Error(`unexpected request ${value}`);
  };
  const knowledge = await resolveUsernameKnowledge("conviction", { fetch, fast: true, maxAttempts: 1 });
  assert.equal(knowledge.dictionaryMatch, true);
  assert.ok(knowledge.relatedTerms.includes("belief"));
  assert.deepEqual(knowledge.lexicalPartsOfSpeech, ["noun"]);
  assert.deepEqual(knowledge.dictionaryDefinitions, ["a firmly held belief"]);
  assert.ok(knowledge.sources.includes("free-dictionary"));
});

test("accepts an exact Wikidata alias match", async () => {
  const fetch = async (url) => {
    const value = String(url);
    if (value.includes("api.datamuse.com")) return Response.json([{ word: "toncoin", defs: ["n\tcurrency"] }]);
    if (value.includes("list=search")) return Response.json({ query: { search: [] } });
    if (value.includes("titles=toncoin")) return Response.json({ query: { pages: { "-1": { missing: "" } } } });
    if (value.includes("wikidata.org")) return Response.json({ search: [{ id: "Q116080307", label: "The Open Network", match: { type: "alias", text: "Toncoin" } }] });
    throw new Error(`unexpected request ${value}`);
  };
  const knowledge = await resolveUsernameKnowledge("toncoin", { fetch, maxAttempts: 1 });
  assert.equal(knowledge.entityMatch, true);
  assert.equal(knowledge.wikidataEntityId, "Q116080307");
});

test("accepts only an exact Wikidata label or alias", async () => {
  const fetch = async (url) => {
    const value = String(url);
    if (value.includes("api.datamuse.com")) return Response.json([{ word: "telegram", defs: ["n"] }]);
    if (value.includes("list=search")) return Response.json({ query: { search: [] } });
    if (value.includes("titles=telegram")) return Response.json({ query: { pages: { "-1": { missing: "" } } } });
    if (value.includes("wikidata.org")) return Response.json({ search: [{ id: "Q62041", label: "Telegram", description: "instant messaging service" }] });
    throw new Error(`unexpected request ${value}`);
  };
  const knowledge = await resolveUsernameKnowledge("telegram", { fetch, maxAttempts: 1 });
  assert.equal(knowledge.entityMatch, true);
  assert.equal(knowledge.wikidataEntityId, "Q62041");
  assert.ok(knowledge.sources.includes("wikidata"));
});

test("keeps safe v3 lexical evidence while discarding fuzzy entity evidence", () => {
  const knowledge = usableUsernameKnowledge({
    schemaVersion: "username-knowledge-v3", dictionaryMatch: true, lexicalFrequency: 12,
    relatedTerms: ["market"], entityMatch: true, entityMatchStrength: 0.42,
    entityTitle: "Unrelated market", attentionScore: 0.8, ecosystemRelevance: 1,
  });
  assert.equal(knowledge.schemaVersion, "username-knowledge-v5");
  assert.equal(knowledge.dictionaryMatch, true);
  assert.equal(knowledge.lexicalFrequency, 12);
  assert.deepEqual(knowledge.relatedTerms, ["market"]);
  assert.equal(knowledge.entityMatch, false);
  assert.equal(knowledge.attentionScore, 0);
  assert.equal(knowledge.ecosystemRelevance, 0);
});

test("v5 enrichment preserves verified v4 entity evidence when entity sources are incomplete", () => {
  const merged = mergeUsernameKnowledge({
    schemaVersion: "username-knowledge-v4",
    entityMatch: true,
    entityMatchStrength: 1,
    entityLookupComplete: true,
    entityTitle: "Gaara",
    pageviews30d: 42000,
    attentionScore: 0.5,
    sources: ["wikipedia", "wikimedia-pageviews"],
  }, {
    schemaVersion: "username-knowledge-v5",
    lexicalLookupComplete: true,
    dictionaryMatch: false,
    entityLookupComplete: false,
    entityMatch: false,
    entityTitle: "",
    pageviews30d: 0,
    attentionScore: 0,
    sources: [],
  });

  assert.equal(merged.entityMatch, true);
  assert.equal(merged.entityTitle, "Gaara");
  assert.equal(merged.pageviews30d, 42000);
  assert.equal(merged.attentionScore, 0.5);
  assert.ok(merged.sources.includes("wikipedia"));
});

test("completed v5 entity lookup may replace stale legacy entity evidence", () => {
  const merged = mergeUsernameKnowledge({
    schemaVersion: "username-knowledge-v4", entityMatch: true, entityTitle: "Old", sources: ["wikipedia"],
  }, {
    schemaVersion: "username-knowledge-v5", lexicalLookupComplete: true, entityLookupComplete: true,
    entityMatch: false, entityTitle: "", sources: [],
  });
  assert.equal(merged.entityMatch, false);
  assert.equal(merged.entityTitle, "");
  assert.equal(merged.sources.includes("wikipedia"), false);
});

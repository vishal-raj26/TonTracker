"use strict";

// Seeds compact D1 with previously researched username knowledge. Legacy
// entries remain explicitly incomplete so the scheduled resolver upgrades
// their entity evidence instead of treating it as known.
const fs = require("node:fs");
const path = require("node:path");
const { loadLocalEnv } = require("./username-backtest");
const { SCHEMA_VERSION, usableUsernameKnowledge } = require("../lib/username-knowledge");

function normalizedKnowledge(value) {
  const source = value && typeof value === "object" ? value : {};
  const usable = usableUsernameKnowledge(source);
  if (!Object.keys(usable).length) {
    // v1/v2 caches predate the strict provenance schema. Preserve only their
    // non-entity lexical observations; scheduled v4 enrichment must verify
    // every entity, ecosystem, and attention signal again.
    return {
      schemaVersion: SCHEMA_VERSION,
      knowledgeStage: "legacy-lexical",
      lexicalLookupComplete: false,
      dictionaryMatch: Boolean(source.dictionaryMatch),
      lexicalFrequency: Math.max(0, Number(source.lexicalFrequency) || 0),
      entityMatch: false,
      entityMatchStrength: 0,
      entityLookupComplete: false,
      entityTitle: "",
      pageviews30d: 0,
      attentionScore: 0,
      ecosystemRelevance: 0,
      relatedTerms: Array.isArray(source.relatedTerms) ? source.relatedTerms : [],
      sources: [],
    };
  }
  return { ...usable, schemaVersion: SCHEMA_VERSION };
}

async function main() {
  loadLocalEnv();
  const baseUrl = String(process.env.D1_REGISTRY_URL || process.env.VALUATION_READ_MODEL_URL || "").replace(/\/+$/, "");
  const secret = String(process.env.D1_INGEST_SECRET || "").trim();
  if (!baseUrl || !secret) throw new Error("D1_REGISTRY_URL and D1_INGEST_SECRET are required");
  const cachePath = path.join(__dirname, "..", "data", "username-knowledge-cache.json");
  const cache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
  const records = Object.entries(cache).map(([name, knowledge]) => ({
    assetKind: "username", assetKey: `username:${name}`, normalizedName: name,
    knowledge: normalizedKnowledge(knowledge),
  }));
  let written = 0;
  for (let index = 0; index < records.length; index += 50) {
    const response = await fetch(`${baseUrl}/ingest/identity-knowledge`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
      body: JSON.stringify({ records: records.slice(index, index + 50) }),
      signal: AbortSignal.timeout(45_000),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`knowledge batch ${index} failed: ${result.error || response.status}`);
    written += Number(result.written || 0);
  }
  console.log(JSON.stringify({ records: records.length, written, schemaVersion: SCHEMA_VERSION }));
}

if (require.main === module) main().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; });

module.exports = { normalizedKnowledge };

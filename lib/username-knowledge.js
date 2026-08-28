"use strict";

const SCHEMA_VERSION = "username-knowledge-v5";
const LEGACY_SCHEMA_VERSIONS = new Set(["username-knowledge-v3", "username-knowledge-v4"]);
const ECOSYSTEM_RE = /\b(telegram|fragment|toncoin|ton blockchain|the open network|web3|crypto|nft|jetton)\b/i;

function normalize(value) { return String(value || "").trim().toLowerCase().replace(/^@/, ""); }
function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
function usableUsernameKnowledge(value) {
  const knowledge = value && typeof value === "object" ? value : {};
  if (knowledge.schemaVersion === SCHEMA_VERSION) return knowledge;
  if (!LEGACY_SCHEMA_VERSIONS.has(knowledge.schemaVersion)) return {};
  const verifiedV4 = knowledge.schemaVersion === "username-knowledge-v4";
  // Preserve v4's exact Wikipedia evidence, but leave the lookup incomplete so
  // the background queue can add Wikidata. Older fuzzy v3 entity data is unsafe.
  return {
    schemaVersion: SCHEMA_VERSION,
    knowledgeStage: "legacy-lexical",
    lexicalLookupComplete: knowledge.lexicalLookupComplete === true,
    dictionaryMatch: Boolean(knowledge.dictionaryMatch),
    lexicalFrequency: Math.max(0, Number(knowledge.lexicalFrequency) || 0),
    entityMatch: verifiedV4 && Boolean(knowledge.entityMatch),
    entityMatchStrength: verifiedV4 ? clamp(Number(knowledge.entityMatchStrength) || 0, 0, 1) : 0,
    entityLookupComplete: false,
    entityTitle: verifiedV4 ? String(knowledge.entityTitle || "") : "",
    pageviews30d: verifiedV4 ? Math.max(0, Number(knowledge.pageviews30d) || 0) : 0,
    attentionScore: verifiedV4 ? clamp(Number(knowledge.attentionScore) || 0, 0, 1) : 0,
    ecosystemRelevance: verifiedV4 ? (knowledge.ecosystemRelevance ? 1 : 0) : 0,
    relatedTerms: Array.isArray(knowledge.relatedTerms) ? knowledge.relatedTerms : [],
    sources: (Array.isArray(knowledge.sources) ? knowledge.sources : []).filter((source) => verifiedV4 || source === "datamuse-wordfreq"),
  };
}

function parseKnowledge(value) {
  if (typeof value !== "string") return value && typeof value === "object" ? value : {};
  try { return JSON.parse(value); } catch { return {}; }
}

function mergeUsernameKnowledge(previousValue, nextValue) {
  const previous = usableUsernameKnowledge(parseKnowledge(previousValue));
  const next = parseKnowledge(nextValue);
  const merged = { ...previous, ...next, schemaVersion: SCHEMA_VERSION };
  const previousSources = new Set(Array.isArray(previous.sources) ? previous.sources : []);
  const nextSources = new Set(Array.isArray(next.sources) ? next.sources : []);

  if (next.lexicalLookupComplete !== true && Object.keys(previous).length) {
    merged.dictionaryMatch = Boolean(previous.dictionaryMatch);
    merged.dictionaryDefinitions = Array.isArray(previous.dictionaryDefinitions) ? previous.dictionaryDefinitions : [];
    merged.lexicalPartsOfSpeech = Array.isArray(previous.lexicalPartsOfSpeech) ? previous.lexicalPartsOfSpeech : [];
    merged.lexicalFrequency = Math.max(0, Number(previous.lexicalFrequency) || 0);
    merged.relatedTerms = Array.isArray(previous.relatedTerms) ? previous.relatedTerms : [];
    for (const source of previousSources) {
      if (["datamuse-wordfreq", "free-dictionary"].includes(source)) nextSources.add(source);
    }
  }

  if (next.entityLookupComplete !== true && Object.keys(previous).length) {
    merged.entityMatch = Boolean(previous.entityMatch);
    merged.entityMatchStrength = clamp(Number(previous.entityMatchStrength) || 0, 0, 1);
    merged.entityTitle = String(previous.entityTitle || "");
    merged.wikidataEntityId = String(previous.wikidataEntityId || "");
    merged.pageviews30d = Math.max(0, Number(previous.pageviews30d) || 0);
    merged.attentionScore = clamp(Number(previous.attentionScore) || 0, 0, 1);
    merged.ecosystemRelevance = previous.ecosystemRelevance ? 1 : 0;
    for (const source of previousSources) {
      if (["wikipedia", "wikidata", "wikimedia-pageviews"].includes(source)) nextSources.add(source);
    }
  }

  merged.sources = [...nextSources];
  return merged;
}
async function getJson(fetchImpl, url, timeoutMs = 7000, maxAttempts = 3) {
  let lastError;
  const attempts = Math.max(1, Math.min(3, Number(maxAttempts) || 1));
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, { headers: { accept: "application/json", "user-agent": "TonTrack/1.0 identity valuation research" }, signal: AbortSignal.timeout(timeoutMs) });
      if (response.ok) return response.json();
      lastError = new Error(`knowledge source ${response.status}`);
      if (response.status !== 429 && response.status < 500) throw lastError;
      const retryAfter = Math.max(0, Number(response.headers.get("retry-after") || 0) * 1000);
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter, 350 * (2 ** attempt))));
    } catch (error) {
      lastError = error;
      if (attempt < attempts - 1) await new Promise((resolve) => setTimeout(resolve, 350 * (2 ** attempt)));
    }
  }
  throw lastError || new Error("knowledge source unavailable");
}
function exactPage(query, name) {
  const normalized = normalize(name).replace(/[_-]+/g, " ");
  return (query?.query?.search || []).find((row) => normalize(row.title).replace(/[_-]+/g, " ") === normalized) || null;
}
function exactWikidataEntity(query, name) {
  const normalized = normalize(name).replace(/[_-]+/g, " ");
  return (query?.search || []).find((row) => {
    const candidates = [row.label, row.match?.text, ...(Array.isArray(row.aliases) ? row.aliases : [])];
    return candidates.some((value) => normalize(value).replace(/[_-]+/g, " ") === normalized);
  }) || null;
}
async function resolveUsernameKnowledge(username, options = {}) {
  const name = normalize(username);
  const fetchImpl = options.fetch || globalThis.fetch;
  if (!name || typeof fetchImpl !== "function") throw new Error("username and fetch are required");
  const encoded = encodeURIComponent(name);
  const sourceAttempts = Math.max(1, Math.min(3, Number(options.maxAttempts) || 3));
  const datamuseUrl = `https://api.datamuse.com/words?sp=${encoded}&md=df&max=5`;
  const relatedUrl = `https://api.datamuse.com/words?ml=${encoded}&max=32`;
  const [datamuseResult, relatedResult] = await Promise.allSettled([
    getJson(fetchImpl, datamuseUrl, 7000, sourceAttempts),
    getJson(fetchImpl, relatedUrl, 7000, sourceAttempts),
  ]);
  const datamuse = datamuseResult.status === "fulfilled" ? datamuseResult.value : [];
  const related = relatedResult.status === "fulfilled" ? relatedResult.value : [];
  const lexicalLookupComplete = datamuseResult.status === "fulfilled" && relatedResult.status === "fulfilled";
  const lexical = (Array.isArray(datamuse) ? datamuse : []).find((row) => normalize(row.word) === name && Array.isArray(row.defs) && row.defs.length) || null;
  const lexicalFrequency = Number((lexical?.tags || []).find((tag) => String(tag).startsWith("f:"))?.slice(2) || 0);
  let dictionary = null;
  if (!lexical) {
    dictionary = await getJson(fetchImpl, `https://api.dictionaryapi.dev/api/v2/entries/en/${encoded}`, 7000, sourceAttempts).catch(() => null);
  }
  const dictionaryEntry = Array.isArray(dictionary) && dictionary.length ? dictionary[0] : null;
  const datamuseDefinitions = Array.isArray(lexical?.defs) ? lexical.defs : [];
  const dictionaryDefinitions = (dictionaryEntry?.meanings || []).flatMap((meaning) =>
    (meaning.definitions || []).map((definition) => definition.definition));
  const lexicalPartsOfSpeech = [...new Set([
    ...datamuseDefinitions.map((definition) => String(definition).split("\t", 1)[0]),
    ...(dictionaryEntry?.meanings || []).map((meaning) => meaning.partOfSpeech),
  ].map(normalize).filter(Boolean))].slice(0, 8);
  const dictionarySynonyms = (dictionaryEntry?.meanings || []).flatMap((meaning) => [
    ...(meaning.synonyms || []),
    ...(meaning.definitions || []).flatMap((definition) => definition.synonyms || []),
  ]);
  let page = null;
  let wikidataEntity = null;
  let entityMatchStrength = 0;
  let entityLookupComplete = false;
  let pageviews30d = 0;
  if (!options.fast) {
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encoded}&srnamespace=0&srlimit=8&format=json&origin=*`;
  const exactUrl = `https://en.wikipedia.org/w/api.php?action=query&redirects=1&titles=${encoded}&format=json&origin=*`;
  const wikidataUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encoded}&language=en&uselang=en&limit=10&format=json&origin=*`;
  const [searchResult, exactResult, wikidataResult] = await Promise.allSettled([
    getJson(fetchImpl, searchUrl, 7000, sourceAttempts),
    getJson(fetchImpl, exactUrl, 7000, sourceAttempts),
    getJson(fetchImpl, wikidataUrl, 7000, sourceAttempts),
  ]);
  const search = searchResult.status === "fulfilled" ? searchResult.value : {};
  const exact = exactResult.status === "fulfilled" ? exactResult.value : {};
  entityLookupComplete = searchResult.status === "fulfilled" && exactResult.status === "fulfilled" && wikidataResult.status === "fulfilled";
  const exactWikipediaPage = Object.values(exact?.query?.pages || {}).find((row) => !row.missing && Number(row.pageid) > 0) || null;
  const exactSearchPage = exactPage(search, name);
  // A fuzzy search hit is useful for a human, but not an identity signal for
  // pricing a collectible username. Only an exact title or a verified redirect
  // may contribute entity/attention features to the learned model.
  page = exactWikipediaPage || exactSearchPage || null;
  wikidataEntity = exactWikidataEntity(wikidataResult.status === "fulfilled" ? wikidataResult.value : {}, name);
  if (page || wikidataEntity) {
    entityMatchStrength = 1;
  }
  if (page?.title) {
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 86400000);
    const day = (value) => value.toISOString().slice(0, 10).replaceAll("-", "");
    const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(page.title.replaceAll(" ", "_"))}/daily/${day(start)}/${day(end)}`;
    const views = await getJson(fetchImpl, url, 7000, sourceAttempts).catch(() => ({}));
    pageviews30d = (views.items || []).reduce((sum, row) => sum + Math.max(0, Number(row.views || 0)), 0);
  }
  }
  const dictionaryMatch = Boolean(lexical || dictionaryEntry);
  const relatedTerms = [...new Set([...(Array.isArray(related) ? related.map((row) => row.word) : []), ...dictionarySynonyms]
    .map((word) => normalize(word).replace(/\s+/g, ""))
    .filter((word) => word && word !== name && /^[a-z0-9_]{3,32}$/.test(word)))]
    .slice(0, 24);
  const context = `${page?.title || ""} ${page?.snippet || ""} ${wikidataEntity?.label || ""} ${wikidataEntity?.description || ""}`.replace(/<[^>]+>/g, " ");
  return {
    schemaVersion: SCHEMA_VERSION,
    knowledgeStage: options.fast ? "lexical" : "full",
    lexicalLookupComplete,
    lexicalLookupAttemptedAt: new Date().toISOString(),
    dictionaryMatch,
    dictionaryDefinitions: [...new Set([...datamuseDefinitions.map((definition) => String(definition).replace(/^[^\t]+\t/, "")), ...dictionaryDefinitions]
      .map((definition) => String(definition || "").trim()).filter(Boolean))].slice(0, 8),
    lexicalPartsOfSpeech,
    lexicalFrequency,
    entityMatch: Boolean(page || wikidataEntity),
    entityMatchStrength,
    entityLookupComplete,
    entityLookupAttemptedAt: options.fast ? null : new Date().toISOString(),
    entityTitle: page?.title || wikidataEntity?.label || "",
    wikidataEntityId: wikidataEntity?.id || "",
    pageviews30d,
    attentionScore: Number(clamp(Math.log1p(pageviews30d) / Math.log(10_000_001), 0, 1).toFixed(6)),
    ecosystemRelevance: ECOSYSTEM_RE.test(context) ? 1 : 0,
    relatedTerms,
    sources: [lexical ? "datamuse-wordfreq" : null, dictionaryEntry ? "free-dictionary" : null, page ? "wikipedia" : null, wikidataEntity ? "wikidata" : null, pageviews30d ? "wikimedia-pageviews" : null].filter(Boolean),
    enrichedAt: new Date().toISOString(),
  };
}

module.exports = { SCHEMA_VERSION, mergeUsernameKnowledge, resolveUsernameKnowledge, usableUsernameKnowledge };

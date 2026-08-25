"use strict";

const SCHEMA_VERSION = "username-knowledge-v3";
const ECOSYSTEM_RE = /\b(telegram|fragment|toncoin|ton blockchain|the open network|web3|crypto|nft|jetton)\b/i;

function normalize(value) { return String(value || "").trim().toLowerCase().replace(/^@/, ""); }
function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
function compactName(value) { return normalize(value).replace(/[^a-z0-9]/g, ""); }
async function getJson(fetchImpl, url, timeoutMs = 7000) {
  let lastError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetchImpl(url, { headers: { accept: "application/json", "user-agent": "TonTrack/1.0 identity valuation research" }, signal: AbortSignal.timeout(timeoutMs) });
      if (response.ok) return response.json();
      lastError = new Error(`knowledge source ${response.status}`);
      if (response.status !== 429 && response.status < 500) throw lastError;
      const retryAfter = Math.max(0, Number(response.headers.get("retry-after") || 0) * 1000);
      await new Promise((resolve) => setTimeout(resolve, Math.max(retryAfter, 350 * (2 ** attempt))));
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 350 * (2 ** attempt)));
    }
  }
  throw lastError || new Error("knowledge source unavailable");
}
function exactPage(query, name) {
  const normalized = normalize(name).replace(/[_-]+/g, " ");
  return (query?.query?.search || []).find((row) => normalize(row.title).replace(/[_-]+/g, " ") === normalized) || null;
}
async function resolveUsernameKnowledge(username, options = {}) {
  const name = normalize(username);
  const fetchImpl = options.fetch || globalThis.fetch;
  if (!name || typeof fetchImpl !== "function") throw new Error("username and fetch are required");
  const encoded = encodeURIComponent(name);
  const datamuseUrl = `https://api.datamuse.com/words?sp=${encoded}&md=df&max=5`;
  const relatedUrl = `https://api.datamuse.com/words?ml=${encoded}&max=32`;
  const [datamuse, related] = await Promise.all([
    getJson(fetchImpl, datamuseUrl).catch(() => []),
    getJson(fetchImpl, relatedUrl).catch(() => []),
  ]);
  const lexical = (Array.isArray(datamuse) ? datamuse : []).find((row) => normalize(row.word) === name && Array.isArray(row.defs) && row.defs.length) || null;
  const lexicalFrequency = Number((lexical?.tags || []).find((tag) => String(tag).startsWith("f:"))?.slice(2) || 0);
  let page = null;
  let entityMatchStrength = 0;
  let entityLookupComplete = false;
  let pageviews30d = 0;
  if (!options.fast) {
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encoded}&srnamespace=0&srlimit=8&format=json&origin=*`;
  const exactUrl = `https://en.wikipedia.org/w/api.php?action=query&redirects=1&titles=${encoded}&format=json&origin=*`;
  const [searchResult, exactResult] = await Promise.allSettled([
    getJson(fetchImpl, searchUrl),
    getJson(fetchImpl, exactUrl),
  ]);
  const search = searchResult.status === "fulfilled" ? searchResult.value : {};
  const exact = exactResult.status === "fulfilled" ? exactResult.value : {};
  entityLookupComplete = searchResult.status === "fulfilled" && exactResult.status === "fulfilled";
  const exactWikipediaPage = Object.values(exact?.query?.pages || {}).find((row) => !row.missing && Number(row.pageid) > 0) || null;
  const exactSearchPage = exactPage(search, name);
  page = exactWikipediaPage || exactSearchPage || (search?.query?.search || [])[0] || null;
  if (page) {
    const title = compactName(page.title);
    const target = compactName(name);
    entityMatchStrength = title && title === target ? 1 : title && (title.includes(target) || target.includes(title)) ? 0.72 : 0.42;
  }
  if (page?.title) {
    const end = new Date();
    const start = new Date(end.getTime() - 30 * 86400000);
    const day = (value) => value.toISOString().slice(0, 10).replaceAll("-", "");
    const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/user/${encodeURIComponent(page.title.replaceAll(" ", "_"))}/daily/${day(start)}/${day(end)}`;
    const views = await getJson(fetchImpl, url).catch(() => ({}));
    pageviews30d = (views.items || []).reduce((sum, row) => sum + Math.max(0, Number(row.views || 0)), 0);
  }
  }
  const dictionaryMatch = Boolean(lexical);
  const relatedTerms = [...new Set((Array.isArray(related) ? related : [])
    .map((row) => normalize(row.word).replace(/\s+/g, ""))
    .filter((word) => word && word !== name && /^[a-z0-9_]{3,32}$/.test(word)))]
    .slice(0, 24);
  const context = `${page?.title || ""} ${page?.snippet || ""}`.replace(/<[^>]+>/g, " ");
  return {
    schemaVersion: SCHEMA_VERSION,
    dictionaryMatch,
    lexicalFrequency,
    entityMatch: Boolean(page),
    entityMatchStrength,
    entityLookupComplete,
    entityTitle: page?.title || "",
    pageviews30d,
    attentionScore: Number(clamp(Math.log1p(pageviews30d) / Math.log(10_000_001), 0, 1).toFixed(6)),
    ecosystemRelevance: ECOSYSTEM_RE.test(context) ? 1 : 0,
    relatedTerms,
    sources: [dictionaryMatch ? "datamuse-wordfreq" : null, page ? "wikipedia" : null, pageviews30d ? "wikimedia-pageviews" : null].filter(Boolean),
    enrichedAt: new Date().toISOString(),
  };
}

module.exports = { SCHEMA_VERSION, resolveUsernameKnowledge };

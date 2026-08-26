"use strict";

const crypto = require("node:crypto");
const { USERNAME_COLLECTION } = require("./username-collection");
const { normalizeTelegramUsername } = require("./username-structural");

const DEFAULT_BASE_URL = "https://fragment.com";
const PREFIX_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789_";

class FragmentDeferredError extends Error {
  constructor(method, detail = "") {
    super(`Fragment ${method} deferred${detail ? `: ${detail}` : ""}`);
    this.name = "FragmentDeferredError";
    this.code = "FRAGMENT_DEFERRED";
  }
}

function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function decodeHtml(value) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)));
}
function numberFromText(value) {
  const parsed = Number(String(value || "").replace(/<[^>]*>/g, "").replace(/[^0-9.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}
function usernameIndex(username) {
  return crypto.createHash("sha256").update(normalizeTelegramUsername(username), "utf8").digest("hex");
}
function canonicalSourceAddress(username) { return `fragment-index:${usernameIndex(username)}`; }
function eventId(username, eventTime, priceGram) {
  const identity = `${normalizeTelegramUsername(username)}|${new Date(eventTime).toISOString()}|${Number(priceGram).toFixed(9)}`;
  return `fragment-sale:${crypto.createHash("sha256").update(identity).digest("hex")}`;
}
function eventRecord(username, eventTime, priceGram, extra = {}) {
  const normalized = normalizeTelegramUsername(username);
  return {
    eventId: eventId(normalized, eventTime, priceGram),
    sourceEventId: eventId(normalized, eventTime, priceGram),
    nftAddress: canonicalSourceAddress(normalized),
    nftIndex: BigInt(`0x${usernameIndex(normalized)}`).toString(10),
    collectionAddress: USERNAME_COLLECTION,
    username: normalized,
    displayName: `@${normalized}`,
    eventType: "sale",
    eventTime: new Date(eventTime).toISOString(),
    priceGram: Number(priceGram),
    paymentAsset: "GRAM",
    marketplace: "Fragment",
    isFinalized: true,
    isCancelled: false,
    // A completed Fragment row is market evidence, not independent chain proof.
    // The ledger promotes it only after exact NFT settlement verification.
    verified: false,
    ...extra,
  };
}

function parseSearchRows(html) {
  const rows = [];
  for (const match of String(html || "").matchAll(/<tr class="tm-row-selectable">([\s\S]*?)<\/tr>/g)) {
    const row = match[1];
    const usernameMatch = row.match(/href="\/username\/([^"?#]+)"/);
    const priceMatch = row.match(/icon-ton">([\s\S]*?)<\/div>/);
    const timeMatch = row.match(/<time datetime="([^"]+)"/);
    if (!usernameMatch || !priceMatch || !timeMatch) continue;
    const priceGram = numberFromText(priceMatch[1]);
    if (!(priceGram > 0)) continue;
    try { rows.push(eventRecord(decodeURIComponent(usernameMatch[1]), timeMatch[1], priceGram, { qualityFlags: ["fragment-completed-market-row"] })); }
    catch { /* Fragment can expose legacy names that no longer pass current client validation. */ }
  }
  return rows;
}

function parseOwnershipHistory(html, username) {
  const section = String(html || "").match(/<h3[^>]*>Ownership History<\/h3>([\s\S]*?)<\/section>/i)?.[1] || "";
  const events = [];
  for (const match of section.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
    const row = match[1];
    if (/Transferred/i.test(row)) continue;
    const priceMatch = row.match(/icon-ton">([\s\S]*?)<\/div>/);
    const timeMatch = row.match(/<time datetime="([^"]+)"/);
    if (!priceMatch || !timeMatch) continue;
    const priceGram = numberFromText(priceMatch[1]);
    if (!(priceGram > 0)) continue;
    const buyer = row.match(/tonviewer\.com\/([^"/?#]+)/i)?.[1] || null;
    events.push(eventRecord(username, timeMatch[1], priceGram, { buyerAddress: buyer, qualityFlags: ["fragment-ownership-history"] }));
  }
  return events;
}
function parseCurrentCompletedSale(html, username) {
  const section = String(html || "").match(/class="[^"]*tm-section-bid-info[^"]*"[\s\S]*?<\/section>/i)?.[0] || "";
  if (!/Sale Price/i.test(section) || !/Purchased on/i.test(section)) return null;
  const priceMatch = section.match(/icon-ton">([\s\S]*?)<\/div>/i);
  const timeMatch = section.match(/Purchased on[\s\S]*?<time datetime="([^"]+)"/i);
  if (!priceMatch || !timeMatch) return null;
  const priceGram = numberFromText(priceMatch[1]);
  if (!(priceGram > 0)) return null;
  const buyer = section.match(/tonviewer\.com\/([^"\/?#]+)/i)?.[1] || null;
  return eventRecord(username, timeMatch[1], priceGram, {
    buyerAddress: buyer,
    qualityFlags: ["fragment-current-completed-sale"],
  });
}
function parseCurrentOwner(html) {
  const section = String(html || "").match(/class="[^"]*section-bid-info[^"]*"[\s\S]*?<\/section>/i)?.[0] || "";
  const address = section.match(/tonviewer\.com\/([^"/?#]+)/i)?.[1] || "";
  return decodeURIComponent(address);
}

function encodeCursor(state) { return Buffer.from(JSON.stringify(state)).toString("base64url"); }
function decodeCursor(cursor) {
  if (!cursor) return { prefixes: [...PREFIX_ALPHABET], cycle: 1, phase: "latest" };
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    return { prefixes: Array.isArray(parsed.prefixes) ? parsed.prefixes : [...PREFIX_ALPHABET], cycle: Number(parsed.cycle) || 1, phase: parsed.phase || "search" };
  } catch { return { prefixes: [...PREFIX_ALPHABET], cycle: 1, phase: "latest" }; }
}

function createFragmentUsernameSource(options = {}) {
  const baseUrl = String(options.baseUrl || process.env.USERNAME_FRAGMENT_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, "");
  const requestDelayMs = Math.max(250, Number(options.requestDelayMs ?? process.env.USERNAME_FRAGMENT_REQUEST_DELAY_MS ?? 3_000));
  const retryBaseDelayMs = Math.max(0, Number(options.retryBaseDelayMs ?? process.env.USERNAME_FRAGMENT_RETRY_BASE_DELAY_MS ?? 2_000));
  // Fragment's web search is not a supported bulk history API. Keep the
  // default discovery partition deliberately shallow and resumable instead
  // of recursively expanding an effectively unbounded prefix tree.
  const maximumDepth = Math.max(2, Math.min(8, Number(options.maximumDepth ?? process.env.USERNAME_FRAGMENT_PREFIX_DEPTH ?? 4)));
  const maxSearchRequestsPerPage = Math.max(1, Math.min(10, Number(options.maxSearchRequestsPerPage ?? process.env.USERNAME_FRAGMENT_MAX_SEARCH_REQUESTS_PER_PAGE ?? 3)));
  const resultLimit = Math.max(50, Math.min(500, Number(options.resultLimit ?? 500)));
  const fetchImpl = options.fetch || fetch;
  let session = null;
  let lastRequestAt = 0;

  async function pacedFetch(url, init = {}) {
    const wait = requestDelayMs - (Date.now() - lastRequestAt);
    if (wait > 0) await sleep(wait);
    lastRequestAt = Date.now();
    return fetchImpl(url, { ...init, signal: init.signal || AbortSignal.timeout(30_000) });
  }
  async function openSession(force = false) {
    if (session && !force) return session;
    const response = await pacedFetch(`${baseUrl}/`, { headers: { accept: "text/html", "user-agent": "TonTrack-Fragment-Username-Ledger/1.0" } });
    if (!response.ok) throw new Error(`Fragment session returned ${response.status}`);
    const html = await response.text();
    const apiPath = decodeHtml(html.match(/apiUrl":"((?:\\.|[^"])*)"/)?.[1] || "").replace(/\\\//g, "/");
    if (!apiPath.startsWith("/api?hash=")) throw new Error("Fragment API session hash was not found");
    const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie")].filter(Boolean);
    session = { apiUrl: new URL(apiPath, baseUrl).toString(), cookie: cookies.map((value) => String(value).split(";", 1)[0]).join("; ") };
    return session;
  }
  async function apiRequest(method, params, attempt = 0) {
    const current = await openSession(attempt > 0);
    const body = new URLSearchParams({ ...params, method });
    const response = await pacedFetch(current.apiUrl, {
      method: "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
        "x-requested-with": "XMLHttpRequest",
        referer: `${baseUrl}/`,
        cookie: current.cookie,
        "user-agent": "TonTrack-Fragment-Username-Ledger/1.0",
      },
      body,
    });
    if ((response.status === 429 || response.status >= 500) && attempt < 5) {
      await sleep(Math.min(60_000, retryBaseDelayMs * 2 ** attempt));
      return apiRequest(method, params, attempt + 1);
    }
    if (!response.ok) throw new Error(`Fragment ${method} returned ${response.status}`);
    const payload = await response.json();
    if (!payload?.ok) {
      // Fragment can reject a valid request when a temporary session hash or
      // anti-abuse check expires. Refreshing the page session and retrying the
      // same cursor is safe; the D1 sale IDs make repeated rows idempotent.
      if (attempt < 5) {
        await sleep(Math.min(60_000, retryBaseDelayMs * 2 ** attempt));
        return apiRequest(method, params, attempt + 1);
      }
      throw new FragmentDeferredError(method, String(payload?.error || payload?.message || "request rejected").slice(0, 160));
    }
    return payload;
  }
  async function fetchSearch(prefix) {
    const payload = await apiRequest("searchAuctions", { type: "usernames", filter: "sold", sort: "ending", query: prefix });
    return parseSearchRows(payload.html);
  }
  async function fetchPage(cursor) {
    const state = decodeCursor(cursor);
    let searchRequests = 0;
    async function boundedSearch(prefix) {
      if (searchRequests >= maxSearchRequestsPerPage) return null;
      searchRequests += 1;
      return fetchSearch(prefix);
    }
    if (state.phase === "live") {
      return { events: await boundedSearch(""), nextCursor: encodeCursor({ prefixes: [], phase: "history", cycle: state.cycle + 1 }), live: true, cycle: state.cycle, searchRequests };
    }
    if (state.phase === "history") return { events: [], nextCursor: cursor, historyOnly: true, cycle: state.cycle };
    if (state.phase === "latest") {
      const events = await boundedSearch("");
      return { events, nextCursor: encodeCursor({ prefixes: state.prefixes, phase: "search", cycle: state.cycle }), latest: true, cycle: state.cycle, searchRequests };
    }
    while (state.prefixes.length) {
      if (searchRequests >= maxSearchRequestsPerPage) {
        return { events: [], nextCursor: encodeCursor(state), cycle: state.cycle, budgetExhausted: true, searchRequests };
      }
      const prefix = state.prefixes.shift();
      const events = await boundedSearch(prefix);
      if (events.length >= resultLimit && prefix.length < maximumDepth) {
        state.prefixes.unshift(...[...PREFIX_ALPHABET].map((suffix) => `${prefix}${suffix}`));
        continue;
      }
      const nextCursor = state.prefixes.length ? encodeCursor(state) : encodeCursor({ prefixes: [], phase: "history", cycle: state.cycle });
      return { events, nextCursor, prefix, cycle: state.cycle, truncated: events.length >= resultLimit, searchRequests };
    }
    return { events: [], nextCursor: encodeCursor({ prefixes: [], phase: "history", cycle: state.cycle }), historyOnly: true, cycle: state.cycle };
  }
  async function fetchUsernameHistory(username) {
    return (await fetchUsernameRecord(username)).events;
  }
  async function fetchUsernameRecord(username) {
    const normalized = normalizeTelegramUsername(username);
    const response = await pacedFetch(`${baseUrl}/username/${encodeURIComponent(normalized)}`, { headers: { accept: "text/html", "user-agent": "TonTrack-Fragment-Username-Ledger/1.0" } });
    if (!response.ok) throw new Error(`Fragment username history returned ${response.status}`);
    const html = await response.text();
    const events = parseOwnershipHistory(html, normalized);
    const currentSale = parseCurrentCompletedSale(html, normalized);
    if (currentSale && !events.some((event) => event.eventId === currentSale.eventId)) events.push(currentSale);
    events.sort((left, right) => Date.parse(right.eventTime) - Date.parse(left.eventTime));
    return { events, currentOwnerAddress: parseCurrentOwner(html) || null };
  }
  return { fetchPage, fetchSearch, fetchUsernameHistory, fetchUsernameRecord, parseCurrentOwner, parseSearchRows, parseOwnershipHistory };
}

function liveCursor(cycle = 1) { return encodeCursor({ prefixes: [], phase: "live", cycle }); }

module.exports = {
  FragmentDeferredError,
  PREFIX_ALPHABET,
  canonicalSourceAddress,
  createFragmentUsernameSource,
  eventId,
  liveCursor,
  parseCurrentCompletedSale,
  parseOwnershipHistory,
  parseCurrentOwner,
  parseSearchRows,
  usernameIndex,
};

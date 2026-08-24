"use strict";

const { hasSeriesCoverage, historicalRateAt, normalizePoints } = require("./dns-historical-rates");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let cache = { fromMs: 0, toMs: 0, points: [], source: null };

async function fetchJson(url, options = {}) {
  let lastError;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await (options.fetch || fetch)(url, { headers: options.headers || {}, signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
      return response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 4) await sleep(Math.min(60_000, 2_000 * 2 ** attempt));
    }
  }
  throw lastError;
}

async function loadDefiLlamaSeries(fromMs, toMs, options = {}) {
  const base = String(options.defiLlamaBase || process.env.DEFILLAMA_COINS_API_BASE || "https://coins.llama.fi").replace(/\/+$/, "");
  const intervalMs = 6 * 60 * 60 * 1000;
  const points = [];
  for (let startMs = fromMs - intervalMs; startMs < toMs + intervalMs;) {
    const remaining = Math.ceil((toMs + intervalMs - startMs) / intervalMs) + 1;
    const span = Math.max(2, Math.min(499, remaining));
    const payload = await fetchJson(`${base}/chart/coingecko:the-open-network?start=${Math.floor(startMs / 1000)}&span=${span}&period=6h`, options);
    const prices = payload?.coins?.["coingecko:the-open-network"]?.prices;
    points.push(...(Array.isArray(prices) ? prices : []).map((point) => [Number(point.timestamp) * 1000, point.price]));
    startMs += (span - 1) * intervalMs;
    if (remaining > 499) await sleep(300);
  }
  return normalizePoints(points);
}

async function loadCoinGeckoSeries(fromMs, toMs, options = {}) {
  const base = String(options.coinGeckoBase || process.env.COINGECKO_API_BASE || "https://api.coingecko.com/api/v3").replace(/\/+$/, "");
  const headers = process.env.COINGECKO_API_KEY ? { "x-cg-demo-api-key": process.env.COINGECKO_API_KEY } : {};
  const points = [];
  const chunkMs = 89 * 24 * 60 * 60 * 1000;
  for (let start = fromMs; start < toMs; start += chunkMs) {
    const end = Math.min(toMs, start + chunkMs);
    const query = new URLSearchParams({ vs_currency: "usd", from: String(Math.floor(start / 1000)), to: String(Math.ceil(end / 1000)), interval: "hourly", precision: "full" });
    const payload = await fetchJson(`${base}/coins/the-open-network/market_chart/range?${query}`, { ...options, headers });
    points.push(...(Array.isArray(payload.prices) ? payload.prices : []));
    if (end < toMs) await sleep(1_200);
  }
  return normalizePoints(points);
}

async function loadHistoricalGramUsd(fromMs, toMs, options = {}) {
  const observableToMs = Math.min(toMs, Number(options.nowMs || Date.now()));
  const paddedFrom = fromMs - 12 * 60 * 60 * 1000;
  const paddedTo = Math.min(toMs + 12 * 60 * 60 * 1000, observableToMs);
  if (cache.points.length && cache.fromMs <= paddedFrom && cache.toMs >= paddedTo) return cache;
  try {
    const points = await loadDefiLlamaSeries(paddedFrom, paddedTo, options);
    if (hasSeriesCoverage(points, paddedFrom, paddedTo, { edgeToleranceMs: 12 * 60 * 60 * 1000, maximumGapMs: 36 * 60 * 60 * 1000 })) {
      cache = { fromMs: paddedFrom, toMs: paddedTo, points, source: "defillama" };
      return cache;
    }
  } catch (error) {
    options.logger?.warn?.(`[username-rates] DeFiLlama unavailable: ${error.message}`);
  }
  const points = await loadCoinGeckoSeries(paddedFrom, paddedTo, options);
  cache = { fromMs: paddedFrom, toMs: paddedTo, points, source: "coingecko" };
  return cache;
}

async function attributeHistoricalUsd(events, options = {}) {
  const sales = (events || []).filter((event) => Number(event.priceGram) > 0 && Number.isFinite(Date.parse(event.eventTime)));
  if (!sales.length) return [];
  const times = sales.map((event) => Date.parse(event.eventTime));
  const series = await loadHistoricalGramUsd(Math.min(...times), Math.max(...times), options);
  return sales.map((event) => {
    const match = historicalRateAt(series.points, event.eventTime, { interpolationMaxGapMs: 36 * 60 * 60 * 1000, maxGapMs: 12 * 60 * 60 * 1000 });
    if (!match) return { ...event, historicalUsdError: "rate-unavailable" };
    return {
      ...event,
      historicalUsdRate: match.rate,
      priceUsd: Number(event.priceGram) * match.rate,
      historicalUsdSource: series.source,
      historicalUsdMethod: match.method,
      historicalUsdObservedAt: new Date(match.observedAt).toISOString(),
    };
  });
}

function clearHistoricalRateCache() { cache = { fromMs: 0, toMs: 0, points: [], source: null }; }

module.exports = { attributeHistoricalUsd, clearHistoricalRateCache, loadCoinGeckoSeries, loadDefiLlamaSeries, loadHistoricalGramUsd };

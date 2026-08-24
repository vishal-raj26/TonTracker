#!/usr/bin/env node
"use strict";

const { Pool } = require("pg");
const { hasSeriesCoverage, historicalRateAt, normalizePoints } = require("../lib/dns-historical-rates");

const databaseUrl = String(process.env.DNS_DATABASE_URL || process.env.DATABASE_URL || "").trim();
const base = String(process.env.COINGECKO_API_BASE || "https://api.coingecko.com/api/v3").replace(/\/+$/, "");
const llamaBase = String(process.env.DEFILLAMA_COINS_API_BASE || "https://coins.llama.fi").replace(/\/+$/, "");
const apiKey = String(process.env.COINGECKO_API_KEY || "").trim();
const once = process.argv.includes("--once");
const pollMs = Math.max(60_000, Number(process.env.DNS_RATE_POLL_MS || 10 * 60 * 1000));
if (!databaseUrl) throw new Error("DNS_DATABASE_URL or DATABASE_URL is required");
const pool = new Pool({ connectionString: databaseUrl, ssl: /localhost|127\.0\.0\.1/i.test(databaseUrl) ? false : { rejectUnauthorized: false }, max: 2 });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchJson(url, attempts = 5) {
  let last;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { headers: apiKey ? { "x-cg-demo-api-key": apiKey } : {}, signal: AbortSignal.timeout(30_000) });
      if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
      return response.json();
    } catch (error) {
      last = error;
      if (attempt + 1 < attempts) await sleep(Math.min(60_000, 2_000 * 2 ** attempt));
    }
  }
  throw last;
}

async function loadCoinGeckoSeries(fromMs, toMs) {
  const points = [];
  const chunkMs = 89 * 24 * 60 * 60 * 1000;
  for (let start = fromMs; start < toMs; start += chunkMs) {
    const end = Math.min(toMs, start + chunkMs);
    const query = new URLSearchParams({ vs_currency: "usd", from: String(Math.floor(start / 1000)), to: String(Math.ceil(end / 1000)), interval: "hourly", precision: "full" });
    const payload = await fetchJson(`${base}/coins/the-open-network/market_chart/range?${query}`);
    points.push(...(Array.isArray(payload.prices) ? payload.prices : []));
    if (end < toMs) await sleep(1_500);
  }
  return normalizePoints(points);
}

async function loadDefiLlamaSeries(fromMs, toMs) {
  const intervalMs = 6 * 60 * 60 * 1000;
  const maximumSpan = 499;
  const points = [];
  for (let startMs = fromMs - intervalMs; startMs < toMs + intervalMs;) {
    const remaining = Math.ceil((toMs + intervalMs - startMs) / intervalMs) + 1;
    const span = Math.max(2, Math.min(maximumSpan, remaining));
    const start = Math.floor(startMs / 1000);
    const payload = await fetchJson(`${llamaBase}/chart/coingecko:the-open-network?start=${start}&span=${span}&period=6h`);
    const prices = payload?.coins?.["coingecko:the-open-network"]?.prices;
    points.push(...(Array.isArray(prices) ? prices : []).map((point) => [Number(point.timestamp) * 1000, point.price]));
    startMs += (span - 1) * intervalMs;
    if (remaining > maximumSpan) await sleep(500);
  }
  const dayMs = 24 * 60 * 60 * 1000;
  const dailyStart = Math.floor((fromMs - dayMs) / 1000);
  const dailySpan = Math.max(2, Math.ceil((toMs - fromMs) / dayMs) + 3);
  const dailyPayload = await fetchJson(`${llamaBase}/chart/coingecko:the-open-network?start=${dailyStart}&span=${dailySpan}&period=1d`);
  const dailyPrices = dailyPayload?.coins?.["coingecko:the-open-network"]?.prices;
  points.push(...(Array.isArray(dailyPrices) ? dailyPrices : []).map((point) => [Number(point.timestamp) * 1000, point.price]));
  return normalizePoints(points);
}

async function loadSeries(fromMs, toMs) {
  try {
    const points = await loadDefiLlamaSeries(fromMs, toMs);
    if (hasSeriesCoverage(points, fromMs, toMs, { maximumGapMs: 48 * 60 * 60 * 1000 })) {
      return { points, source: "defillama" };
    }
  } catch (error) {
    console.warn(`[dns-rate] DeFiLlama history unavailable: ${error.message}`);
  }
  return { points: await loadCoinGeckoSeries(fromMs, toMs), source: "coingecko" };
}

async function loadStoredSeries(fromMs, toMs) {
  const result = await pool.query(`
    SELECT observed_at, rate_usd, source
    FROM dns_exchange_rates
    WHERE pair = 'GRAM/USD'
      AND observed_at BETWEEN $1 AND $2
    ORDER BY observed_at
  `, [new Date(fromMs), new Date(toMs)]);
  const points = normalizePoints(result.rows.map((row) => [new Date(row.observed_at).getTime(), Number(row.rate_usd)]));
  points.source = result.rows.find((row) => row.source)?.source || null;
  return points;
}

async function persistSeries(points, source) {
  const batchSize = 1000;
  for (let offset = 0; offset < points.length; offset += batchSize) {
    const batch = points.slice(offset, offset + batchSize);
    await pool.query(`
      INSERT INTO dns_exchange_rates
        (pair, observed_at, rate_usd, source, granularity, metadata_json)
      SELECT 'GRAM/USD', point_time, point_rate, $3, '6h', '{}'::jsonb
      FROM UNNEST($1::timestamptz[], $2::numeric[]) AS point(point_time, point_rate)
      ON CONFLICT (pair, observed_at, source) DO NOTHING
    `, [batch.map((point) => new Date(point.timestamp)), batch.map((point) => point.rate), source]);
  }
}

async function getSeries(fromMs, toMs) {
  const stored = await loadStoredSeries(fromMs, toMs);
  if (hasSeriesCoverage(stored, fromMs, toMs)) return { points: stored, source: stored.source || "stored" };
  const fetched = await loadSeries(fromMs, toMs);
  await persistSeries(fetched.points, fetched.source);
  return fetched;
}

async function runOnce() {
  const bounds = (await pool.query(`SELECT MIN(event_time) AS first, MAX(event_time) AS last FROM dns_market_events WHERE is_finalized AND NOT is_cancelled AND price_gram > 0 AND NOT EXISTS (SELECT 1 FROM dns_market_event_usd u WHERE u.event_id = dns_market_events.event_id)`)).rows[0];
  if (!bounds.first) return { attributed: 0 };
  const fromMs = new Date(bounds.first).getTime() - 3 * 60 * 60 * 1000;
  const toMs = new Date(bounds.last).getTime() + 3 * 60 * 60 * 1000;
  const { points, source } = await getSeries(fromMs, toMs);
  const events = (await pool.query(`SELECT event_id, event_time, price_gram FROM dns_market_events WHERE is_finalized AND NOT is_cancelled AND price_gram > 0 AND NOT EXISTS (SELECT 1 FROM dns_market_event_usd u WHERE u.event_id = dns_market_events.event_id) ORDER BY event_time LIMIT 10000`)).rows;
  const attributions = [];
  for (const event of events) {
    const match = historicalRateAt(points, event.event_time);
    if (!match) continue;
    attributions.push({ event, match });
  }
  let attributed = 0;
  for (let offset = 0; offset < attributions.length; offset += 500) {
    const batch = attributions.slice(offset, offset + 500);
    const result = await pool.query(`
      INSERT INTO dns_market_event_usd
        (event_id, rate_usd, historical_usd_value, rate_observed_at, rate_source, attribution_method, metadata_json)
      SELECT event_id, rate_usd, historical_usd_value, rate_observed_at,
        $7, attribution_method, metadata_json
      FROM UNNEST(
        $1::text[], $2::numeric[], $3::numeric[], $4::timestamptz[], $5::text[], $6::jsonb[]
      ) AS attribution(event_id, rate_usd, historical_usd_value, rate_observed_at, attribution_method, metadata_json)
      ON CONFLICT (event_id) DO NOTHING
    `, [
      batch.map(({ event }) => event.event_id),
      batch.map(({ match }) => match.rate),
      batch.map(({ event, match }) => Number(event.price_gram) * match.rate),
      batch.map(({ match }) => new Date(match.observedAt)),
      batch.map(({ match }) => match.method),
      batch.map(({ event }) => ({ requestedEventTime: event.event_time })),
      source,
    ]);
    attributed += result.rowCount;
  }
  await pool.query(`INSERT INTO dns_job_checkpoints (worker_name, checkpoint_key, cursor_json, metadata_json, checkpoint_version) VALUES ('dns-rate-worker','heartbeat',$1,$2,'dns-rate-v1') ON CONFLICT (worker_name, checkpoint_key) DO UPDATE SET cursor_json=EXCLUDED.cursor_json, metadata_json=EXCLUDED.metadata_json, updated_at=NOW()`, [{ at: new Date().toISOString() }, { attributed, points: points.length, source }]);
  return { attributed, points: points.length, source };
}

async function main() {
  do {
    let result = null;
    try {
      result = await runOnce();
      console.log("[dns-rate]", result);
    } catch (error) {
      if (once) throw error;
      console.error(`[dns-rate] cycle failed: ${error.message}`);
    }
    if (once) break;
    await sleep(Number(result?.attributed) >= 10_000 ? 1_000 : pollMs);
  } while (true);
}
if (require.main === module) main().catch((error) => { console.error(`[dns-rate] ${error.stack || error.message}`); process.exitCode = 1; }).finally(() => once && pool.end());
module.exports = { getSeries, loadCoinGeckoSeries, loadDefiLlamaSeries, loadSeries, loadStoredSeries, persistSeries, runOnce };

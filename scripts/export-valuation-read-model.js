"use strict";

// Run only after the source Postgres is healthy. This copies the compact read
// projection, never historical market-event payloads or worker queues.
const { Pool } = require("pg");

const databaseUrl = String(process.env.DNS_DATABASE_URL || process.env.DATABASE_URL || "").trim();
const registryUrl = String(process.env.D1_REGISTRY_URL || "").replace(/\/+$/, "");
const ingestSecret = String(process.env.D1_INGEST_SECRET || "").trim();
if (!databaseUrl || !registryUrl || !ingestSecret) {
  throw new Error("DNS_DATABASE_URL (or DATABASE_URL), D1_REGISTRY_URL, and D1_INGEST_SECRET are required");
}

const batchSize = Math.max(1, Math.min(500, Number(process.env.VALUATION_PROJECTION_BATCH_SIZE || 250)));
const pool = new Pool({ connectionString: databaseUrl, ssl: /localhost|127\.0\.0\.1/i.test(databaseUrl) ? false : { rejectUnauthorized: false } });

async function post(records) {
  const response = await fetch(`${registryUrl}/ingest/valuations`, {
    method: "POST",
    headers: { authorization: `Bearer ${ingestSecret}`, "content-type": "application/json" },
    body: JSON.stringify({ records }),
  });
  if (!response.ok) throw new Error(`Projection ingest failed: ${response.status} ${await response.text()}`);
  return response.json();
}

async function exportRows(kind, query) {
  const { rows } = await pool.query(query);
  let written = 0;
  for (let index = 0; index < rows.length; index += batchSize) {
    const result = await post(rows.slice(index, index + batchSize));
    written += Number(result.written || 0);
  }
  return { source: rows.length, written };
}

(async () => {
  const dns = await exportRows("dns", `SELECT 'dns' AS asset_kind, d.nft_address AS asset_key, d.domain_normalized AS display_name,
    v.estimate_gram * r.rate_usd AS estimate_usd, v.range_low_gram * r.rate_usd AS range_low_usd, v.range_high_gram * r.rate_usd AS range_high_usd,
    v.confidence_score, v.confidence_band, v.valuation_status, v.portfolio_eligible, v.evidence_count, v.effective_comp_count, v.own_sale_count,
    v.current_listing_gram, v.current_bid_gram, market.marketplace_name AS market_platform, v.estimator_version, v.calibration_version,
    v.valued_at, v.stale_at, v.explanation_json
    FROM dns_valuations v JOIN dns_domains d ON d.nft_address=v.nft_address
    LEFT JOIN dns_current_market market ON market.nft_address=v.nft_address
    JOIN LATERAL (SELECT rate_usd FROM dns_exchange_rates WHERE pair='GRAM/USD' ORDER BY observed_at DESC LIMIT 1) r ON TRUE`);
  const usernames = await exportRows("username", `SELECT 'username' AS asset_kind, v.nft_address AS asset_key, v.username_normalized AS display_name,
    v.estimate_usd, v.range_low_usd, v.range_high_usd, v.confidence_score, v.confidence_band, v.valuation_status, v.portfolio_eligible,
    v.evidence_count, v.effective_comp_count, v.own_sale_count, v.current_listing_gram, v.current_bid_gram,
    NULL::text AS market_platform, v.estimator_version, v.calibration_version, v.valued_at, v.stale_at, v.explanation_json
    FROM username_valuations v`);
  console.log(`[valuation-projection] dns=${dns.written}/${dns.source} usernames=${usernames.written}/${usernames.source}`);
})().finally(() => pool.end());

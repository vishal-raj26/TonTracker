"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { canonicalTonAddress } = require("./ton-address");

const MIGRATION_PATH = path.join(process.env.TONTRACK_ROOT || process.cwd(), "sql", "telegram-username-estimator.sql");
const raw = (value) => canonicalTonAddress(value) || String(value || "").trim().toLowerCase();
const json = (value) => JSON.stringify(value || {});

function mapValuation(row) {
  if (!row) return null;
  return {
    nftAddress: row.nft_address, usernameNormalized: row.username_normalized,
    estimateUsd: Number(row.estimate_usd || 0), rangeLowUsd: Number(row.range_low_usd || 0), rangeHighUsd: Number(row.range_high_usd || 0),
    confidenceScore: Number(row.confidence_score || 0), confidenceBand: row.confidence_band, valuationStatus: row.valuation_status,
    portfolioEligible: Boolean(row.portfolio_eligible), evidenceCount: Number(row.evidence_count || 0),
    effectiveCompCount: Number(row.effective_comp_count || 0), ownSaleCount: Number(row.own_sale_count || 0),
    currentListingGram: Number(row.current_listing_gram || 0), currentBidGram: Number(row.current_bid_gram || 0),
    estimatorVersion: row.estimator_version, calibrationVersion: row.calibration_version, explanation: row.explanation_json || {},
    valuedAt: row.valued_at, staleAt: row.stale_at,
    lookupAddress: row.lookup_address || null, lookupUsername: row.lookup_username || null,
  };
}

function createUsernameStore(pool) {
  async function init() { await pool.query(fs.readFileSync(MIGRATION_PATH, "utf8")); }
  async function getValuationsByNftAddresses(addresses) {
    const keys = [...new Set((addresses || []).map(raw).filter(Boolean))];
    if (!keys.length) return [];
    const result = await pool.query(`WITH requested AS (
      SELECT UNNEST($1::text[]) AS lookup_address
    ), resolved AS (
      SELECT requested.lookup_address, COALESCE(alias.nft_address, requested.lookup_address) AS nft_address
      FROM requested LEFT JOIN username_asset_aliases alias ON alias.alias_address=requested.lookup_address
    ) SELECT valuation.*, resolved.lookup_address
      FROM resolved JOIN username_valuations valuation ON valuation.nft_address=resolved.nft_address`, [keys]);
    return result.rows.map(mapValuation);
  }
  async function getValuationsByUsernames(usernames) {
    const keys = [...new Set((usernames || []).map((value) => String(value || "").replace(/^@/, "").toLowerCase()).filter(Boolean))];
    if (!keys.length) return [];
    const result = await pool.query(`SELECT valuation.*, valuation.username_normalized AS lookup_username
      FROM username_valuations valuation WHERE valuation.username_normalized=ANY($1::text[])`, [keys]);
    return result.rows.map(mapValuation);
  }
  async function getValuationByUsername(username) {
    const result = await pool.query("SELECT * FROM username_valuations WHERE username_normalized = $1", [String(username || "").replace(/^@/, "").toLowerCase()]);
    return mapValuation(result.rows[0]);
  }
  async function getAssetByUsername(username) {
    const normalized = String(username || "").replace(/^@/, "").toLowerCase();
    if (!normalized) return null;
    const result = await pool.query(`SELECT a.*, COALESCE(array_agg(alias.alias_address) FILTER (WHERE alias.alias_address IS NOT NULL), '{}') AS aliases
      FROM username_assets a
      LEFT JOIN username_asset_aliases alias ON alias.nft_address=a.nft_address
      WHERE a.username_normalized=$1
      GROUP BY a.nft_address LIMIT 1`, [normalized]);
    return result.rows[0] || null;
  }
  async function getValuationDetailByUsername(username) {
    const valuation = await getValuationByUsername(username);
    if (!valuation) return null;
    const result = await pool.query(`SELECT c.rank,c.final_weight,c.comparable_price_usd,c.metadata_json,e.event_time,e.marketplace
      FROM username_valuation_comparables c
      LEFT JOIN username_market_events e ON e.event_id=c.market_event_id
      WHERE c.valuation_nft_address=$1 AND c.estimator_version=$2
      ORDER BY c.rank ASC LIMIT 20`, [raw(valuation.nftAddress), valuation.estimatorVersion]);
    return { ...valuation, comparables: result.rows.map((row) => ({ rank: Number(row.rank), weight: Number(row.final_weight), priceUsd: Number(row.comparable_price_usd), username: row.metadata_json?.username || null, eventTime: row.event_time, marketplace: row.marketplace || null, exact: Boolean(row.metadata_json?.exact), structuralSimilarity: Number(row.metadata_json?.structuralSimilarity || 0) })) };
  }
  async function getArchetypeBaselines(version) {
    const result = await pool.query("SELECT * FROM username_archetype_baselines WHERE estimator_version = $1 AND (stale_at IS NULL OR stale_at > NOW())", [version]);
    return result.rows.map((row) => ({ ...row, midpointUsd: Number(row.midpoint_usd), rangeLowUsd: Number(row.range_low_usd), rangeHighUsd: Number(row.range_high_usd), evidenceCount: Number(row.evidence_count), effectiveCompCount: Number(row.effective_comp_count), provenance: row.provenance_json || {} }));
  }
  async function refreshArchetypeBaselines(version, staleHours = 24) {
    const result = await pool.query(`WITH sales AS (
      SELECT f.primary_route, f.character_length, f.script, f.scarcity_class, e.price_usd
      FROM username_market_events e JOIN username_static_features f ON f.nft_address=e.nft_address
      WHERE e.is_finalized=TRUE AND e.is_cancelled=FALSE AND e.price_usd>0
        AND e.reliability_score >= 0.75
    ), grouped AS (
      SELECT 'global' scope, '*' primary_route, '*' length_bucket, '*' script, '*' scarcity_class, price_usd FROM sales
      UNION ALL
      SELECT 'route', primary_route, '*', '*', '*', price_usd FROM sales
      UNION ALL
      SELECT 'route-length', primary_route, CASE WHEN character_length<=3 THEN '1-3' WHEN character_length<=5 THEN '4-5' WHEN character_length<=8 THEN '6-8' WHEN character_length<=12 THEN '9-12' ELSE '13+' END, '*', '*', price_usd FROM sales
      UNION ALL
      SELECT 'archetype', primary_route, CASE WHEN character_length<=3 THEN '1-3' WHEN character_length<=5 THEN '4-5' WHEN character_length<=8 THEN '6-8' WHEN character_length<=12 THEN '9-12' ELSE '13+' END, script, scarcity_class, price_usd FROM sales
    ), aggregates AS (
      SELECT scope, primary_route, length_bucket, script, scarcity_class, COUNT(*)::int evidence_count,
        percentile_cont(0.5) WITHIN GROUP (ORDER BY price_usd) midpoint_usd,
        percentile_cont(0.2) WITHIN GROUP (ORDER BY price_usd) low_usd,
        percentile_cont(0.8) WITHIN GROUP (ORDER BY price_usd) high_usd
      FROM grouped GROUP BY scope, primary_route, length_bucket, script, scarcity_class HAVING COUNT(*) >= 3
    ) INSERT INTO username_archetype_baselines (estimator_version,scope,primary_route,length_bucket,script,scarcity_class,midpoint_usd,range_low_usd,range_high_usd,evidence_count,effective_comp_count,provenance_json,generated_at,stale_at)
      SELECT $1,scope,primary_route,length_bucket,script,scarcity_class,midpoint_usd,low_usd,high_usd,evidence_count,evidence_count,jsonb_build_object('verifiedSalesOnly',true,'aggregation','robust-quantiles'),NOW(),NOW()+($2::double precision * INTERVAL '1 hour') FROM aggregates
      ON CONFLICT (estimator_version,scope,primary_route,length_bucket,script,scarcity_class) DO UPDATE SET midpoint_usd=EXCLUDED.midpoint_usd,range_low_usd=EXCLUDED.range_low_usd,range_high_usd=EXCLUDED.range_high_usd,evidence_count=EXCLUDED.evidence_count,effective_comp_count=EXCLUDED.effective_comp_count,provenance_json=EXCLUDED.provenance_json,generated_at=EXCLUDED.generated_at,stale_at=EXCLUDED.stale_at RETURNING *`, [version, staleHours]);
    return result.rowCount;
  }
  async function upsertAsset(asset) {
    const result = await pool.query(`INSERT INTO username_assets (nft_address, collection_address, username_normalized, display_name, owner_address, nft_index, metadata_json)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) ON CONFLICT (username_normalized) DO UPDATE SET
        collection_address=EXCLUDED.collection_address,
        display_name=EXCLUDED.display_name,
        owner_address=COALESCE(EXCLUDED.owner_address,username_assets.owner_address),
        nft_index=COALESCE(EXCLUDED.nft_index,username_assets.nft_index),
        metadata_json=username_assets.metadata_json || EXCLUDED.metadata_json,
        last_seen_at=NOW(), updated_at=NOW() RETURNING *`,
    [raw(asset.nftAddress), raw(asset.collectionAddress), asset.usernameNormalized, asset.displayName, raw(asset.ownerAddress) || null, asset.nftIndex ?? null, json(asset.metadata)]);
    return result.rows[0];
  }
  async function upsertAlias(aliasAddress, nftAddress, source, metadata = {}) {
    const alias = raw(aliasAddress); const canonical = raw(nftAddress);
    if (!alias || !canonical || alias === canonical) return null;
    const result = await pool.query(`INSERT INTO username_asset_aliases (alias_address,nft_address,source,metadata_json)
      VALUES ($1,$2,$3,$4::jsonb) ON CONFLICT (alias_address) DO UPDATE SET nft_address=EXCLUDED.nft_address,source=EXCLUDED.source,metadata_json=username_asset_aliases.metadata_json || EXCLUDED.metadata_json,last_seen_at=NOW() RETURNING *`,
    [alias, canonical, source, json(metadata)]);
    return result.rows[0] || null;
  }
  async function insertMarketEvent(event) {
    const result = await pool.query(`INSERT INTO username_market_events (event_id,nft_address,username_normalized,event_type,event_time,tx_hash,trace_id,marketplace,seller_address,buyer_address,price_gram,historical_usd_rate,price_usd,payment_asset,is_finalized,is_cancelled,reliability_score,quality_flags_json,source,source_event_id,raw_payload_json)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,$20,$21::jsonb) ON CONFLICT (event_id) DO NOTHING RETURNING *`,
    [event.eventId, raw(event.nftAddress), event.usernameNormalized, event.eventType, event.eventTime, event.txHash || null, event.traceId || null, event.marketplace || null, raw(event.sellerAddress) || null, raw(event.buyerAddress) || null, event.priceGram || null, event.historicalUsdRate || null, event.priceUsd || null, event.paymentAsset || "GRAM", Boolean(event.isFinalized), Boolean(event.isCancelled), event.reliabilityScore ?? 1, json(event.qualityFlags), event.source, event.sourceEventId || null, json(event.rawPayload)]);
    return result.rows[0] || null;
  }
  async function upsertFeatures(feature) {
    await pool.query(`INSERT INTO username_static_features (nft_address,feature_version,primary_route,character_length,script,scarcity_class,feature_json,semantic_json,computed_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,NOW()) ON CONFLICT (nft_address,feature_version) DO UPDATE SET primary_route=EXCLUDED.primary_route, character_length=EXCLUDED.character_length, script=EXCLUDED.script, scarcity_class=EXCLUDED.scarcity_class, feature_json=EXCLUDED.feature_json, semantic_json=EXCLUDED.semantic_json, computed_at=NOW()`,
    [raw(feature.nftAddress), feature.featureVersion, feature.primaryRoute, feature.characterLength, feature.script, feature.scarcityClass, json(feature.feature), json(feature.semantic)]);
  }
  async function upsertSemantic(nftAddress, featureVersion, semantic) {
    await pool.query("UPDATE username_static_features SET semantic_json=$3::jsonb, computed_at=NOW() WHERE nft_address=$1 AND feature_version=$2", [raw(nftAddress), featureVersion, json(semantic)]);
  }
  async function upsertMarketState(state) {
    await pool.query(`INSERT INTO username_market_state (nft_address,lowest_ask_gram,highest_bid_gram,marketplace,observed_at,stale_at,verified,metadata_json)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) ON CONFLICT (nft_address) DO UPDATE SET lowest_ask_gram=EXCLUDED.lowest_ask_gram,highest_bid_gram=EXCLUDED.highest_bid_gram,marketplace=EXCLUDED.marketplace,observed_at=EXCLUDED.observed_at,stale_at=EXCLUDED.stale_at,verified=EXCLUDED.verified,metadata_json=EXCLUDED.metadata_json WHERE EXCLUDED.observed_at >= username_market_state.observed_at`,
    [raw(state.nftAddress), state.lowestAskGram || null, state.highestBidGram || null, state.marketplace || null, state.observedAt || new Date(), state.staleAt || null, Boolean(state.verified), json(state.metadata)]);
  }
  async function valuationInputs(nftAddress, historyDays) {
    const target = await pool.query(`SELECT a.*, f.feature_json, f.semantic_json, s.lowest_ask_gram, s.highest_bid_gram, s.verified, s.stale_at FROM username_assets a LEFT JOIN username_static_features f ON f.nft_address=a.nft_address LEFT JOIN username_market_state s ON s.nft_address=a.nft_address WHERE a.nft_address=$1 ORDER BY f.computed_at DESC NULLS LAST LIMIT 1`, [raw(nftAddress)]);
    const events = await pool.query(`SELECT e.*, f.feature_json FROM username_market_events e JOIN username_static_features f ON f.nft_address=e.nft_address WHERE e.is_finalized=TRUE AND e.is_cancelled=FALSE AND e.price_usd>0 AND e.event_time >= NOW()-($2::double precision * INTERVAL '1 day') ORDER BY e.event_time DESC LIMIT 4000`, [raw(nftAddress), historyDays]);
    return { target: target.rows[0] || null, events: events.rows };
  }
  async function upsertValuation(valuation, comparables) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query(`INSERT INTO username_valuations (nft_address,username_normalized,estimate_usd,range_low_usd,range_high_usd,confidence_score,confidence_band,valuation_status,portfolio_eligible,evidence_count,effective_comp_count,own_sale_count,current_listing_gram,current_bid_gram,estimator_version,calibration_version,explanation_json,valued_at,stale_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18,$19) ON CONFLICT (nft_address) DO UPDATE SET username_normalized=EXCLUDED.username_normalized,estimate_usd=EXCLUDED.estimate_usd,range_low_usd=EXCLUDED.range_low_usd,range_high_usd=EXCLUDED.range_high_usd,confidence_score=EXCLUDED.confidence_score,confidence_band=EXCLUDED.confidence_band,valuation_status=EXCLUDED.valuation_status,portfolio_eligible=EXCLUDED.portfolio_eligible,evidence_count=EXCLUDED.evidence_count,effective_comp_count=EXCLUDED.effective_comp_count,own_sale_count=EXCLUDED.own_sale_count,current_listing_gram=EXCLUDED.current_listing_gram,current_bid_gram=EXCLUDED.current_bid_gram,estimator_version=EXCLUDED.estimator_version,calibration_version=EXCLUDED.calibration_version,explanation_json=EXCLUDED.explanation_json,valued_at=EXCLUDED.valued_at,stale_at=EXCLUDED.stale_at,updated_at=NOW() WHERE EXCLUDED.valued_at >= username_valuations.valued_at RETURNING *`,
      [raw(valuation.nftAddress), valuation.usernameNormalized, valuation.estimateUsd || null, valuation.rangeLowUsd || null, valuation.rangeHighUsd || null, valuation.confidenceScore || 0, valuation.confidenceBand, valuation.valuationStatus, Boolean(valuation.portfolioEligible), valuation.evidenceCount || 0, valuation.effectiveCompCount || 0, valuation.ownSaleCount || 0, valuation.currentListingGram || null, valuation.currentBidGram || null, valuation.estimatorVersion, valuation.calibrationVersion, json(valuation.explanation), valuation.valuedAt, valuation.staleAt]);
      if (result.rowCount) {
        await client.query("DELETE FROM username_valuation_comparables WHERE valuation_nft_address=$1 AND estimator_version=$2", [raw(valuation.nftAddress), valuation.estimatorVersion]);
        for (const [index, comparable] of (comparables || []).entries()) await client.query(`INSERT INTO username_valuation_comparables (valuation_nft_address,estimator_version,rank,comparable_nft_address,market_event_id,final_weight,comparable_price_usd,metadata_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`, [raw(valuation.nftAddress), valuation.estimatorVersion, index + 1, raw(comparable.nftAddress) || null, comparable.eventId || null, comparable.weight, comparable.priceUsd, json(comparable)]);
      }
      await client.query("COMMIT");
      return mapValuation(result.rows[0]);
    } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
  }
  async function enqueueJob(job) { await pool.query(`INSERT INTO username_jobs (job_type,dedupe_key,priority,payload_json,max_attempts) VALUES ($1,$2,$3,$4::jsonb,$5) ON CONFLICT (job_type,dedupe_key) DO UPDATE SET
      priority=GREATEST(username_jobs.priority,EXCLUDED.priority), payload_json=EXCLUDED.payload_json,
      status=CASE WHEN $6::boolean AND username_jobs.status IN ('completed','failed') THEN 'queued' ELSE username_jobs.status END,
      attempts=CASE WHEN $6::boolean AND username_jobs.status IN ('completed','failed') THEN 0 ELSE username_jobs.attempts END,
      run_after=CASE WHEN $6::boolean AND username_jobs.status IN ('completed','failed') THEN NOW() ELSE username_jobs.run_after END,
      last_error=CASE WHEN $6::boolean AND username_jobs.status IN ('completed','failed') THEN NULL ELSE username_jobs.last_error END,
      updated_at=NOW()`, [job.jobType, job.dedupeKey, job.priority || 0, json(job.payload), job.maxAttempts || 5, Boolean(job.requeueCompleted)]); }
  async function seedDueJobs(estimatorVersion, featureVersion, limit = 1000) {
    const features = await pool.query(`INSERT INTO username_jobs (job_type,dedupe_key,priority,payload_json)
      SELECT 'username-feature', a.nft_address || ':' || $2, 45,
        jsonb_build_object('nftAddress',a.nft_address,'username',a.username_normalized)
      FROM username_assets a
      WHERE NOT EXISTS (SELECT 1 FROM username_static_features f WHERE f.nft_address=a.nft_address AND f.feature_version=$2)
      ORDER BY a.last_seen_at DESC LIMIT $2
      ON CONFLICT (job_type,dedupe_key) DO UPDATE SET
        status=CASE WHEN username_jobs.status='failed' THEN 'queued' ELSE username_jobs.status END,
        attempts=CASE WHEN username_jobs.status='failed' THEN 0 ELSE username_jobs.attempts END,
        run_after=CASE WHEN username_jobs.status='failed' THEN NOW() ELSE username_jobs.run_after END,
        updated_at=NOW() RETURNING id`, [featureVersion, limit]);
    const valuations = await pool.query(`INSERT INTO username_jobs (job_type,dedupe_key,priority,payload_json)
      SELECT 'username-valuation', a.nft_address || ':' || $1, 40,
        jsonb_build_object('nftAddress',a.nft_address,'username',a.username_normalized)
      FROM username_assets a
      JOIN username_static_features f ON f.nft_address=a.nft_address AND f.feature_version=$2
      LEFT JOIN username_valuations v ON v.nft_address=a.nft_address AND v.estimator_version=$1
      WHERE v.nft_address IS NULL OR v.stale_at <= NOW()
      ORDER BY COALESCE(v.stale_at, TO_TIMESTAMP(0)), a.last_seen_at DESC LIMIT $3
      ON CONFLICT (job_type,dedupe_key) DO UPDATE SET
        status=CASE WHEN username_jobs.status IN ('completed','failed') THEN 'queued' ELSE username_jobs.status END,
        attempts=CASE WHEN username_jobs.status IN ('completed','failed') THEN 0 ELSE username_jobs.attempts END,
        run_after=CASE WHEN username_jobs.status IN ('completed','failed') THEN NOW() ELSE username_jobs.run_after END,
        last_error=CASE WHEN username_jobs.status IN ('completed','failed') THEN NULL ELSE username_jobs.last_error END,
        updated_at=NOW() RETURNING id`, [estimatorVersion, featureVersion, limit]);
    return { features: features.rowCount, valuations: valuations.rowCount };
  }
  async function pruneJobs(retentionDays = 30) {
    const result = await pool.query("DELETE FROM username_jobs WHERE status IN ('completed','failed') AND updated_at < NOW()-($1::double precision * INTERVAL '1 day')", [retentionDays]);
    return result.rowCount;
  }
  async function claimJobs(workerId, limit = 10, types = null) { const result = await pool.query(`WITH candidates AS (SELECT id FROM username_jobs WHERE status IN ('queued','retry') AND run_after <= NOW() AND ($3::text[] IS NULL OR job_type=ANY($3::text[])) ORDER BY priority DESC,id LIMIT $2 FOR UPDATE SKIP LOCKED) UPDATE username_jobs j SET status='running',attempts=j.attempts+1,locked_by=$1,lease_expires_at=NOW()+INTERVAL '5 minutes',updated_at=NOW() FROM candidates WHERE j.id=candidates.id RETURNING j.*`, [workerId, limit, Array.isArray(types) && types.length ? types : null]); return result.rows; }
  async function completeJob(id, workerId) { await pool.query("UPDATE username_jobs SET status='completed', locked_by=NULL, lease_expires_at=NULL, updated_at=NOW() WHERE id=$1 AND locked_by=$2", [id, workerId]); }
  async function failJob(id, workerId, error) { await pool.query("UPDATE username_jobs SET status=CASE WHEN attempts>=max_attempts THEN 'failed' ELSE 'retry' END, run_after=NOW()+INTERVAL '1 minute', locked_by=NULL, lease_expires_at=NULL, last_error=$3, updated_at=NOW() WHERE id=$1 AND locked_by=$2", [id, workerId, String(error.message || error).slice(0, 500)]); }
  return { init, getValuationsByNftAddresses, getValuationsByUsernames, getValuationByUsername, getValuationDetailByUsername, getAssetByUsername, getArchetypeBaselines, refreshArchetypeBaselines, upsertAsset, upsertAlias, insertMarketEvent, upsertFeatures, upsertSemantic, upsertMarketState, valuationInputs, upsertValuation, enqueueJob, seedDueJobs, pruneJobs, claimJobs, completeJob, failJob };
}
module.exports = { MIGRATION_PATH, createUsernameStore };

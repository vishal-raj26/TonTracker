const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { canonicalTonAddress } = require("./ton-address");

const MIGRATION_PATH = path.resolve(process.env.TONTRACK_ROOT || process.cwd(), "sql", "ton-dns-estimator.sql");

function requireText(value, field) {
  if (typeof value !== "string" || !value.trim()) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
  return value.trim();
}

function optionalText(value) {
  return value == null || value === "" ? null : String(value);
}

function jsonValue(value, fallback = {}) {
  return value == null ? fallback : value;
}

function uniqueTexts(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
}

function stableMarketEventId(event) {
  if (event.eventId) return requireText(event.eventId, "event.eventId");

  const source = requireText(event.source, "event.source");
  const sourceIdentity = event.sourceEventId || [
    event.txHash,
    event.traceId,
    event.logicalTime,
    event.eventType,
    canonicalTonAddress(event.nftAddress),
    event.eventTime,
    event.saleContract,
  ].map((value) => value ?? "").join("|");

  if (!event.sourceEventId && !event.txHash && !event.traceId) {
    throw new TypeError("market event needs eventId, sourceEventId, txHash, or traceId");
  }

  return `dns_${crypto.createHash("sha256").update(`${source}|${sourceIdentity}`).digest("hex")}`;
}

function errorPayload(error) {
  if (error == null) return { message: "Unknown job failure" };
  if (typeof error === "string") return { message: error };
  return {
    name: error.name || "Error",
    message: error.message || String(error),
    code: error.code || null,
    stack: error.stack || null,
  };
}

function mapValuationRow(row) {
  return {
    nftAddress: row.nft_address,
    domainNormalized: row.domain_normalized,
    estimateGram: row.estimate_gram,
    rangeLowGram: row.range_low_gram,
    rangeHighGram: row.range_high_gram,
    confidenceScore: row.confidence_score,
    confidenceBand: row.confidence_band,
    valuationStatus: row.valuation_status,
    portfolioEligible: row.portfolio_eligible,
    evidenceCount: row.evidence_count,
    effectiveCompCount: row.effective_comp_count,
    ownSaleCount: row.own_sale_count,
    currentListingGram: row.current_listing_gram,
    currentBidGram: row.current_bid_gram,
    marketPlatform: row.marketplace_name || null,
    marketRegimeId: row.market_regime_id,
    featureVersion: row.feature_version,
    semanticVersion: row.semantic_version,
    estimatorVersion: row.estimator_version,
    calibrationVersion: row.calibration_version,
    evidenceSummary: row.evidence_summary_json,
    explanation: row.explanation_json,
    valuedAt: row.valued_at,
    staleAt: row.stale_at,
  };
}

function mapArchetypeBaselineRow(row) {
  return {
    estimatorVersion: row.estimator_version,
    scope: row.scope,
    primaryRoute: row.primary_route,
    lengthBucket: row.length_bucket,
    script: row.script,
    scarcityClass: row.scarcity_class,
    midpointGram: row.midpoint_gram,
    rangeLowGram: row.range_low_gram,
    rangeHighGram: row.range_high_gram,
    evidenceCount: row.evidence_count,
    effectiveCompCount: row.effective_comp_count,
    acquisitionCount: row.acquisition_count,
    resaleCount: row.resale_count,
    evidenceMaxTime: row.evidence_max_time,
    provenance: row.provenance_json?.source || `${row.scope || "market"}-verified-sales-baseline`,
    generatedAt: row.generated_at,
    staleAt: row.stale_at,
    verifiedSalesOnly: true,
  };
}

function createDnsStore(pool, options = {}) {
  if (!pool || typeof pool.query !== "function") {
    throw new TypeError("createDnsStore requires a pg-compatible pool");
  }

  const migrationPath = options.migrationPath || MIGRATION_PATH;

  async function query(text, values = []) {
    return pool.query(text, values);
  }

  async function init() {
    const sql = await fs.promises.readFile(migrationPath, "utf8");
    await query(sql);
    return { migrationPath };
  }

  async function getValuationsByNftAddresses(nftAddresses) {
    const addresses = uniqueTexts(nftAddresses).map(canonicalTonAddress).filter(Boolean);
    if (!addresses.length) return [];

    const result = await query(`
      SELECT
        v.*,
        cm.marketplace_name
      FROM dns_valuations v
      LEFT JOIN dns_current_market cm ON cm.nft_address = v.nft_address
      WHERE v.nft_address = ANY($1::text[])
    `, [addresses]);
    return result.rows.map(mapValuationRow);
  }

  async function getValuationByDomain(domainNormalized) {
    const result = await query(`
      SELECT
        v.*,
        cm.marketplace_name
      FROM dns_valuations v
      LEFT JOIN dns_current_market cm ON cm.nft_address = v.nft_address
      WHERE v.domain_normalized = $1
      LIMIT 1
    `, [requireText(domainNormalized, "domainNormalized").toLocaleLowerCase("und")]);
    return result.rows[0] ? mapValuationRow(result.rows[0]) : null;
  }

  async function getArchetypeBaselines(estimatorVersion) {
    const result = await query(`
      SELECT *
      FROM dns_archetype_baselines
      WHERE estimator_version = $1
        AND stale_at > NOW()
      ORDER BY scope, primary_route, length_bucket, script, scarcity_class
    `, [requireText(estimatorVersion, "estimatorVersion")]);
    return result.rows.map(mapArchetypeBaselineRow);
  }

  async function refreshArchetypeBaselines(options = {}) {
    const estimatorVersion = requireText(options.estimatorVersion, "estimatorVersion");
    const historyDays = Math.max(365, Math.min(3_650, Number(options.historyDays) || 1_825));
    const staleHours = Math.max(1, Math.min(168, Number(options.staleHours) || 24));
    const result = await query(`
      WITH trusted_sales AS (
        SELECT
          sf.primary_route,
          CASE
            WHEN sf.character_length <= 3 THEN '1-3'
            WHEN sf.character_length <= 5 THEN '4-5'
            WHEN sf.character_length <= 8 THEN '6-8'
            WHEN sf.character_length <= 12 THEN '9-12'
            ELSE '13+'
          END AS length_bucket,
          COALESCE(NULLIF(sf.script, ''), 'Common') AS script,
          COALESCE(NULLIF(sf.scarcity_class, ''), 'standard') AS scarcity_class,
          e.price_gram,
          e.event_time,
          CASE
            WHEN lower(e.event_type) IN ('auction-settlement', 'auction_settlement') THEN 'acquisition'
            ELSE 'resale'
          END AS sale_kind
        FROM dns_market_events e
        JOIN dns_structural_features sf ON sf.nft_address = e.nft_address
        WHERE e.is_finalized = TRUE
          AND e.is_cancelled = FALSE
          AND e.price_gram > 0
          AND lower(e.payment_asset) IN ('gram', 'ton', 'toncoin', 'native')
          AND lower(e.event_type) IN (
            'sale', 'fixed-sale', 'fixed_sale', 'completed-sale', 'completed_sale',
            'auction-settlement', 'auction_settlement'
          )
          AND e.event_time >= NOW() - ($2::int * INTERVAL '1 day')
          AND NOT (COALESCE(e.quality_flags_json->'flags', '[]'::jsonb) ?| ARRAY[
            'cancelled', 'currency-mismatch', 'duplicate', 'failed', 'reverted',
            'self-sale', 'unsupported-contract', 'unknown_secondary_marketplace', 'wash-trade'
          ])
          AND (
            COALESCE(e.quality_flags_json->>'market_kind', '') IN ('registration_auction', 'secondary_getgems')
            OR lower(COALESCE(e.marketplace_name, '')) IN ('getgems', 'ton dns auction')
          )
      ), grouped AS (
        SELECT 'archetype'::text AS scope, primary_route, length_bucket, script, scarcity_class,
          percentile_cont(0.5) WITHIN GROUP (ORDER BY price_gram) AS midpoint_gram,
          percentile_cont(0.2) WITHIN GROUP (ORDER BY price_gram) AS range_low_gram,
          percentile_cont(0.8) WITHIN GROUP (ORDER BY price_gram) AS range_high_gram,
          COUNT(*)::int AS evidence_count, MAX(event_time) AS evidence_max_time,
          COUNT(*) FILTER (WHERE sale_kind = 'acquisition')::int AS acquisition_count,
          COUNT(*) FILTER (WHERE sale_kind = 'resale')::int AS resale_count
        FROM trusted_sales GROUP BY primary_route, length_bucket, script, scarcity_class
        UNION ALL
        SELECT 'route-length', primary_route, length_bucket, '*', '*',
          percentile_cont(0.5) WITHIN GROUP (ORDER BY price_gram),
          percentile_cont(0.2) WITHIN GROUP (ORDER BY price_gram),
          percentile_cont(0.8) WITHIN GROUP (ORDER BY price_gram),
          COUNT(*)::int, MAX(event_time),
          COUNT(*) FILTER (WHERE sale_kind = 'acquisition')::int,
          COUNT(*) FILTER (WHERE sale_kind = 'resale')::int
        FROM trusted_sales GROUP BY primary_route, length_bucket
        UNION ALL
        SELECT 'route', primary_route, '*', '*', '*',
          percentile_cont(0.5) WITHIN GROUP (ORDER BY price_gram),
          percentile_cont(0.2) WITHIN GROUP (ORDER BY price_gram),
          percentile_cont(0.8) WITHIN GROUP (ORDER BY price_gram),
          COUNT(*)::int, MAX(event_time),
          COUNT(*) FILTER (WHERE sale_kind = 'acquisition')::int,
          COUNT(*) FILTER (WHERE sale_kind = 'resale')::int
        FROM trusted_sales GROUP BY primary_route
        UNION ALL
        SELECT 'global', '*', '*', '*', '*',
          percentile_cont(0.5) WITHIN GROUP (ORDER BY price_gram),
          percentile_cont(0.2) WITHIN GROUP (ORDER BY price_gram),
          percentile_cont(0.8) WITHIN GROUP (ORDER BY price_gram),
          COUNT(*)::int, MAX(event_time),
          COUNT(*) FILTER (WHERE sale_kind = 'acquisition')::int,
          COUNT(*) FILTER (WHERE sale_kind = 'resale')::int
        FROM trusted_sales
      ), upserted AS (
        INSERT INTO dns_archetype_baselines (
          estimator_version, scope, primary_route, length_bucket, script, scarcity_class,
          midpoint_gram, range_low_gram, range_high_gram, evidence_count,
          effective_comp_count, acquisition_count, resale_count, evidence_max_time,
          provenance_json, generated_at, stale_at
        )
        SELECT $1, scope, primary_route, length_bucket, script, scarcity_class,
          midpoint_gram, range_low_gram, range_high_gram, evidence_count,
          evidence_count::double precision, acquisition_count, resale_count, evidence_max_time,
          jsonb_build_object('verifiedSalesOnly', TRUE, 'source', 'trusted-completed-sales'),
          NOW(), NOW() + ($3::int * INTERVAL '1 hour')
        FROM grouped WHERE evidence_count > 0
        ON CONFLICT (estimator_version, scope, primary_route, length_bucket, script, scarcity_class)
        DO UPDATE SET midpoint_gram = EXCLUDED.midpoint_gram,
          range_low_gram = EXCLUDED.range_low_gram, range_high_gram = EXCLUDED.range_high_gram,
          evidence_count = EXCLUDED.evidence_count, effective_comp_count = EXCLUDED.effective_comp_count,
          acquisition_count = EXCLUDED.acquisition_count, resale_count = EXCLUDED.resale_count,
          evidence_max_time = EXCLUDED.evidence_max_time, provenance_json = EXCLUDED.provenance_json,
          generated_at = EXCLUDED.generated_at, stale_at = EXCLUDED.stale_at
        RETURNING scope
      ) SELECT COUNT(*)::int AS refreshed FROM upserted
    `, [estimatorVersion, historyDays, staleHours]);
    return result.rows[0] || { refreshed: 0 };
  }

  async function upsertDomain(domain) {
    const values = [
      canonicalTonAddress(requireText(domain.nftAddress, "domain.nftAddress")),
      canonicalTonAddress(requireText(domain.collectionAddress, "domain.collectionAddress")),
      requireText(domain.domainRaw, "domain.domainRaw"),
      requireText(domain.domainNormalized, "domain.domainNormalized"),
      requireText(domain.labelNormalized, "domain.labelNormalized"),
      optionalText(domain.ownerAddress),
      domain.nftIndex ?? null,
      domain.registeredAt ?? null,
      domain.lastRenewedAt ?? null,
      domain.expiresAt ?? null,
      optionalText(domain.lifecycleStatus) || "unknown",
      jsonValue(domain.metadata),
      optionalText(domain.source),
      domain.firstSeenAt ?? null,
      domain.lastSeenAt ?? null,
    ];
    const result = await query(`
      INSERT INTO dns_domains (
        nft_address, collection_address, domain_raw, domain_normalized,
        label_normalized, owner_address, nft_index, registered_at,
        last_renewed_at, expires_at, lifecycle_status, metadata_json,
        source, first_seen_at, last_seen_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
        COALESCE($14, NOW()), COALESCE($15, NOW())
      )
      ON CONFLICT (nft_address) DO UPDATE SET
        collection_address = EXCLUDED.collection_address,
        domain_raw = EXCLUDED.domain_raw,
        domain_normalized = EXCLUDED.domain_normalized,
        label_normalized = EXCLUDED.label_normalized,
        owner_address = EXCLUDED.owner_address,
        nft_index = COALESCE(EXCLUDED.nft_index, dns_domains.nft_index),
        registered_at = COALESCE(EXCLUDED.registered_at, dns_domains.registered_at),
        last_renewed_at = COALESCE(EXCLUDED.last_renewed_at, dns_domains.last_renewed_at),
        expires_at = COALESCE(EXCLUDED.expires_at, dns_domains.expires_at),
        lifecycle_status = EXCLUDED.lifecycle_status,
        metadata_json = EXCLUDED.metadata_json,
        source = COALESCE(EXCLUDED.source, dns_domains.source),
        first_seen_at = LEAST(dns_domains.first_seen_at, EXCLUDED.first_seen_at),
        last_seen_at = GREATEST(dns_domains.last_seen_at, EXCLUDED.last_seen_at),
        updated_at = NOW()
      RETURNING *
    `, values);
    return result.rows[0];
  }

  async function insertMarketEvent(event) {
    const eventId = stableMarketEventId(event);
    const values = [
      eventId,
      requireText(event.source, "event.source"),
      optionalText(event.sourceEventId),
      optionalText(event.sourcePartition),
      canonicalTonAddress(requireText(event.nftAddress, "event.nftAddress")),
      requireText(event.domainNormalized, "event.domainNormalized"),
      requireText(event.eventType, "event.eventType"),
      event.eventTime,
      optionalText(event.txHash),
      optionalText(event.traceId),
      event.logicalTime ?? null,
      optionalText(event.marketplaceAddress),
      optionalText(event.marketplaceName),
      optionalText(event.saleContract),
      optionalText(event.saleContractCodeHash),
      optionalText(event.sellerAddress),
      optionalText(event.buyerOrBidderAddress),
      event.priceNanoGram ?? null,
      event.priceGram ?? null,
      event.historicalUsdRate ?? null,
      event.historicalUsdValue ?? null,
      event.rateObservedAt ?? null,
      optionalText(event.paymentAsset) || "GRAM",
      Boolean(event.isFinalized),
      Boolean(event.isCancelled),
      jsonValue(event.qualityFlags),
      optionalText(event.rawHash),
      jsonValue(event.rawPayload),
    ];
    if (!event.eventTime) throw new TypeError("event.eventTime is required");

    const result = await query(`
      INSERT INTO dns_market_events (
        event_id, source, source_event_id, source_partition, nft_address,
        domain_normalized, event_type, event_time, tx_hash, trace_id,
        logical_time, marketplace_address, marketplace_name, sale_contract,
        sale_contract_code_hash, seller_address, buyer_or_bidder_address,
        price_nano_gram, price_gram, historical_usd_rate, historical_usd_value,
        rate_observed_at, payment_asset, is_finalized, is_cancelled,
        quality_flags_json, raw_hash, raw_payload_json
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28
      )
      ON CONFLICT DO NOTHING
      RETURNING *
    `, values);
    return { inserted: result.rowCount === 1, eventId, row: result.rows[0] || null };
  }

  async function upsertCurrentMarket(market) {
    const values = [
      canonicalTonAddress(requireText(market.nftAddress, "market.nftAddress")),
      market.listingGram ?? null,
      market.highestBidGram ?? null,
      optionalText(market.listingStatus) || "unknown",
      optionalText(market.marketplaceAddress),
      optionalText(market.marketplaceName),
      optionalText(market.saleContract),
      optionalText(market.saleContractCodeHash),
      requireText(market.source, "market.source"),
      Boolean(market.isVerified),
      jsonValue(market.validityFlags),
      jsonValue(market.rawPayload),
      market.observedAt,
      market.staleAt ?? null,
    ];
    if (!market.observedAt) throw new TypeError("market.observedAt is required");

    const result = await query(`
      INSERT INTO dns_current_market (
        nft_address, listing_gram, highest_bid_gram, listing_status,
        marketplace_address, marketplace_name, sale_contract,
        sale_contract_code_hash, source, is_verified, validity_flags_json,
        raw_payload_json, observed_at, stale_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      ON CONFLICT (nft_address) DO UPDATE SET
        listing_gram = EXCLUDED.listing_gram,
        highest_bid_gram = EXCLUDED.highest_bid_gram,
        listing_status = EXCLUDED.listing_status,
        marketplace_address = EXCLUDED.marketplace_address,
        marketplace_name = EXCLUDED.marketplace_name,
        sale_contract = EXCLUDED.sale_contract,
        sale_contract_code_hash = EXCLUDED.sale_contract_code_hash,
        source = EXCLUDED.source,
        is_verified = EXCLUDED.is_verified,
        validity_flags_json = EXCLUDED.validity_flags_json,
        raw_payload_json = EXCLUDED.raw_payload_json,
        observed_at = EXCLUDED.observed_at,
        stale_at = EXCLUDED.stale_at,
        updated_at = NOW()
      WHERE EXCLUDED.observed_at >= dns_current_market.observed_at
      RETURNING *
    `, values);
    return result.rows[0] || null;
  }

  async function upsertStructuralFeatures(features) {
    const values = [
      canonicalTonAddress(requireText(features.nftAddress, "features.nftAddress")),
      requireText(features.primaryRoute, "features.primaryRoute"),
      features.characterLength,
      features.byteLength,
      optionalText(features.script),
      uniqueTexts(features.languageHints),
      optionalText(features.characterClass),
      optionalText(features.scarcityClass),
      optionalText(features.repetitionSignature),
      features.uniqueCharacterCount ?? null,
      features.tokenCount ?? null,
      Boolean(features.hasSequence),
      Boolean(features.hasPalindrome),
      Boolean(features.hasRepeatedRun),
      Boolean(features.hasRepeatedSubstring),
      Boolean(features.hasLeadingZero),
      Boolean(features.hasTrailingZero),
      Boolean(features.hasSeparator),
      Boolean(features.isMixedScript),
      Boolean(features.hasConfusable),
      features.pronounceabilityScore ?? null,
      jsonValue(features.featureJson),
      requireText(features.classifierVersion, "features.classifierVersion"),
      features.computedAt ?? null,
    ];
    if (!Number.isInteger(features.characterLength) || !Number.isInteger(features.byteLength)) {
      throw new TypeError("features.characterLength and features.byteLength must be integers");
    }

    const result = await query(`
      INSERT INTO dns_structural_features (
        nft_address, primary_route, character_length, byte_length, script,
        language_hints, character_class, scarcity_class, repetition_signature,
        unique_character_count, token_count, has_sequence, has_palindrome,
        has_repeated_run, has_repeated_substring, has_leading_zero,
        has_trailing_zero, has_separator, is_mixed_script, has_confusable,
        pronounceability_score, feature_json, classifier_version, computed_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20, $21, $22, $23, COALESCE($24, NOW())
      )
      ON CONFLICT (nft_address) DO UPDATE SET
        primary_route = EXCLUDED.primary_route,
        character_length = EXCLUDED.character_length,
        byte_length = EXCLUDED.byte_length,
        script = EXCLUDED.script,
        language_hints = EXCLUDED.language_hints,
        character_class = EXCLUDED.character_class,
        scarcity_class = EXCLUDED.scarcity_class,
        repetition_signature = EXCLUDED.repetition_signature,
        unique_character_count = EXCLUDED.unique_character_count,
        token_count = EXCLUDED.token_count,
        has_sequence = EXCLUDED.has_sequence,
        has_palindrome = EXCLUDED.has_palindrome,
        has_repeated_run = EXCLUDED.has_repeated_run,
        has_repeated_substring = EXCLUDED.has_repeated_substring,
        has_leading_zero = EXCLUDED.has_leading_zero,
        has_trailing_zero = EXCLUDED.has_trailing_zero,
        has_separator = EXCLUDED.has_separator,
        is_mixed_script = EXCLUDED.is_mixed_script,
        has_confusable = EXCLUDED.has_confusable,
        pronounceability_score = EXCLUDED.pronounceability_score,
        feature_json = EXCLUDED.feature_json,
        classifier_version = EXCLUDED.classifier_version,
        computed_at = EXCLUDED.computed_at,
        updated_at = NOW()
      WHERE EXCLUDED.computed_at >= dns_structural_features.computed_at
      RETURNING *
    `, values);
    return result.rows[0];
  }

  async function upsertSemanticProfile(profile) {
    const scores = [
      profile.tonRelevance,
      profile.telegramRelevance,
      profile.cryptoRelevance,
      profile.memorabilityScore,
      profile.brandabilityScore,
      profile.commercialIntentScore,
      profile.inventedWordProbability,
      profile.semanticConfidence,
    ].map((value) => value ?? null);
    const values = [
      canonicalTonAddress(requireText(profile.nftAddress, "profile.nftAddress")),
      requireText(profile.profileVersion, "profile.profileVersion"),
      optionalText(profile.language),
      optionalText(profile.script),
      uniqueTexts(profile.semanticCategories),
      optionalText(profile.entityType),
      optionalText(profile.canonicalEntity),
      jsonValue(profile.dictionaryMeanings, []),
      jsonValue(profile.abbreviationExpansions, []),
      ...scores,
      jsonValue(profile.provenance),
      optionalText(profile.modelName),
      optionalText(profile.modelVersion),
      requireText(profile.schemaVersion, "profile.schemaVersion"),
      profile.humanOverride ?? null,
      profile.computedAt ?? null,
    ];
    const result = await query(`
      INSERT INTO dns_semantic_profiles (
        nft_address, profile_version, language, script, semantic_categories,
        entity_type, canonical_entity, dictionary_meanings_json,
        abbreviation_expansions_json, ton_relevance, telegram_relevance,
        crypto_relevance, memorability_score, brandability_score,
        commercial_intent_score, invented_word_probability,
        semantic_confidence, provenance_json, model_name, model_version,
        schema_version, human_override_json, computed_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20, $21, $22, COALESCE($23, NOW())
      )
      ON CONFLICT (nft_address) DO UPDATE SET
        profile_version = EXCLUDED.profile_version,
        language = EXCLUDED.language,
        script = EXCLUDED.script,
        semantic_categories = EXCLUDED.semantic_categories,
        entity_type = EXCLUDED.entity_type,
        canonical_entity = EXCLUDED.canonical_entity,
        dictionary_meanings_json = EXCLUDED.dictionary_meanings_json,
        abbreviation_expansions_json = EXCLUDED.abbreviation_expansions_json,
        ton_relevance = EXCLUDED.ton_relevance,
        telegram_relevance = EXCLUDED.telegram_relevance,
        crypto_relevance = EXCLUDED.crypto_relevance,
        memorability_score = EXCLUDED.memorability_score,
        brandability_score = EXCLUDED.brandability_score,
        commercial_intent_score = EXCLUDED.commercial_intent_score,
        invented_word_probability = EXCLUDED.invented_word_probability,
        semantic_confidence = EXCLUDED.semantic_confidence,
        provenance_json = EXCLUDED.provenance_json,
        model_name = EXCLUDED.model_name,
        model_version = EXCLUDED.model_version,
        schema_version = EXCLUDED.schema_version,
        human_override_json = EXCLUDED.human_override_json,
        computed_at = EXCLUDED.computed_at,
        updated_at = NOW()
      WHERE EXCLUDED.computed_at >= dns_semantic_profiles.computed_at
      RETURNING *
    `, values);
    return result.rows[0];
  }

  async function upsertSemanticReference(reference) {
    const values = [
      canonicalTonAddress(requireText(reference.nftAddress, "reference.nftAddress")),
      requireText(reference.referenceType, "reference.referenceType"),
      requireText(reference.referenceKey, "reference.referenceKey"),
      requireText(reference.externalStore, "reference.externalStore"),
      requireText(reference.externalRecordId, "reference.externalRecordId"),
      requireText(reference.modelName, "reference.modelName"),
      requireText(reference.modelVersion, "reference.modelVersion"),
      reference.dimensions ?? null,
      optionalText(reference.contentHash),
      jsonValue(reference.metadata),
      reference.generatedAt ?? null,
    ];
    const result = await query(`
      INSERT INTO dns_semantic_references (
        nft_address, reference_type, reference_key, external_store,
        external_record_id, model_name, model_version, dimensions,
        content_hash, metadata_json, generated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, NOW()))
      ON CONFLICT (nft_address, reference_type, reference_key, model_name, model_version)
      DO UPDATE SET
        external_store = EXCLUDED.external_store,
        external_record_id = EXCLUDED.external_record_id,
        dimensions = EXCLUDED.dimensions,
        content_hash = EXCLUDED.content_hash,
        metadata_json = EXCLUDED.metadata_json,
        generated_at = EXCLUDED.generated_at,
        updated_at = NOW()
      WHERE EXCLUDED.generated_at >= dns_semantic_references.generated_at
      RETURNING *
    `, values);
    return result.rows[0];
  }

  async function upsertValuation(valuation, comparables) {
    const client = comparables === undefined ? pool : await pool.connect();
    let inTransaction = false;
    try {
      if (comparables !== undefined) {
        await client.query("BEGIN");
        inTransaction = true;
      }
      const values = [
        canonicalTonAddress(requireText(valuation.nftAddress, "valuation.nftAddress")),
        requireText(valuation.domainNormalized, "valuation.domainNormalized"),
        valuation.estimateGram ?? null,
        valuation.rangeLowGram ?? null,
        valuation.rangeHighGram ?? null,
        valuation.confidenceScore ?? null,
        optionalText(valuation.confidenceBand),
        requireText(valuation.valuationStatus, "valuation.valuationStatus"),
        Boolean(valuation.portfolioEligible),
        valuation.evidenceCount ?? 0,
        valuation.effectiveCompCount ?? 0,
        valuation.ownSaleCount ?? 0,
        valuation.currentListingGram ?? null,
        valuation.currentBidGram ?? null,
        optionalText(valuation.marketRegimeId),
        requireText(valuation.featureVersion, "valuation.featureVersion"),
        optionalText(valuation.semanticVersion),
        requireText(valuation.estimatorVersion, "valuation.estimatorVersion"),
        requireText(valuation.calibrationVersion, "valuation.calibrationVersion"),
        jsonValue(valuation.evidenceSummary),
        jsonValue(valuation.explanation),
        valuation.valuedAt,
        valuation.staleAt,
      ];
      if (!valuation.valuedAt || !valuation.staleAt) {
        throw new TypeError("valuation.valuedAt and valuation.staleAt are required");
      }

      const result = await client.query(`
        INSERT INTO dns_valuations (
          nft_address, domain_normalized, estimate_gram, range_low_gram,
          range_high_gram, confidence_score, confidence_band, valuation_status,
          portfolio_eligible, evidence_count, effective_comp_count, own_sale_count,
          current_listing_gram, current_bid_gram, market_regime_id, feature_version,
          semantic_version, estimator_version, calibration_version,
          evidence_summary_json, explanation_json, valued_at, stale_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
          $15, $16, $17, $18, $19, $20, $21, $22, $23
        )
        ON CONFLICT (nft_address) DO UPDATE SET
          domain_normalized = EXCLUDED.domain_normalized,
          estimate_gram = EXCLUDED.estimate_gram,
          range_low_gram = EXCLUDED.range_low_gram,
          range_high_gram = EXCLUDED.range_high_gram,
          confidence_score = EXCLUDED.confidence_score,
          confidence_band = EXCLUDED.confidence_band,
          valuation_status = EXCLUDED.valuation_status,
          portfolio_eligible = EXCLUDED.portfolio_eligible,
          evidence_count = EXCLUDED.evidence_count,
          effective_comp_count = EXCLUDED.effective_comp_count,
          own_sale_count = EXCLUDED.own_sale_count,
          current_listing_gram = EXCLUDED.current_listing_gram,
          current_bid_gram = EXCLUDED.current_bid_gram,
          market_regime_id = EXCLUDED.market_regime_id,
          feature_version = EXCLUDED.feature_version,
          semantic_version = EXCLUDED.semantic_version,
          estimator_version = EXCLUDED.estimator_version,
          calibration_version = EXCLUDED.calibration_version,
          evidence_summary_json = EXCLUDED.evidence_summary_json,
          explanation_json = EXCLUDED.explanation_json,
          valued_at = EXCLUDED.valued_at,
          stale_at = EXCLUDED.stale_at,
          updated_at = NOW()
        WHERE EXCLUDED.valued_at >= dns_valuations.valued_at
        RETURNING *
      `, values);

      if (comparables !== undefined && result.rowCount === 1) {
        if (!Array.isArray(comparables)) throw new TypeError("comparables must be an array");
        await client.query(
          "DELETE FROM dns_valuation_comparables WHERE valuation_nft_address = $1 AND estimator_version = $2",
          [canonicalTonAddress(valuation.nftAddress), valuation.estimatorVersion],
        );
        for (let index = 0; index < comparables.length; index += 1) {
          const comparable = comparables[index];
          await client.query(`
            INSERT INTO dns_valuation_comparables (
              valuation_nft_address, estimator_version, rank,
              comparable_nft_address, market_event_id, structural_similarity,
              semantic_similarity, recency_weight, quality_weight,
              liquidity_weight, market_regime_weight, final_weight,
              comparable_price_gram, metadata_json
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
          `, [
            canonicalTonAddress(valuation.nftAddress),
            valuation.estimatorVersion,
            comparable.rank ?? index + 1,
            canonicalTonAddress(requireText(comparable.nftAddress, "comparable.nftAddress")),
            optionalText(comparable.marketEventId),
            comparable.structuralSimilarity ?? null,
            comparable.semanticSimilarity ?? null,
            comparable.recencyWeight ?? null,
            comparable.qualityWeight ?? null,
            comparable.liquidityWeight ?? null,
            comparable.marketRegimeWeight ?? null,
            comparable.finalWeight,
            comparable.priceGram,
            jsonValue(comparable.metadata),
          ]);
        }
      }
      if (comparables !== undefined) {
        await client.query("COMMIT");
        inTransaction = false;
      }
      return result.rows[0] ? mapValuationRow(result.rows[0]) : null;
    } catch (error) {
      if (inTransaction) await client.query("ROLLBACK");
      throw error;
    } finally {
      if (comparables !== undefined) client.release();
    }
  }

  async function upsertMeaning(meaning) {
    const values = [
      requireText(meaning.termNormalized, "meaning.termNormalized"),
      optionalText(meaning.language) || "und",
      requireText(meaning.meaningKey, "meaning.meaningKey"),
      jsonValue(meaning.meaningJson),
      uniqueTexts(meaning.semanticCategories),
      jsonValue(meaning.provenance),
      meaning.confidence,
      optionalText(meaning.modelName),
      optionalText(meaning.modelVersion),
      meaning.humanOverride ?? null,
      meaning.lastConfirmedAt ?? null,
    ];
    const result = await query(`
      INSERT INTO dns_meaning_dictionary (
        term_normalized, language, meaning_key, meaning_json,
        semantic_categories, provenance_json, confidence, model_name,
        model_version, human_override_json, last_confirmed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, COALESCE($11, NOW()))
      ON CONFLICT (term_normalized, language, meaning_key) DO UPDATE SET
        meaning_json = EXCLUDED.meaning_json,
        semantic_categories = EXCLUDED.semantic_categories,
        provenance_json = EXCLUDED.provenance_json,
        confidence = EXCLUDED.confidence,
        model_name = EXCLUDED.model_name,
        model_version = EXCLUDED.model_version,
        human_override_json = EXCLUDED.human_override_json,
        last_confirmed_at = EXCLUDED.last_confirmed_at,
        updated_at = NOW()
      RETURNING *
    `, values);
    return result.rows[0];
  }

  async function upsertEngineVersion(engine) {
    const values = [
      requireText(engine.engineName, "engine.engineName"),
      requireText(engine.engineVersion, "engine.engineVersion"),
      requireText(engine.engineKind, "engine.engineKind"),
      optionalText(engine.status) || "candidate",
      optionalText(engine.configHash),
      jsonValue(engine.config),
      jsonValue(engine.metrics),
      engine.activatedAt ?? null,
      engine.retiredAt ?? null,
    ];
    const result = await query(`
      INSERT INTO dns_engine_versions (
        engine_name, engine_version, engine_kind, status, config_hash,
        config_json, metrics_json, activated_at, retired_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (engine_name, engine_version) DO UPDATE SET
        engine_kind = EXCLUDED.engine_kind,
        status = EXCLUDED.status,
        config_hash = EXCLUDED.config_hash,
        config_json = EXCLUDED.config_json,
        metrics_json = EXCLUDED.metrics_json,
        activated_at = EXCLUDED.activated_at,
        retired_at = EXCLUDED.retired_at,
        updated_at = NOW()
      RETURNING *
    `, values);
    return result.rows[0];
  }

  async function enqueueJob(job) {
    const values = [
      requireText(job.jobType, "job.jobType"),
      requireText(job.dedupeKey, "job.dedupeKey"),
      job.priority ?? 0,
      jsonValue(job.payload),
      job.maxAttempts ?? 5,
      job.runAfter ?? null,
    ];
    const result = await query(`
      INSERT INTO dns_jobs (
        job_type, dedupe_key, priority, payload_json, max_attempts, run_after
      ) VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()))
      ON CONFLICT (job_type, dedupe_key)
        WHERE status IN ('queued', 'running', 'retry')
      DO UPDATE SET
        priority = GREATEST(dns_jobs.priority, EXCLUDED.priority),
        payload_json = CASE
          WHEN dns_jobs.status = 'running' THEN dns_jobs.payload_json
          ELSE dns_jobs.payload_json || EXCLUDED.payload_json
        END,
        max_attempts = GREATEST(dns_jobs.max_attempts, EXCLUDED.max_attempts),
        run_after = CASE
          WHEN dns_jobs.status = 'running' THEN dns_jobs.run_after
          ELSE LEAST(dns_jobs.run_after, EXCLUDED.run_after)
        END,
        updated_at = NOW()
      RETURNING *
    `, values);
    return result.rows[0];
  }

  async function seedPipelineJobs(options = {}) {
    const featureVersion = optionalText(options.featureVersion) || "dns-structural-v1";
    const estimatorVersion = optionalText(options.estimatorVersion) || "dns-market-v3";
    const limit = Math.max(1, Math.min(10_000, Number(options.limit) || 1_000));
    const staleHours = Math.max(1, Number(options.staleHours) || 6);
    const result = await query(`
      WITH feature_targets AS (
        SELECT d.nft_address, d.domain_normalized
        FROM dns_domains d
        LEFT JOIN dns_structural_features f ON f.nft_address = d.nft_address
        WHERE d.lifecycle_status <> 'released'
          AND (f.nft_address IS NULL OR f.classifier_version <> $1)
        ORDER BY d.last_seen_at DESC
        LIMIT $4
      ), feature_jobs AS (
        INSERT INTO dns_jobs (job_type, dedupe_key, priority, payload_json)
        SELECT 'dns-feature', nft_address || ':' || $1, 50,
          jsonb_build_object('nftAddress', nft_address, 'domain', domain_normalized)
        FROM feature_targets
        ON CONFLICT (job_type, dedupe_key)
          WHERE status IN ('queued', 'running', 'retry')
        DO UPDATE SET priority = GREATEST(dns_jobs.priority, EXCLUDED.priority),
          run_after = LEAST(dns_jobs.run_after, NOW()), updated_at = NOW()
        RETURNING 1
      ), valuation_targets AS (
        SELECT d.nft_address, d.domain_normalized
        FROM dns_domains d
        JOIN dns_structural_features f ON f.nft_address = d.nft_address
        LEFT JOIN dns_valuations v ON v.nft_address = d.nft_address
        WHERE d.lifecycle_status <> 'released'
          AND (
            v.nft_address IS NULL
            OR v.estimator_version <> $2
            OR v.stale_at <= NOW()
            OR v.valued_at <= NOW() - ($3::double precision * INTERVAL '1 hour')
          )
        ORDER BY COALESCE(v.stale_at, '-infinity'::timestamptz), d.last_seen_at DESC
        LIMIT $4
      ), valuation_jobs AS (
        INSERT INTO dns_jobs (job_type, dedupe_key, priority, payload_json)
        SELECT 'dns-valuation', nft_address || ':' || $2, 40,
          jsonb_build_object('nftAddress', nft_address, 'domain', domain_normalized)
        FROM valuation_targets
        ON CONFLICT (job_type, dedupe_key)
          WHERE status IN ('queued', 'running', 'retry')
        DO UPDATE SET priority = GREATEST(dns_jobs.priority, EXCLUDED.priority),
          run_after = LEAST(dns_jobs.run_after, NOW()), updated_at = NOW()
        RETURNING 1
      )
      SELECT
        (SELECT COUNT(*)::int FROM feature_jobs) AS feature_jobs,
        (SELECT COUNT(*)::int FROM valuation_jobs) AS valuation_jobs
    `, [featureVersion, estimatorVersion, staleHours, limit]);
    return result.rows[0] || { feature_jobs: 0, valuation_jobs: 0 };
  }

  async function claimJobs({ workerId, jobTypes = null, limit = 10, leaseSeconds = 300 }) {
    const types = Array.isArray(jobTypes) && jobTypes.length ? uniqueTexts(jobTypes) : null;
    const result = await query(`
      WITH exhausted AS (
        UPDATE dns_jobs
        SET
          status = 'failed',
          last_error = COALESCE(last_error, 'Job lease expired after maximum attempts'),
          locked_by = NULL,
          locked_at = NULL,
          lease_expires_at = NULL,
          finished_at = NOW(),
          updated_at = NOW()
        WHERE status = 'running'
          AND lease_expires_at <= NOW()
          AND attempts >= max_attempts
        RETURNING id
      ), candidates AS (
        SELECT id
        FROM dns_jobs
        WHERE attempts < max_attempts
          AND ($2::text[] IS NULL OR job_type = ANY($2::text[]))
          AND (
            (status IN ('queued', 'retry') AND run_after <= NOW())
            OR (status = 'running' AND lease_expires_at <= NOW())
          )
        ORDER BY priority DESC, run_after ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT $3
      )
      UPDATE dns_jobs AS job
      SET
        status = 'running',
        attempts = job.attempts + 1,
        locked_by = $1,
        locked_at = NOW(),
        lease_expires_at = NOW() + ($4::double precision * INTERVAL '1 second'),
        started_at = COALESCE(job.started_at, NOW()),
        finished_at = NULL,
        updated_at = NOW()
      FROM candidates
      WHERE job.id = candidates.id
      RETURNING job.*
    `, [
      requireText(workerId, "workerId"),
      types,
      Math.max(1, Math.min(100, Number(limit) || 10)),
      Math.max(1, Number(leaseSeconds) || 300),
    ]);
    return result.rows;
  }

  async function completeJob(jobId, workerId, resultValue = {}) {
    const result = await query(`
      UPDATE dns_jobs
      SET
        status = 'completed',
        result_json = $3,
        locked_by = NULL,
        locked_at = NULL,
        lease_expires_at = NULL,
        finished_at = NOW(),
        updated_at = NOW()
      WHERE id = $1
        AND status = 'running'
        AND locked_by = $2
      RETURNING *
    `, [jobId, requireText(workerId, "workerId"), jsonValue(resultValue)]);
    return result.rows[0] || null;
  }

  async function failJob(jobId, workerId, error, options = {}) {
    const details = errorPayload(error);
    const terminal = Boolean(options.terminal);
    const retryAt = options.retryAt || new Date(Date.now() + Math.max(1, options.retryDelaySeconds ?? 60) * 1000);
    const result = await query(`
      UPDATE dns_jobs
      SET
        status = CASE
          WHEN $4::boolean OR attempts >= max_attempts THEN 'failed'
          ELSE 'retry'
        END,
        run_after = CASE
          WHEN $4::boolean OR attempts >= max_attempts THEN run_after
          ELSE $5
        END,
        last_error = $3,
        error_json = $6,
        locked_by = NULL,
        locked_at = NULL,
        lease_expires_at = NULL,
        finished_at = CASE
          WHEN $4::boolean OR attempts >= max_attempts THEN NOW()
          ELSE NULL
        END,
        updated_at = NOW()
      WHERE id = $1
        AND status = 'running'
        AND locked_by = $2
      RETURNING *
    `, [
      jobId,
      requireText(workerId, "workerId"),
      details.message,
      terminal,
      retryAt,
      details,
    ]);
    return result.rows[0] || null;
  }

  async function setCheckpoint(checkpoint) {
    const values = [
      requireText(checkpoint.workerName, "checkpoint.workerName"),
      requireText(checkpoint.checkpointKey, "checkpoint.checkpointKey"),
      jsonValue(checkpoint.cursor),
      jsonValue(checkpoint.metadata),
      optionalText(checkpoint.checkpointVersion),
    ];
    const result = await query(`
      INSERT INTO dns_job_checkpoints (
        worker_name, checkpoint_key, cursor_json, metadata_json, checkpoint_version
      ) VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (worker_name, checkpoint_key) DO UPDATE SET
        cursor_json = EXCLUDED.cursor_json,
        metadata_json = EXCLUDED.metadata_json,
        checkpoint_version = EXCLUDED.checkpoint_version,
        updated_at = NOW()
      RETURNING *
    `, values);
    return result.rows[0];
  }

  async function getCheckpoint(workerName, checkpointKey) {
    const result = await query(`
      SELECT * FROM dns_job_checkpoints
      WHERE worker_name = $1 AND checkpoint_key = $2
    `, [requireText(workerName, "workerName"), requireText(checkpointKey, "checkpointKey")]);
    return result.rows[0] || null;
  }

  async function setSourceWatermark(watermark) {
    const values = [
      requireText(watermark.source, "watermark.source"),
      requireText(watermark.stream, "watermark.stream"),
      optionalText(watermark.partitionKey) || "default",
      jsonValue(watermark.cursor),
      watermark.eventTime ?? null,
      jsonValue(watermark.metadata),
    ];
    const result = await query(`
      INSERT INTO dns_source_watermarks (
        source, stream, partition_key, cursor_json, event_time, metadata_json
      ) VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (source, stream, partition_key) DO UPDATE SET
        cursor_json = EXCLUDED.cursor_json,
        event_time = EXCLUDED.event_time,
        metadata_json = EXCLUDED.metadata_json,
        updated_at = NOW()
      WHERE
        EXCLUDED.event_time IS NULL
        OR dns_source_watermarks.event_time IS NULL
        OR EXCLUDED.event_time >= dns_source_watermarks.event_time
      RETURNING *
    `, values);
    return result.rows[0];
  }

  async function getSourceWatermark(source, stream, partitionKey = "default") {
    const result = await query(`
      SELECT * FROM dns_source_watermarks
      WHERE source = $1 AND stream = $2 AND partition_key = $3
    `, [
      requireText(source, "source"),
      requireText(stream, "stream"),
      requireText(partitionKey, "partitionKey"),
    ]);
    return result.rows[0] || null;
  }

  return {
    init,
    getValuationsByNftAddresses,
    getValuationByDomain,
    getArchetypeBaselines,
    refreshArchetypeBaselines,
    upsertDomain,
    insertMarketEvent,
    upsertCurrentMarket,
    upsertStructuralFeatures,
    upsertSemanticProfile,
    upsertSemanticReference,
    upsertValuation,
    upsertMeaning,
    upsertEngineVersion,
    enqueueJob,
    seedPipelineJobs,
    claimJobs,
    completeJob,
    failJob,
    setCheckpoint,
    getCheckpoint,
    setSourceWatermark,
    getSourceWatermark,
  };
}

module.exports = {
  MIGRATION_PATH,
  createDnsStore,
  stableMarketEventId,
};

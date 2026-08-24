"""PostgreSQL queue and semantic profile persistence."""

from __future__ import annotations

import hashlib
import json
import random
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Iterator, Sequence

import psycopg
from psycopg.rows import dict_row


@dataclass(frozen=True)
class SemanticJob:
    id: int
    nft_address: str
    domain_normalized: str
    label_normalized: str
    priority: int
    payload: dict[str, Any]
    attempts: int
    max_attempts: int
    structural_features: dict[str, Any]
    market_signal_gram: float
    canonical_identity_resolved: bool = True


_MATERIAL_PROFILE_FIELDS = (
    "profile_version",
    "language",
    "script",
    "entity_type",
    "canonical_entity",
    "ton_relevance",
    "telegram_relevance",
    "crypto_relevance",
    "memorability_score",
    "brandability_score",
    "commercial_intent_score",
    "invented_word_probability",
    "semantic_confidence",
    "model_name",
    "model_version",
    "schema_version",
)


def _canonical_json(value: Any, *, unordered_list: bool = False) -> str:
    """Produce a stable representation across JSON, psycopg, and Pydantic types."""

    if value is None:
        value = [] if unordered_list else None
    if unordered_list and isinstance(value, (list, tuple)):
        normalized = [
            json.dumps(item, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
            for item in value
        ]
        value = sorted(normalized)
    return json.dumps(
        value,
        sort_keys=True,
        separators=(",", ":"),
        ensure_ascii=False,
        default=str,
    )


def _score(value: Any) -> float | None:
    return None if value is None else round(float(value), 6)


def material_profile_signature(
    profile: dict[str, Any] | None,
    *,
    profile_version: str | None = None,
    model_name: str | None = None,
    model_version: str | None = None,
) -> str | None:
    """Hash only fields that can affect semantic comparables or confidence."""

    if profile is None:
        return None
    values = dict(profile)
    if profile_version is not None:
        values["profile_version"] = profile_version
    if model_name is not None:
        values["model_name"] = model_name
    if model_version is not None:
        values["model_version"] = model_version

    material: dict[str, Any] = {}
    for field in _MATERIAL_PROFILE_FIELDS:
        value = values.get(field)
        if field.endswith("_score") or field.endswith("_relevance") or field in {
            "invented_word_probability",
            "semantic_confidence",
        }:
            value = _score(value)
        material[field] = value
    material["semantic_categories"] = sorted(values.get("semantic_categories") or [])
    material["dictionary_meanings_json"] = _canonical_json(
        values.get("dictionary_meanings_json", values.get("dictionary_meanings", [])),
        unordered_list=True,
    )
    material["abbreviation_expansions_json"] = _canonical_json(
        values.get(
            "abbreviation_expansions_json",
            values.get("abbreviation_expansions", []),
        ),
        unordered_list=True,
    )
    provenance = values.get("provenance_json", values.get("provenance", {})) or {}
    material["enrichment_state"] = values.get("enrichment_state") or provenance.get(
        "enrichment_state"
    )
    encoded = json.dumps(
        material, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def material_reference_signature(reference: dict[str, Any] | None) -> str | None:
    if reference is None:
        return None
    material = {
        "external_store": reference.get("external_store"),
        "external_record_id": reference.get("external_record_id"),
        "model_name": reference.get("model_name"),
        "model_version": reference.get("model_version"),
        "dimensions": reference.get("dimensions"),
        "content_hash": reference.get("content_hash"),
        "metadata_json": _canonical_json(
            reference.get("metadata_json", reference.get("metadata", {}))
        ),
    }
    encoded = json.dumps(
        material, sort_keys=True, separators=(",", ":"), ensure_ascii=False
    ).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


class SemanticStore:
    def __init__(self, database_url: str) -> None:
        self.database_url = database_url

    @contextmanager
    def connection(self) -> Iterator[psycopg.Connection[Any]]:
        with psycopg.connect(self.database_url, row_factory=dict_row) as conn:
            yield conn

    def claim_jobs(
        self, *, worker_id: str, job_type: str, limit: int, lease_seconds: int
    ) -> list[SemanticJob]:
        with self.connection() as conn, conn.transaction():
            rows = conn.execute(
                """
                WITH candidates AS (
                  SELECT id
                  FROM dns_jobs
                  WHERE job_type = %(job_type)s
                    AND (
                      (status IN ('queued', 'retry') AND run_after <= NOW())
                      OR (status = 'running' AND lease_expires_at < NOW())
                    )
                  ORDER BY priority DESC, run_after ASC, id ASC
                  FOR UPDATE SKIP LOCKED
                  LIMIT %(limit)s
                ), claimed AS (
                  UPDATE dns_jobs AS jobs
                  SET status = 'running',
                      locked_by = %(worker_id)s,
                      locked_at = NOW(),
                      lease_expires_at = NOW() + make_interval(secs => %(lease_seconds)s),
                      started_at = COALESCE(started_at, NOW()),
                      attempts = attempts + 1,
                      updated_at = NOW()
                  FROM candidates
                  WHERE jobs.id = candidates.id
                  RETURNING jobs.*
                )
                SELECT claimed.id, claimed.priority, claimed.payload_json,
                       claimed.attempts, claimed.max_attempts,
                       domains.nft_address,
                       domains.domain_normalized,
                       domains.label_normalized,
                       (domains.nft_address IS NOT NULL) AS canonical_identity_resolved,
                       COALESCE(features.feature_json, '{}'::jsonb) AS feature_json,
                       features.primary_route, features.scarcity_class,
                       features.pronounceability_score, features.script,
                       GREATEST(
                         COALESCE(market.listing_gram, 0),
                         COALESCE(market.highest_bid_gram, 0),
                         COALESCE(latest_sale.price_gram, 0)
                       ) AS market_signal_gram
                FROM claimed
                LEFT JOIN dns_domains AS domains
                  ON domains.nft_address = COALESCE(
                    claimed.payload_json->>'nftAddress',
                    claimed.payload_json->>'nft_address'
                  )
                LEFT JOIN dns_structural_features AS features
                  ON features.nft_address = domains.nft_address
                LEFT JOIN dns_current_market AS market
                  ON market.nft_address = domains.nft_address
                LEFT JOIN LATERAL (
                  SELECT price_gram
                  FROM dns_market_events
                  WHERE nft_address = domains.nft_address
                    AND is_finalized = TRUE
                    AND is_cancelled = FALSE
                    AND price_gram > 0
                  ORDER BY event_time DESC
                  LIMIT 1
                ) AS latest_sale ON TRUE
                ORDER BY claimed.priority DESC, claimed.id ASC
                """,
                {
                    "job_type": job_type,
                    "worker_id": worker_id,
                    "lease_seconds": lease_seconds,
                    "limit": limit,
                },
            ).fetchall()
        jobs: list[SemanticJob] = []
        for row in rows:
            structural = dict(row.get("feature_json") or {})
            for key in ("primary_route", "scarcity_class", "pronounceability_score", "script"):
                if row.get(key) is not None:
                    structural[key] = row[key]
            jobs.append(
                SemanticJob(
                    id=int(row["id"]),
                    nft_address=str(row.get("nft_address") or ""),
                    domain_normalized=str(row.get("domain_normalized") or ""),
                    label_normalized=str(row.get("label_normalized") or ""),
                    priority=int(row["priority"]),
                    payload=dict(row.get("payload_json") or {}),
                    attempts=int(row["attempts"]),
                    max_attempts=int(row["max_attempts"]),
                    structural_features=structural,
                    market_signal_gram=float(row.get("market_signal_gram") or 0),
                    canonical_identity_resolved=bool(
                        row.get("canonical_identity_resolved")
                    ),
                )
            )
        return jobs

    def extend_leases(
        self, *, job_ids: Sequence[int], worker_id: str, lease_seconds: int
    ) -> int:
        ids = [int(job_id) for job_id in job_ids]
        if not ids:
            return 0
        with self.connection() as conn, conn.transaction():
            result = conn.execute(
                """
                UPDATE dns_jobs
                SET lease_expires_at = NOW() + make_interval(secs => %s),
                    updated_at = NOW()
                WHERE id = ANY(%s)
                  AND status = 'running'
                  AND locked_by = %s
                """,
                (lease_seconds, ids, worker_id),
            )
        return result.rowcount

    def load_dictionary(self, terms: Sequence[str]) -> list[dict[str, Any]]:
        normalized = sorted({term.strip().casefold() for term in terms if term.strip()})
        if not normalized:
            return []
        with self.connection() as conn:
            rows = conn.execute(
                """
                SELECT term_normalized, language, meaning_key, meaning_json,
                       semantic_categories, provenance_json, confidence,
                       model_name, model_version
                FROM dns_meaning_dictionary
                WHERE term_normalized = ANY(%s)
                ORDER BY confidence DESC, term_normalized ASC
                """,
                (normalized,),
            ).fetchall()
        return [dict(row) for row in rows]

    def existing_embedding_reference(
        self,
        *,
        nft_address: str,
        reference_key: str,
        model_name: str,
        model_version: str,
        content_hash: str,
    ) -> dict[str, Any] | None:
        with self.connection() as conn:
            row = conn.execute(
                """
                SELECT external_store, external_record_id, dimensions, content_hash,
                       metadata_json, generated_at
                FROM dns_semantic_references
                WHERE nft_address = %s
                  AND reference_type = 'embedding'
                  AND reference_key = %s
                  AND model_name = %s
                  AND model_version = %s
                  AND content_hash = %s
                """,
                (nft_address, reference_key, model_name, model_version, content_hash),
            ).fetchone()
        return dict(row) if row else None

    def existing_profile(self, nft_address: str) -> dict[str, Any] | None:
        with self.connection() as conn:
            row = conn.execute(
                """
                SELECT profile_version, language, script, semantic_categories,
                       entity_type, canonical_entity, dictionary_meanings_json,
                       abbreviation_expansions_json, ton_relevance,
                       telegram_relevance, crypto_relevance, memorability_score,
                       brandability_score, commercial_intent_score,
                       invented_word_probability, semantic_confidence,
                       provenance_json, model_name, model_version, schema_version,
                       computed_at
                FROM dns_semantic_profiles
                WHERE nft_address = %s
                """,
                (nft_address,),
            ).fetchone()
        return dict(row) if row else None

    def save_success(
        self,
        *,
        job: SemanticJob,
        worker_id: str,
        profile_version: str,
        profile: dict[str, Any],
        model_name: str | None,
        model_version: str | None,
        embedding_reference: dict[str, Any] | None,
        result: dict[str, Any],
    ) -> bool:
        meanings = profile.get("dictionary_meanings", [])
        abbreviations = profile.get("abbreviation_expansions", [])
        provenance = dict(profile.get("provenance") or {})
        with self.connection() as conn, conn.transaction():
            existing_profile = conn.execute(
                """
                SELECT profile_version, language, script, semantic_categories,
                       entity_type, canonical_entity, dictionary_meanings_json,
                       abbreviation_expansions_json, ton_relevance,
                       telegram_relevance, crypto_relevance, memorability_score,
                       brandability_score, commercial_intent_score,
                       invented_word_probability, semantic_confidence,
                       provenance_json, model_name, model_version, schema_version
                FROM dns_semantic_profiles
                WHERE nft_address = %s
                FOR UPDATE
                """,
                (job.nft_address,),
            ).fetchone()
            existing_profile_signature = material_profile_signature(
                dict(existing_profile) if existing_profile else None
            )
            incoming_profile_signature = material_profile_signature(
                profile,
                profile_version=profile_version,
                model_name=model_name,
                model_version=model_version,
            )
            profile_changed = existing_profile_signature != incoming_profile_signature

            if profile_changed:
                conn.execute(
                    """
                INSERT INTO dns_semantic_profiles (
                  nft_address, profile_version, language, script,
                  semantic_categories, entity_type, canonical_entity,
                  dictionary_meanings_json, abbreviation_expansions_json,
                  ton_relevance, telegram_relevance, crypto_relevance,
                  memorability_score, brandability_score, commercial_intent_score,
                  invented_word_probability, semantic_confidence, provenance_json,
                  model_name, model_version, schema_version, computed_at, updated_at
                ) VALUES (
                  %(nft_address)s, %(profile_version)s, %(language)s, %(script)s,
                  %(categories)s, %(entity_type)s, %(canonical_entity)s,
                  %(meanings)s::jsonb, %(abbreviations)s::jsonb,
                  %(ton)s, %(telegram)s, %(crypto)s,
                  %(memorability)s, %(brandability)s, %(commercial)s,
                  %(invented)s, %(confidence)s, %(provenance)s::jsonb,
                  %(model_name)s, %(model_version)s, %(schema_version)s,
                  NOW(), NOW()
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
                  computed_at = NOW(), updated_at = NOW()
                    """,
                    {
                        "nft_address": job.nft_address,
                        "profile_version": profile_version,
                        "language": profile.get("language"),
                        "script": profile.get("script"),
                        "categories": profile.get("semantic_categories", []),
                        "entity_type": profile.get("entity_type"),
                        "canonical_entity": profile.get("canonical_entity"),
                        "meanings": json.dumps(meanings, ensure_ascii=False),
                        "abbreviations": json.dumps(abbreviations, ensure_ascii=False),
                        "ton": profile.get("ton_relevance"),
                        "telegram": profile.get("telegram_relevance"),
                        "crypto": profile.get("crypto_relevance"),
                        "memorability": profile.get("memorability_score"),
                        "brandability": profile.get("brandability_score"),
                        "commercial": profile.get("commercial_intent_score"),
                        "invented": profile.get("invented_word_probability"),
                        "confidence": profile.get("semantic_confidence"),
                        "provenance": json.dumps(provenance, ensure_ascii=False),
                        "model_name": model_name,
                        "model_version": model_version,
                        "schema_version": profile["schema_version"],
                    },
                )

            reference_changed = False
            if embedding_reference:
                existing_reference = conn.execute(
                    """
                    SELECT external_store, external_record_id, model_name,
                           model_version, dimensions, content_hash, metadata_json
                    FROM dns_semantic_references
                    WHERE nft_address = %s
                      AND reference_type = 'embedding'
                      AND reference_key = %s
                      AND model_name = %s
                      AND model_version = %s
                    FOR UPDATE
                    """,
                    (
                        job.nft_address,
                        embedding_reference["reference_key"],
                        embedding_reference["model_name"],
                        embedding_reference["model_version"],
                    ),
                ).fetchone()
                existing_reference_signature = material_reference_signature(
                    dict(existing_reference) if existing_reference else None
                )
                incoming_reference_signature = material_reference_signature(
                    embedding_reference
                )
                reference_changed = (
                    existing_reference_signature != incoming_reference_signature
                )
                if reference_changed:
                    conn.execute(
                        """
                    INSERT INTO dns_semantic_references (
                      nft_address, reference_type, reference_key, external_store,
                      external_record_id, model_name, model_version, dimensions,
                      content_hash, metadata_json, generated_at, updated_at
                    ) VALUES (
                      %(nft_address)s, 'embedding', %(reference_key)s,
                      %(external_store)s, %(external_record_id)s, %(model_name)s,
                      %(model_version)s, %(dimensions)s, %(content_hash)s,
                      %(metadata)s::jsonb, NOW(), NOW()
                    )
                    ON CONFLICT (
                      nft_address, reference_type, reference_key, model_name, model_version
                    ) DO UPDATE SET
                      external_store = EXCLUDED.external_store,
                      external_record_id = EXCLUDED.external_record_id,
                      dimensions = EXCLUDED.dimensions,
                      content_hash = EXCLUDED.content_hash,
                      metadata_json = EXCLUDED.metadata_json,
                      generated_at = NOW(), updated_at = NOW()
                        """,
                        {
                            "nft_address": job.nft_address,
                            "reference_key": embedding_reference["reference_key"],
                            "external_store": embedding_reference["external_store"],
                            "external_record_id": embedding_reference[
                                "external_record_id"
                            ],
                            "model_name": embedding_reference["model_name"],
                            "model_version": embedding_reference["model_version"],
                            "dimensions": embedding_reference["dimensions"],
                            "content_hash": embedding_reference["content_hash"],
                            "metadata": json.dumps(
                                embedding_reference.get("metadata") or {},
                                ensure_ascii=False,
                            ),
                        },
                    )

            semantic_changed = profile_changed or reference_changed
            if semantic_changed:
                change_signature = hashlib.sha256(
                    (
                        f"{incoming_profile_signature or ''}|"
                        f"{incoming_reference_signature if embedding_reference else ''}"
                    ).encode("utf-8")
                ).hexdigest()[:20]
                conn.execute(
                    """
                INSERT INTO dns_jobs (
                  job_type, dedupe_key, priority, payload_json, max_attempts, run_after
                ) VALUES (
                  'dns-valuation', %(valuation_dedupe_key)s, %(valuation_priority)s,
                  %(valuation_payload)s::jsonb, 5, NOW()
                )
                ON CONFLICT (job_type, dedupe_key)
                  WHERE status IN ('queued', 'running', 'retry')
                DO UPDATE SET
                  priority = GREATEST(dns_jobs.priority, EXCLUDED.priority),
                  payload_json = CASE
                    WHEN dns_jobs.status = 'running' THEN dns_jobs.payload_json
                    ELSE dns_jobs.payload_json || EXCLUDED.payload_json
                  END,
                  run_after = CASE
                    WHEN dns_jobs.status = 'running' THEN dns_jobs.run_after
                    ELSE LEAST(dns_jobs.run_after, EXCLUDED.run_after)
                  END,
                  updated_at = NOW()
                    """,
                    {
                        "valuation_dedupe_key": (
                            f"{job.nft_address}:{profile_version}:"
                            f"semantic-{change_signature}"
                        ),
                        "valuation_priority": max(60, job.priority),
                        "valuation_payload": json.dumps(
                            {
                                "nftAddress": job.nft_address,
                                "domain": job.domain_normalized,
                                "semanticProfileVersion": profile_version,
                                "semanticProfileChanged": profile_changed,
                                "semanticReferenceChanged": reference_changed,
                            },
                            ensure_ascii=False,
                        ),
                    },
                )
            completion_result = {
                **result,
                "semantic_profile_changed": profile_changed,
                "semantic_reference_changed": reference_changed,
                "valuation_refresh_enqueued": semantic_changed,
            }
            updated = conn.execute(
                """
                UPDATE dns_jobs
                SET status = 'completed', result_json = %(result)s::jsonb,
                    finished_at = NOW(), lease_expires_at = NULL,
                    locked_by = NULL, locked_at = NULL,
                    last_error = NULL, error_json = NULL, updated_at = NOW()
                WHERE id = %(job_id)s AND status = 'running' AND locked_by = %(worker_id)s
                """,
                {
                    "result": json.dumps(completion_result, ensure_ascii=False),
                    "job_id": job.id,
                    "worker_id": worker_id,
                },
            )
            if updated.rowcount != 1:
                raise RuntimeError(f"semantic job {job.id} lease was lost before completion")
        return semantic_changed

    def retry_or_fail(
        self,
        *,
        job: SemanticJob,
        worker_id: str,
        error_message: str,
        error_type: str,
        retry_base_seconds: float,
        retry_max_seconds: float,
    ) -> str:
        terminal = job.attempts >= job.max_attempts
        delay = min(
            retry_max_seconds,
            retry_base_seconds * (2 ** max(0, job.attempts - 1)) + random.random(),
        )
        next_status = "failed" if terminal else "retry"
        with self.connection() as conn, conn.transaction():
            updated = conn.execute(
                """
                UPDATE dns_jobs
                SET status = %(status)s,
                    run_after = CASE WHEN %(status)s = 'retry'
                      THEN NOW() + make_interval(secs => %(delay)s) ELSE run_after END,
                    finished_at = CASE WHEN %(status)s = 'failed' THEN NOW() ELSE NULL END,
                    lease_expires_at = NULL, locked_by = NULL, locked_at = NULL,
                    last_error = %(error_message)s,
                    error_json = %(error_json)s::jsonb,
                    updated_at = NOW()
                WHERE id = %(job_id)s AND status = 'running' AND locked_by = %(worker_id)s
                """,
                {
                    "status": next_status,
                    "delay": delay,
                    "error_message": error_message[:2000],
                    "error_json": json.dumps(
                        {
                            "type": error_type,
                            "message": error_message[:2000],
                            "at": datetime.now(timezone.utc).isoformat(),
                        }
                    ),
                    "job_id": job.id,
                    "worker_id": worker_id,
                },
            )
            if updated.rowcount != 1:
                raise RuntimeError(f"semantic job {job.id} lease was lost during retry")
        return next_status

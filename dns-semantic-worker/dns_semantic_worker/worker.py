"""Bounded, resumable DNS semantic worker orchestration."""

from __future__ import annotations

import hashlib
import logging
import time
from contextlib import contextmanager
from dataclasses import dataclass
from threading import Event, Thread
from typing import Any, Sequence

from .config import Settings
from .deterministic import DeterministicResult, build_deterministic_profile, tokenize
from .models import (
    EmbeddingAdapter,
    QwenClassifier,
    VectorStore,
    build_embedding_adapter,
    build_vector_store,
)
from .schema import SCHEMA_VERSION, SemanticProfileV1
from .store import SemanticJob, SemanticStore

LOGGER = logging.getLogger("dns-semantic-worker")


@dataclass
class JobContext:
    job: SemanticJob
    deterministic: DeterministicResult
    profile: SemanticProfileV1
    content_hash: str
    embedding_reference: dict[str, Any] | None = None
    qwen_used: bool = False
    qwen_cached: bool = False
    qwen_deferred: bool = False
    embedding_deferred: bool = False
    warnings: list[str] | None = None

    def warn(self, message: str) -> None:
        if self.warnings is None:
            self.warnings = []
        self.warnings.append(message)


class SemanticWorker:
    def __init__(
        self,
        *,
        settings: Settings,
        store: SemanticStore,
        embedding: EmbeddingAdapter,
        vectors: VectorStore,
        qwen: QwenClassifier,
        sleep=time.sleep,
    ) -> None:
        self.settings = settings
        self.store = store
        self.embedding = embedding
        self.vectors = vectors
        self.qwen = qwen
        self.sleep = sleep

    @classmethod
    def from_settings(cls, settings: Settings) -> "SemanticWorker":
        return cls(
            settings=settings,
            store=SemanticStore(settings.database_url),
            embedding=build_embedding_adapter(settings),
            vectors=build_vector_store(settings),
            qwen=QwenClassifier(settings),
        )

    def _prepare(self, job: SemanticJob) -> JobContext:
        terms = [job.label_normalized, *tokenize(job.label_normalized)]
        dictionary = self.store.load_dictionary(terms)
        result = build_deterministic_profile(
            job.domain_normalized,
            dictionary,
            job.structural_features,
            profile_version=self.settings.profile_version,
            dictionary_version=self.settings.dictionary_version,
        )
        content_hash = hashlib.sha256(result.embedding_text.encode("utf-8")).hexdigest()
        return JobContext(
            job=job,
            deterministic=result,
            profile=result.profile,
            content_hash=content_hash,
        )

    def _requires_qwen(self, context: JobContext) -> bool:
        payload = context.job.payload
        force = payload.get("forceQwen", payload.get("force_qwen", False))
        human_review = payload.get("humanReview", payload.get("human_review", False))
        bad_backtest = payload.get("badBacktest", payload.get("bad_backtest", False))
        high_impact = context.job.market_signal_gram >= self.settings.qwen_high_impact_gram
        return bool(
            force
            or human_review
            or bad_backtest
            or context.deterministic.ambiguous
            or (
                high_impact
                and context.profile.semantic_confidence
                < self.settings.qwen_confidence_threshold
            )
        )

    @staticmethod
    def _merge_qwen_profile(
        deterministic: SemanticProfileV1,
        classified: Any,
        *,
        provenance: dict[str, Any],
    ) -> SemanticProfileV1:
        categories = list(
            dict.fromkeys(
                [
                    *deterministic.semantic_categories,
                    *classified.semantic_categories,
                ]
            )
        )[:12]
        meanings = list(
            {
                (item.term.casefold(), item.meaning.casefold()): item
                for item in [
                    *classified.dictionary_meanings,
                    *deterministic.dictionary_meanings,
                ]
            }.values()
        )[:8]
        abbreviations = list(
            {
                (item.token.casefold(), item.expansion.casefold()): item
                for item in [
                    *classified.abbreviation_expansions,
                    *deterministic.abbreviation_expansions,
                ]
            }.values()
        )[:8]
        return SemanticProfileV1(
            **classified.model_dump(
                mode="python",
                exclude={
                    "semantic_categories",
                    "dictionary_meanings",
                    "abbreviation_expansions",
                    "script",
                    "ton_relevance",
                    "telegram_relevance",
                    "crypto_relevance",
                },
            ),
            script=deterministic.script,
            semantic_categories=categories,
            dictionary_meanings=meanings,
            abbreviation_expansions=abbreviations,
            ton_relevance=max(
                deterministic.ton_relevance, classified.ton_relevance
            ),
            telegram_relevance=max(
                deterministic.telegram_relevance,
                classified.telegram_relevance,
            ),
            crypto_relevance=max(
                deterministic.crypto_relevance,
                classified.crypto_relevance,
            ),
            enrichment_state="complete",
            provenance=provenance,
        )

    def _apply_qwen(self, context: JobContext) -> None:
        if not self._requires_qwen(context):
            return
        cached = self._cached_qwen_profile(context)
        if cached is not None:
            context.qwen_cached = True
            context.profile = cached.model_copy(
                update={
                    "provenance": {
                        **cached.provenance,
                        "qwen": "cached",
                    }
                }
            )
            return
        if not self.qwen.enabled:
            context.qwen_deferred = True
            context.profile = context.profile.model_copy(
                update={
                    "enrichment_state": "deferred",
                    "provenance": {
                        **context.profile.provenance,
                        "qwen": "deferred:not-configured",
                    },
                }
            )
            return
        try:
            classified = self.qwen.classify(
                domain_normalized=context.job.domain_normalized,
                deterministic_profile=context.profile.model_dump(mode="json"),
                structural_features=context.job.structural_features,
            )
            context.qwen_used = True
            context.profile = self._merge_qwen_profile(
                context.profile,
                classified,
                provenance={
                    **context.profile.provenance,
                    "qwen": "complete",
                    "qwen_model": self.qwen.model_name,
                    "qwen_model_version": self.qwen.model_version,
                    "qwen_ambiguity_reason": classified.ambiguity_reason,
                    "deterministic_profile_retained": True,
                },
            )
        except Exception as exc:  # Optional AI failure cannot block deterministic valuation.
            context.qwen_deferred = True
            context.warn(f"qwen:{type(exc).__name__}")
            context.profile = context.profile.model_copy(
                update={
                    "enrichment_state": "deferred",
                    "provenance": {
                        **context.profile.provenance,
                        "qwen": f"deferred:{type(exc).__name__}",
                    },
                }
            )

    def _cached_qwen_profile(self, context: JobContext) -> SemanticProfileV1 | None:
        existing = self.store.existing_profile(context.job.nft_address)
        if not existing:
            return None
        provenance = dict(existing.get("provenance_json") or {})
        if (
            existing.get("model_name") != self.qwen.model_name
            or existing.get("model_version") != self.qwen.model_version
            or existing.get("schema_version") != SCHEMA_VERSION
            or provenance.get("semantic_input_hash") != context.content_hash
        ):
            return None
        try:
            return SemanticProfileV1.model_validate(
                {
                    "schema_version": existing["schema_version"],
                    "language": existing["language"],
                    "script": existing["script"],
                    "semantic_categories": existing.get("semantic_categories") or [],
                    "entity_type": existing.get("entity_type") or "none",
                    "canonical_entity": existing.get("canonical_entity"),
                    "dictionary_meanings": existing.get("dictionary_meanings_json")
                    or [],
                    "abbreviation_expansions": existing.get(
                        "abbreviation_expansions_json"
                    )
                    or [],
                    "ton_relevance": existing["ton_relevance"],
                    "telegram_relevance": existing["telegram_relevance"],
                    "crypto_relevance": existing["crypto_relevance"],
                    "memorability_score": existing["memorability_score"],
                    "brandability_score": existing["brandability_score"],
                    "commercial_intent_score": existing[
                        "commercial_intent_score"
                    ],
                    "invented_word_probability": existing[
                        "invented_word_probability"
                    ],
                    "semantic_confidence": existing["semantic_confidence"],
                    "ambiguity_reason": provenance.get("qwen_ambiguity_reason"),
                    "enrichment_state": provenance.get(
                        "enrichment_state", "complete"
                    ),
                    "provenance": provenance,
                }
            )
        except (KeyError, TypeError, ValueError):
            context.warn("qwen-cache:invalid")
            return None

    def _existing_embedding(self, context: JobContext) -> dict[str, Any] | None:
        return self.store.existing_embedding_reference(
            nft_address=context.job.nft_address,
            reference_key="domain-label",
            model_name=self.embedding.model_name,
            model_version=self.embedding.model_version,
            content_hash=context.content_hash,
        )

    def _embed_batch(self, contexts: Sequence[JobContext]) -> None:
        if self.embedding.model_name == "disabled":
            for context in contexts:
                context.embedding_deferred = True
                context.profile = context.profile.model_copy(
                    update={
                        "enrichment_state": (
                            "deferred"
                            if context.qwen_deferred
                            or (
                                context.deterministic.ambiguous
                                and not (context.qwen_used or context.qwen_cached)
                            )
                            else context.profile.enrichment_state
                        ),
                        "provenance": {
                            **context.profile.provenance,
                            "embedding": "deferred:not-configured",
                        },
                    }
                )
            return

        pending: list[JobContext] = []
        for context in contexts:
            existing = self._existing_embedding(context)
            if existing:
                context.embedding_reference = {
                    "reference_key": "domain-label",
                    "external_store": existing["external_store"],
                    "external_record_id": existing["external_record_id"],
                    "model_name": self.embedding.model_name,
                    "model_version": self.embedding.model_version,
                    "dimensions": existing["dimensions"],
                    "content_hash": context.content_hash,
                    "metadata": dict(existing.get("metadata_json") or {}),
                }
                context.profile = context.profile.model_copy(
                    update={
                        "provenance": {
                            **context.profile.provenance,
                            "embedding": "cached",
                        }
                    }
                )
            else:
                pending.append(context)
        if not pending:
            return
        if not self.vectors.enabled:
            for context in pending:
                context.embedding_deferred = True
                context.warn("embedding:vector-store-not-configured")
                context.profile = context.profile.model_copy(
                    update={
                        "enrichment_state": "deferred",
                        "provenance": {
                            **context.profile.provenance,
                            "embedding": "deferred:vector-store-not-configured",
                        },
                    }
                )
            return
        try:
            vectors = self.embedding.embed(
                [context.deterministic.embedding_text for context in pending]
            )
            for context, vector in zip(pending, vectors, strict=True):
                record = self.vectors.upsert(
                    nft_address=context.job.nft_address,
                    domain_normalized=context.job.domain_normalized,
                    vector=vector,
                    model_name=self.embedding.model_name,
                    model_version=self.embedding.model_version,
                    content_hash=context.content_hash,
                )
                context.embedding_reference = {
                    "reference_key": "domain-label",
                    "external_store": self.vectors.external_store,
                    "external_record_id": record.external_record_id,
                    "model_name": self.embedding.model_name,
                    "model_version": self.embedding.model_version,
                    "dimensions": record.dimensions,
                    "content_hash": record.content_hash,
                    "metadata": record.metadata,
                }
                context.profile = context.profile.model_copy(
                    update={
                        "provenance": {
                            **context.profile.provenance,
                            "embedding": "complete",
                            "embedding_model": self.embedding.model_name,
                            "embedding_model_version": self.embedding.model_version,
                        }
                    }
                )
        except Exception as exc:  # Preserve deterministic coverage on optional service failure.
            for context in pending:
                context.embedding_deferred = True
                context.warn(f"embedding:{type(exc).__name__}")
                context.profile = context.profile.model_copy(
                    update={
                        "enrichment_state": "deferred",
                        "provenance": {
                            **context.profile.provenance,
                            "embedding": f"deferred:{type(exc).__name__}",
                        },
                    }
                )

    def _persist(self, context: JobContext) -> None:
        context.profile = context.profile.model_copy(
            update={
                "provenance": {
                    **context.profile.provenance,
                    "enrichment_state": context.profile.enrichment_state,
                    "semantic_input_hash": context.content_hash,
                    "warnings": context.warnings or [],
                }
            }
        )
        model_name = (
            self.qwen.model_name
            if context.qwen_used or context.qwen_cached
            else "deterministic"
        )
        model_version = (
            self.qwen.model_version
            if context.qwen_used or context.qwen_cached
            else self.settings.dictionary_version
        )
        result = {
            "nft_address": context.job.nft_address,
            "domain": context.job.domain_normalized,
            "enrichment_state": context.profile.enrichment_state,
            "semantic_confidence": context.profile.semantic_confidence,
            "qwen_used": context.qwen_used,
            "qwen_cached": context.qwen_cached,
            "qwen_deferred": context.qwen_deferred,
            "embedding_deferred": context.embedding_deferred,
            "embedding_cached_or_written": bool(context.embedding_reference),
            "warnings": context.warnings or [],
        }
        self.store.save_success(
            job=context.job,
            worker_id=self.settings.worker_id,
            profile_version=self.settings.profile_version,
            profile=context.profile.model_dump(mode="json"),
            model_name=model_name,
            model_version=model_version,
            embedding_reference=context.embedding_reference,
            result=result,
        )

    @contextmanager
    def _lease_heartbeat(self, jobs: Sequence[SemanticJob]):
        stop = Event()
        job_ids = [job.id for job in jobs]
        interval = max(5.0, self.settings.lease_seconds / 3.0)

        def heartbeat() -> None:
            while not stop.wait(interval):
                try:
                    extended = self.store.extend_leases(
                        job_ids=job_ids,
                        worker_id=self.settings.worker_id,
                        lease_seconds=self.settings.lease_seconds,
                    )
                    LOGGER.debug("renewed %s/%s semantic leases", extended, len(job_ids))
                except Exception:
                    LOGGER.exception("semantic lease heartbeat failed")

        thread = Thread(target=heartbeat, name="dns-semantic-lease-heartbeat", daemon=True)
        thread.start()
        try:
            yield
        finally:
            stop.set()
            thread.join(timeout=min(2.0, interval))

    def run_batch(self) -> int:
        jobs = self.store.claim_jobs(
            worker_id=self.settings.worker_id,
            job_type=self.settings.job_type,
            limit=self.settings.batch_size,
            lease_seconds=self.settings.lease_seconds,
        )
        if not jobs:
            return 0
        self.store.extend_leases(
            job_ids=[job.id for job in jobs],
            worker_id=self.settings.worker_id,
            lease_seconds=self.settings.lease_seconds,
        )
        with self._lease_heartbeat(jobs):
            contexts: list[JobContext] = []
            for job in jobs:
                try:
                    if not job.canonical_identity_resolved:
                        raise ValueError(
                            "semantic job identity is absent from canonical dns_domains"
                        )
                    if not job.nft_address or not job.domain_normalized or not job.label_normalized:
                        raise ValueError("canonical DNS identity is incomplete")
                    context = self._prepare(job)
                    self._apply_qwen(context)
                    contexts.append(context)
                except Exception as exc:
                    status = self.store.retry_or_fail(
                        job=job,
                        worker_id=self.settings.worker_id,
                        error_message=str(exc),
                        error_type=type(exc).__name__,
                        retry_base_seconds=self.settings.retry_base_seconds,
                        retry_max_seconds=self.settings.retry_max_seconds,
                    )
                    LOGGER.exception("semantic job %s moved to %s", job.id, status)

            for offset in range(0, len(contexts), self.settings.embedding_batch_size):
                batch = contexts[offset : offset + self.settings.embedding_batch_size]
                self.store.extend_leases(
                    job_ids=[context.job.id for context in batch],
                    worker_id=self.settings.worker_id,
                    lease_seconds=self.settings.lease_seconds,
                )
                self._embed_batch(batch)
                for context in batch:
                    try:
                        self._persist(context)
                        LOGGER.info(
                            "completed job=%s domain=%s state=%s qwen=%s embedding=%s",
                            context.job.id,
                            context.job.domain_normalized,
                            context.profile.enrichment_state,
                            context.qwen_used,
                            bool(context.embedding_reference),
                        )
                    except Exception as exc:
                        status = self.store.retry_or_fail(
                            job=context.job,
                            worker_id=self.settings.worker_id,
                            error_message=str(exc),
                            error_type=type(exc).__name__,
                            retry_base_seconds=self.settings.retry_base_seconds,
                            retry_max_seconds=self.settings.retry_max_seconds,
                        )
                        LOGGER.exception("semantic job %s moved to %s", context.job.id, status)
        return len(jobs)

    def run(self) -> None:
        LOGGER.info(
            "starting worker=%s job_type=%s embedding=%s qwen=%s",
            self.settings.worker_id,
            self.settings.job_type,
            self.embedding.model_name,
            self.qwen.enabled,
        )
        while True:
            count = self.run_batch()
            if self.settings.run_once:
                return
            if count == 0:
                self.sleep(self.settings.poll_seconds)

from dataclasses import replace
import hashlib

from dns_semantic_worker.deterministic import build_deterministic_profile
from dns_semantic_worker.models import DisabledEmbeddingAdapter, DisabledVectorStore
from dns_semantic_worker.store import SemanticJob
from dns_semantic_worker.worker import SemanticWorker
from test_models import settings


class FakeQwen:
    enabled = False
    model_name = "Qwen/Qwen3-8B"
    model_version = "qwen3-8b-v1"


class EnrichingQwen(FakeQwen):
    enabled = True

    def classify(self, **_kwargs):
        from dns_semantic_worker.schema import QwenClassificationV1, SCHEMA_VERSION

        return QwenClassificationV1(
            schema_version=SCHEMA_VERSION,
            language="en",
            script="Latin",
            semantic_categories=["culture"],
            entity_type="concept",
            canonical_entity=None,
            dictionary_meanings=[],
            abbreviation_expansions=[],
            ton_relevance=0.0,
            telegram_relevance=0.0,
            crypto_relevance=0.0,
            memorability_score=0.8,
            brandability_score=0.75,
            commercial_intent_score=0.3,
            invented_word_probability=0.1,
            semantic_confidence=0.9,
            ambiguity_reason=None,
        )


class FakeStore:
    def __init__(self, jobs, existing_profile=None):
        self.jobs = jobs
        self.profile = existing_profile
        self.saved = []
        self.retries = []
        self.extended = []

    def claim_jobs(self, **kwargs):
        jobs, self.jobs = self.jobs, []
        return jobs

    def extend_leases(self, **kwargs):
        self.extended.append(kwargs)
        return len(kwargs["job_ids"])

    def load_dictionary(self, terms):
        return []

    def existing_embedding_reference(self, **kwargs):
        return None

    def existing_profile(self, _nft_address):
        return self.profile

    def save_success(self, **kwargs):
        self.saved.append(kwargs)

    def retry_or_fail(self, **kwargs):
        self.retries.append(kwargs)
        return "retry"


def job(domain="1662.ton", priority=10, market_signal=0):
    return SemanticJob(
        id=1,
        nft_address="0:abc",
        domain_normalized=domain,
        label_normalized=domain.removesuffix(".ton"),
        priority=priority,
        payload={"nftAddress": "0:abc", "domain": domain},
        attempts=1,
        max_attempts=5,
        structural_features={},
        market_signal_gram=market_signal,
    )


def test_deterministic_mode_completes_when_models_are_absent():
    store = FakeStore([job()])
    worker = SemanticWorker(
        settings=replace(settings(), embedding_provider="disabled", embedding_endpoint=None, qwen_endpoint=None),
        store=store,
        embedding=DisabledEmbeddingAdapter(),
        vectors=DisabledVectorStore(),
        qwen=FakeQwen(),
        sleep=lambda _: None,
    )
    assert worker.run_batch() == 1
    assert len(store.saved) == 1
    assert not store.retries
    saved = store.saved[0]
    assert saved["profile"]["enrichment_state"] == "deterministic"
    assert saved["result"]["embedding_deferred"] is True
    assert saved["result"]["qwen_deferred"] is False


def test_ambiguous_domain_is_saved_deferred_without_qwen():
    store = FakeStore([job("qxz.ton", market_signal=900)])
    worker = SemanticWorker(
        settings=replace(settings(), embedding_provider="disabled", embedding_endpoint=None, qwen_endpoint=None),
        store=store,
        embedding=DisabledEmbeddingAdapter(),
        vectors=DisabledVectorStore(),
        qwen=FakeQwen(),
    )
    worker.run_batch()
    assert store.saved[0]["profile"]["enrichment_state"] == "deferred"
    assert store.saved[0]["result"]["qwen_deferred"] is True


def test_invalid_job_retries_instead_of_disappearing():
    bad = replace(job(), nft_address="")
    store = FakeStore([bad])
    worker = SemanticWorker(
        settings=replace(settings(), embedding_provider="disabled", embedding_endpoint=None, qwen_endpoint=None),
        store=store,
        embedding=DisabledEmbeddingAdapter(),
        vectors=DisabledVectorStore(),
        qwen=FakeQwen(),
    )
    worker.run_batch()
    assert not store.saved
    assert len(store.retries) == 1


def test_payload_identity_without_canonical_domain_retries():
    unresolved = replace(job(), canonical_identity_resolved=False)
    store = FakeStore([unresolved])
    worker = SemanticWorker(
        settings=replace(
            settings(),
            embedding_provider="disabled",
            embedding_endpoint=None,
            qwen_endpoint=None,
        ),
        store=store,
        embedding=DisabledEmbeddingAdapter(),
        vectors=DisabledVectorStore(),
        qwen=FakeQwen(),
    )
    worker.run_batch()
    assert not store.saved
    assert "canonical dns_domains" in store.retries[0]["error_message"]


def test_qwen_enriches_without_erasing_deterministic_categories():
    store = FakeStore([job("qxz.ton", market_signal=900)])
    worker = SemanticWorker(
        settings=replace(
            settings(), embedding_provider="disabled", embedding_endpoint=None
        ),
        store=store,
        embedding=DisabledEmbeddingAdapter(),
        vectors=DisabledVectorStore(),
        qwen=EnrichingQwen(),
    )
    worker.run_batch()
    saved = store.saved[0]["profile"]
    assert saved["enrichment_state"] == "complete"
    assert "acronym-candidate" in saved["semantic_categories"]
    assert "culture" in saved["semantic_categories"]
    assert saved["provenance"]["deterministic_profile_retained"] is True


def test_matching_qwen_profile_is_reused_without_a_model_endpoint():
    deterministic = build_deterministic_profile("qxz.ton")
    content_hash = hashlib.sha256(
        deterministic.embedding_text.encode("utf-8")
    ).hexdigest()
    classified = EnrichingQwen().classify()
    cached = SemanticWorker._merge_qwen_profile(
        deterministic.profile,
        classified,
        provenance={
            **deterministic.profile.provenance,
            "qwen": "complete",
            "qwen_ambiguity_reason": None,
            "semantic_input_hash": content_hash,
            "enrichment_state": "complete",
        },
    ).model_dump(mode="json")
    existing = {
        "profile_version": "semantic-v1",
        "language": cached["language"],
        "script": cached["script"],
        "semantic_categories": cached["semantic_categories"],
        "entity_type": cached["entity_type"],
        "canonical_entity": cached["canonical_entity"],
        "dictionary_meanings_json": cached["dictionary_meanings"],
        "abbreviation_expansions_json": cached["abbreviation_expansions"],
        "ton_relevance": cached["ton_relevance"],
        "telegram_relevance": cached["telegram_relevance"],
        "crypto_relevance": cached["crypto_relevance"],
        "memorability_score": cached["memorability_score"],
        "brandability_score": cached["brandability_score"],
        "commercial_intent_score": cached["commercial_intent_score"],
        "invented_word_probability": cached["invented_word_probability"],
        "semantic_confidence": cached["semantic_confidence"],
        "provenance_json": cached["provenance"],
        "model_name": FakeQwen.model_name,
        "model_version": FakeQwen.model_version,
        "schema_version": cached["schema_version"],
    }
    store = FakeStore([job("qxz.ton", market_signal=900)], existing_profile=existing)
    worker = SemanticWorker(
        settings=replace(
            settings(),
            embedding_provider="disabled",
            embedding_endpoint=None,
            qwen_endpoint=None,
        ),
        store=store,
        embedding=DisabledEmbeddingAdapter(),
        vectors=DisabledVectorStore(),
        qwen=FakeQwen(),
    )
    worker.run_batch()
    assert store.saved[0]["result"]["qwen_used"] is False
    assert store.saved[0]["result"]["qwen_cached"] is True
    assert store.saved[0]["profile"]["enrichment_state"] == "complete"

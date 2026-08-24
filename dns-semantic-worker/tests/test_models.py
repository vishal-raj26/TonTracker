import json
import pytest

from dns_semantic_worker.config import Settings
from dns_semantic_worker.models import (
    ModelProtocolError,
    OpenAIEmbeddingAdapter,
    QwenClassifier,
)
from dns_semantic_worker.schema import SCHEMA_VERSION


class FakeClient:
    def __init__(self, response):
        self.response = response
        self.calls = []

    def post(self, url, payload, api_key=None):
        self.calls.append((url, payload, api_key))
        return self.response


def settings():
    return Settings(
        database_url="postgresql://test",
        worker_id="test",
        job_type="dns-semantic",
        batch_size=10,
        poll_seconds=1,
        lease_seconds=300,
        retry_base_seconds=1,
        retry_max_seconds=30,
        profile_version="semantic-v1",
        schema_version=SCHEMA_VERSION,
        dictionary_version="dictionary-v1",
        embedding_provider="http",
        embedding_endpoint="https://embed.test/v1/embeddings",
        embedding_api_key="secret",
        embedding_model="BAAI/bge-m3",
        embedding_model_version="bge-m3-v1",
        embedding_batch_size=32,
        embedding_requests_per_second=10,
        embedding_timeout_seconds=2,
        local_embedding_device="cpu",
        vector_upsert_endpoint=None,
        vector_database_url=None,
        vector_api_key=None,
        vector_namespace="dns",
        vector_store_name="vector",
        vector_dimensions=3,
        vector_timeout_seconds=2,
        qwen_endpoint="https://qwen.test/v1/chat/completions",
        qwen_api_key="secret",
        qwen_model="Qwen/Qwen3-8B",
        qwen_model_version="qwen3-8b-v1",
        qwen_requests_per_second=10,
        qwen_timeout_seconds=2,
        qwen_confidence_threshold=0.68,
        qwen_high_impact_gram=500,
        qwen_response_format="json_schema",
        log_level="INFO",
        run_once=True,
    )


def valid_qwen_payload():
    return {
        "schema_version": SCHEMA_VERSION,
        "language": "en",
        "script": "Latin",
        "semantic_categories": ["space"],
        "entity_type": "concept",
        "canonical_entity": None,
        "dictionary_meanings": [],
        "abbreviation_expansions": [],
        "ton_relevance": 0.0,
        "telegram_relevance": 0.0,
        "crypto_relevance": 0.0,
        "memorability_score": 0.8,
        "brandability_score": 0.8,
        "commercial_intent_score": 0.4,
        "invented_word_probability": 0.1,
        "semantic_confidence": 0.9,
        "ambiguity_reason": None,
    }


def test_embedding_adapter_batches_and_orders_vectors():
    client = FakeClient(
        {"data": [{"index": 1, "embedding": [0, 1, 0]}, {"index": 0, "embedding": [1, 0, 0]}]}
    )
    adapter = OpenAIEmbeddingAdapter(settings(), client)
    assert adapter.embed(["one", "two"]) == [[1.0, 0.0, 0.0], [0.0, 1.0, 0.0]]
    assert client.calls[0][1]["input"] == ["one", "two"]


def test_qwen_uses_strict_schema_and_rejects_price():
    payload = valid_qwen_payload()
    payload["price"] = 100
    client = FakeClient({"choices": [{"message": {"content": json.dumps(payload)}}]})
    classifier = QwenClassifier(settings(), client)
    with pytest.raises(ModelProtocolError):
        classifier.classify(
            domain_normalized="space.ton",
            deterministic_profile={},
            structural_features={},
        )
    sent = client.calls[0][1]
    assert sent["response_format"]["type"] == "json_schema"
    assert "price" not in sent["response_format"]["json_schema"]["schema"]["properties"]


def test_qwen_accepts_schema_compliant_response():
    client = FakeClient(
        {"choices": [{"message": {"content": json.dumps(valid_qwen_payload())}}]}
    )
    result = QwenClassifier(settings(), client).classify(
        domain_normalized="space.ton",
        deterministic_profile={},
        structural_features={},
    )
    assert result.semantic_categories == ["space"]

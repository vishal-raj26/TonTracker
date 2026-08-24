import pytest
from pydantic import ValidationError

from dns_semantic_worker.schema import QwenClassificationV1, SCHEMA_VERSION, qwen_json_schema
from dns_semantic_worker.config import Settings


def valid_payload():
    return {
        "schema_version": SCHEMA_VERSION,
        "language": "en",
        "script": "Latin",
        "semantic_categories": ["crypto", "community"],
        "entity_type": "concept",
        "canonical_entity": None,
        "dictionary_meanings": [],
        "abbreviation_expansions": [],
        "ton_relevance": 0.7,
        "telegram_relevance": 0.2,
        "crypto_relevance": 0.9,
        "memorability_score": 0.8,
        "brandability_score": 0.65,
        "commercial_intent_score": 0.3,
        "invented_word_probability": 0.1,
        "semantic_confidence": 0.83,
        "ambiguity_reason": None,
    }


def test_strict_schema_rejects_price_and_unknown_fields():
    payload = valid_payload()
    payload["price_gram"] = 999
    with pytest.raises(ValidationError):
        QwenClassificationV1.model_validate(payload)


def test_schema_rejects_unbounded_scores_and_bad_categories():
    payload = valid_payload()
    payload["brandability_score"] = 3.0
    with pytest.raises(ValidationError):
        QwenClassificationV1.model_validate(payload)


def test_runtime_rejects_an_unknown_semantic_schema_version(monkeypatch):
    monkeypatch.setenv("DNS_DATABASE_URL", "postgresql://test")
    monkeypatch.setenv("DNS_SEMANTIC_SCHEMA_VERSION", "semantic-profile-v2")
    with pytest.raises(ValueError, match="DNS_SEMANTIC_SCHEMA_VERSION"):
        Settings.from_env()


def test_qwen_json_schema_requires_every_declared_property():
    schema = qwen_json_schema()
    assert set(schema["required"]) == set(schema["properties"])
    for definition in schema.get("$defs", {}).values():
        if definition.get("type") == "object":
            assert set(definition["required"]) == set(definition["properties"])
            assert definition["additionalProperties"] is False
    payload = valid_payload()
    payload["semantic_categories"] = ["bad category!"]
    with pytest.raises(ValidationError):
        QwenClassificationV1.model_validate(payload)

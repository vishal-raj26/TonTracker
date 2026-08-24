"""Strict, versioned semantic profile contracts.

No schema in this module contains a price field. Extra model output is rejected.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

SCHEMA_VERSION = "tontrack.dns.semantic-profile.v1"


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class MeaningV1(StrictModel):
    term: str = Field(min_length=1, max_length=128)
    meaning: str = Field(min_length=1, max_length=500)
    language: str = Field(pattern=r"^[a-z]{2,3}(?:-[A-Z]{2})?$", max_length=8)
    part_of_speech: str | None = Field(max_length=40)
    confidence: float = Field(ge=0, le=1)
    source: Literal["builtin", "dictionary", "entity", "qwen"]


class AbbreviationV1(StrictModel):
    token: str = Field(min_length=1, max_length=64)
    expansion: str = Field(min_length=1, max_length=250)
    confidence: float = Field(ge=0, le=1)
    source: Literal["builtin", "dictionary", "entity", "qwen"]


class QwenClassificationV1(StrictModel):
    schema_version: Literal[SCHEMA_VERSION]
    language: str = Field(pattern=r"^[a-z]{2,3}(?:-[A-Z]{2})?$", max_length=8)
    script: str = Field(min_length=1, max_length=40)
    semantic_categories: list[str] = Field(max_length=12)
    entity_type: Literal[
        "person",
        "place",
        "organization",
        "brand",
        "product",
        "event",
        "concept",
        "none",
    ]
    canonical_entity: str | None = Field(max_length=200)
    dictionary_meanings: list[MeaningV1] = Field(max_length=8)
    abbreviation_expansions: list[AbbreviationV1] = Field(max_length=8)
    ton_relevance: float = Field(ge=0, le=1)
    telegram_relevance: float = Field(ge=0, le=1)
    crypto_relevance: float = Field(ge=0, le=1)
    memorability_score: float = Field(ge=0, le=1)
    brandability_score: float = Field(ge=0, le=1)
    commercial_intent_score: float = Field(ge=0, le=1)
    invented_word_probability: float = Field(ge=0, le=1)
    semantic_confidence: float = Field(ge=0, le=1)
    ambiguity_reason: str | None = Field(max_length=300)

    @field_validator("semantic_categories")
    @classmethod
    def normalize_categories(cls, values: list[str]) -> list[str]:
        normalized: list[str] = []
        for value in values:
            category = value.strip().lower().replace(" ", "-")
            if not category or len(category) > 48 or not all(
                char.isalnum() or char in {"-", "_"} for char in category
            ):
                raise ValueError(f"invalid semantic category: {value!r}")
            if category not in normalized:
                normalized.append(category)
        return normalized


class SemanticProfileV1(QwenClassificationV1):
    enrichment_state: Literal["deterministic", "complete", "deferred"]
    provenance: dict[str, object]


def qwen_json_schema() -> dict[str, object]:
    """Return the exact response schema sent to compatible chat endpoints."""

    return QwenClassificationV1.model_json_schema()

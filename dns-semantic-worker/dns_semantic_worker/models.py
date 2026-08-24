"""Optional BGE-M3 and selective Qwen adapters."""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from typing import Any, Protocol, Sequence

import psycopg
from pydantic import ValidationError

from .config import Settings
from .http_client import JsonHttpClient
from .schema import QwenClassificationV1, SCHEMA_VERSION, qwen_json_schema


class ModelProtocolError(RuntimeError):
    pass


class EmbeddingAdapter(Protocol):
    model_name: str
    model_version: str

    def embed(self, texts: Sequence[str]) -> list[list[float]]: ...


class DisabledEmbeddingAdapter:
    model_name = "disabled"
    model_version = "disabled"

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        return []


class OpenAIEmbeddingAdapter:
    def __init__(self, settings: Settings, client: JsonHttpClient | None = None) -> None:
        if not settings.embedding_endpoint:
            raise ValueError("embedding endpoint is required")
        self.endpoint = settings.embedding_endpoint
        self.api_key = settings.embedding_api_key
        self.model_name = settings.embedding_model
        self.model_version = settings.embedding_model_version
        self.client = client or JsonHttpClient(
            timeout_seconds=settings.embedding_timeout_seconds,
            requests_per_second=settings.embedding_requests_per_second,
        )

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        if not texts:
            return []
        response = self.client.post(
            self.endpoint,
            {"model": self.model_name, "input": list(texts), "encoding_format": "float"},
            self.api_key,
        )
        rows = response.get("data")
        if not isinstance(rows, list):
            raise ModelProtocolError("embedding response is missing data[]")
        ordered = sorted(rows, key=lambda item: item.get("index", 0))
        vectors: list[list[float]] = []
        for row in ordered:
            raw = row.get("embedding") if isinstance(row, dict) else None
            if not isinstance(raw, list) or not raw:
                raise ModelProtocolError("embedding response contains an invalid vector")
            if not all(isinstance(value, (int, float)) for value in raw):
                raise ModelProtocolError("embedding vector must contain only numbers")
            vectors.append([float(value) for value in raw])
        if len(vectors) != len(texts):
            raise ModelProtocolError("embedding response count does not match input count")
        dimensions = len(vectors[0])
        if dimensions <= 0 or any(len(vector) != dimensions for vector in vectors):
            raise ModelProtocolError("embedding vectors have inconsistent dimensions")
        return vectors


class LocalSentenceTransformersAdapter:
    def __init__(self, settings: Settings) -> None:
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError as exc:
            raise RuntimeError(
                "Install requirements-local.txt to use DNS_EMBEDDING_PROVIDER=local"
            ) from exc
        self.model_name = settings.embedding_model
        self.model_version = settings.embedding_model_version
        self._model = SentenceTransformer(
            self.model_name, device=settings.local_embedding_device, trust_remote_code=False
        )

    def embed(self, texts: Sequence[str]) -> list[list[float]]:
        if not texts:
            return []
        vectors = self._model.encode(
            list(texts),
            normalize_embeddings=True,
            show_progress_bar=False,
            convert_to_numpy=True,
        )
        return [[float(value) for value in row] for row in vectors]


def build_embedding_adapter(settings: Settings) -> EmbeddingAdapter:
    if settings.embedding_provider == "http":
        return OpenAIEmbeddingAdapter(settings)
    if settings.embedding_provider == "local":
        return LocalSentenceTransformersAdapter(settings)
    return DisabledEmbeddingAdapter()


@dataclass(frozen=True)
class EmbeddingRecord:
    external_record_id: str
    dimensions: int
    content_hash: str
    metadata: dict[str, Any]


class VectorStore(Protocol):
    external_store: str

    @property
    def enabled(self) -> bool: ...

    def upsert(
        self,
        *,
        nft_address: str,
        domain_normalized: str,
        vector: list[float],
        model_name: str,
        model_version: str,
        content_hash: str,
    ) -> EmbeddingRecord: ...


class DisabledVectorStore:
    external_store = "disabled"

    @property
    def enabled(self) -> bool:
        return False

    def upsert(self, **_: Any) -> EmbeddingRecord:
        raise RuntimeError("vector store is not configured")


class HttpVectorStore:
    def __init__(self, settings: Settings, client: JsonHttpClient | None = None) -> None:
        self.endpoint = settings.vector_upsert_endpoint
        self.api_key = settings.vector_api_key
        self.namespace = settings.vector_namespace
        self.external_store = settings.vector_store_name
        self.client = client or JsonHttpClient(
            timeout_seconds=settings.vector_timeout_seconds,
            requests_per_second=max(settings.embedding_requests_per_second, 0.1),
        )

    @property
    def enabled(self) -> bool:
        return bool(self.endpoint)

    def upsert(
        self,
        *,
        nft_address: str,
        domain_normalized: str,
        vector: list[float],
        model_name: str,
        model_version: str,
        content_hash: str,
    ) -> EmbeddingRecord:
        if not self.endpoint:
            raise RuntimeError("vector upsert endpoint is not configured")
        record_id = hashlib.sha256(
            f"{nft_address}|{model_name}|{model_version}".encode("utf-8")
        ).hexdigest()
        payload = {
            "namespace": self.namespace,
            "records": [
                {
                    "id": record_id,
                    "values": vector,
                    "metadata": {
                        "nft_address": nft_address,
                        "domain_normalized": domain_normalized,
                        "model": model_name,
                        "model_version": model_version,
                        "content_hash": content_hash,
                    },
                }
            ],
        }
        self.client.post(self.endpoint, payload, self.api_key)
        return EmbeddingRecord(
            external_record_id=record_id,
            dimensions=len(vector),
            content_hash=content_hash,
            metadata={"namespace": self.namespace, "domain_normalized": domain_normalized},
        )


class PgVectorStore:
    def __init__(self, settings: Settings) -> None:
        if not settings.vector_database_url:
            raise ValueError("vector database URL is required")
        self.database_url = settings.vector_database_url
        self.dimensions = settings.vector_dimensions
        self.external_store = settings.vector_store_name

    @property
    def enabled(self) -> bool:
        return True

    def upsert(
        self,
        *,
        nft_address: str,
        domain_normalized: str,
        vector: list[float],
        model_name: str,
        model_version: str,
        content_hash: str,
    ) -> EmbeddingRecord:
        if len(vector) != self.dimensions:
            raise ModelProtocolError(
                f"expected {self.dimensions} embedding dimensions, received {len(vector)}"
            )
        record_id = hashlib.sha256(
            f"{nft_address}|{model_name}|{model_version}".encode("utf-8")
        ).hexdigest()
        vector_literal = "[" + ",".join(format(value, ".9g") for value in vector) + "]"
        with psycopg.connect(self.database_url) as conn, conn.transaction():
            conn.execute(
                """
                INSERT INTO dns_embeddings (
                  record_id, nft_address, domain_normalized, model_name,
                  model_version, content_hash, embedding, generated_at, updated_at
                ) VALUES (%s, %s, %s, %s, %s, %s, %s::vector, NOW(), NOW())
                ON CONFLICT (nft_address, model_name, model_version) DO UPDATE SET
                  record_id = EXCLUDED.record_id,
                  domain_normalized = EXCLUDED.domain_normalized,
                  content_hash = EXCLUDED.content_hash,
                  embedding = EXCLUDED.embedding,
                  generated_at = NOW(), updated_at = NOW()
                """,
                (
                    record_id,
                    nft_address,
                    domain_normalized,
                    model_name,
                    model_version,
                    content_hash,
                    vector_literal,
                ),
            )
        return EmbeddingRecord(
            external_record_id=record_id,
            dimensions=len(vector),
            content_hash=content_hash,
            metadata={"domain_normalized": domain_normalized},
        )


def build_vector_store(settings: Settings) -> VectorStore:
    if settings.vector_database_url:
        return PgVectorStore(settings)
    if settings.vector_upsert_endpoint:
        return HttpVectorStore(settings)
    return DisabledVectorStore()


class QwenClassifier:
    SYSTEM_PROMPT = """You classify TON DNS labels for comparable retrieval.
Return only JSON matching the supplied schema. Analyze language, meaning, entity,
categories, TON/Telegram/crypto relevance, memorability, brandability, commercial
intent, invented-word probability, and confidence. Never estimate, mention, or
output price, value, floor, bid, ask, sale amount, GRAM, TON, or USD."""

    def __init__(self, settings: Settings, client: JsonHttpClient | None = None) -> None:
        self.endpoint = settings.qwen_endpoint
        self.api_key = settings.qwen_api_key
        self.model_name = settings.qwen_model
        self.model_version = settings.qwen_model_version
        self.response_format = settings.qwen_response_format
        self.client = client or JsonHttpClient(
            timeout_seconds=settings.qwen_timeout_seconds,
            requests_per_second=settings.qwen_requests_per_second,
        )

    @property
    def enabled(self) -> bool:
        return bool(self.endpoint)

    def classify(
        self,
        *,
        domain_normalized: str,
        deterministic_profile: dict[str, Any],
        structural_features: dict[str, Any],
    ) -> QwenClassificationV1:
        if not self.endpoint:
            raise RuntimeError("Qwen endpoint is not configured")
        payload: dict[str, Any] = {
            "model": self.model_name,
            "temperature": 0,
            "messages": [
                {"role": "system", "content": self.SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": json.dumps(
                        {
                            "domain": domain_normalized,
                            "deterministic_profile": deterministic_profile,
                            "structural_features": structural_features,
                        },
                        ensure_ascii=False,
                    ),
                },
            ],
        }
        if self.response_format == "json_schema":
            payload["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": "ton_dns_semantic_profile_v1",
                    "strict": True,
                    "schema": qwen_json_schema(),
                },
            }
        elif self.response_format == "json_object":
            payload["response_format"] = {"type": "json_object"}
        response = self.client.post(self.endpoint, payload, self.api_key)
        try:
            content = response["choices"][0]["message"]["content"]
        except (KeyError, IndexError, TypeError) as exc:
            raise ModelProtocolError("chat response is missing choices[0].message.content") from exc
        if isinstance(content, list):
            content = "".join(
                str(part.get("text", "")) for part in content if isinstance(part, dict)
            )
        try:
            parsed = json.loads(str(content))
            classification = QwenClassificationV1.model_validate(parsed)
        except (json.JSONDecodeError, ValidationError) as exc:
            raise ModelProtocolError(f"Qwen response failed strict schema validation: {exc}") from exc
        if classification.schema_version != SCHEMA_VERSION:
            raise ModelProtocolError("Qwen returned an unsupported schema version")
        return classification

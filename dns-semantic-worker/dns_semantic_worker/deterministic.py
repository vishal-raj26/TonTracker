"""Deterministic dictionary/entity enrichment that always remains available."""

from __future__ import annotations

import math
import re
import unicodedata
from dataclasses import dataclass
from typing import Any, Iterable

from .schema import AbbreviationV1, MeaningV1, SCHEMA_VERSION, SemanticProfileV1

TOKEN_RE = re.compile(r"[\w]+", re.UNICODE)
VOWELS = frozenset("aeiouy")
ENTITY_TYPES = frozenset(
    {"person", "place", "organization", "brand", "product", "event", "concept"}
)

BUILTIN_TERMS: dict[str, dict[str, Any]] = {
    "ton": {
        "meaning": "The Open Network ecosystem",
        "categories": ["ton", "blockchain", "crypto"],
        "entity_type": "organization",
        "canonical_entity": "The Open Network",
        "ton": 1.0,
        "crypto": 1.0,
    },
    "telegram": {
        "meaning": "Telegram messaging platform",
        "categories": ["telegram", "technology", "social"],
        "entity_type": "brand",
        "canonical_entity": "Telegram",
        "telegram": 1.0,
        "crypto": 0.35,
    },
    "gram": {
        "meaning": "Native-currency terminology associated with TON",
        "categories": ["ton", "crypto", "currency"],
        "ton": 0.95,
        "telegram": 0.65,
        "crypto": 0.95,
    },
    "nft": {
        "meaning": "Non-fungible token",
        "categories": ["nft", "crypto", "collectibles"],
        "crypto": 1.0,
        "abbreviation": "non-fungible token",
    },
    "defi": {
        "meaning": "Decentralized finance",
        "categories": ["finance", "crypto", "defi"],
        "crypto": 1.0,
        "commercial": 0.75,
        "abbreviation": "decentralized finance",
    },
    "dao": {
        "meaning": "Decentralized autonomous organization",
        "categories": ["organization", "crypto", "dao"],
        "crypto": 0.95,
        "abbreviation": "decentralized autonomous organization",
    },
    "wagmi": {
        "meaning": "Crypto-community slang: We're All Gonna Make It",
        "categories": ["crypto", "slang", "community"],
        "crypto": 0.95,
        "abbreviation": "we're all gonna make it",
    },
    "bitcoin": {
        "meaning": "Bitcoin protocol and asset",
        "categories": ["crypto", "currency", "blockchain"],
        "entity_type": "brand",
        "canonical_entity": "Bitcoin",
        "crypto": 1.0,
    },
    "ethereum": {
        "meaning": "Ethereum blockchain ecosystem",
        "categories": ["crypto", "blockchain", "technology"],
        "entity_type": "brand",
        "canonical_entity": "Ethereum",
        "crypto": 1.0,
    },
    "notcoin": {
        "meaning": "TON ecosystem game and token",
        "categories": ["ton", "gaming", "crypto"],
        "entity_type": "brand",
        "canonical_entity": "Notcoin",
        "ton": 0.95,
        "telegram": 0.85,
        "crypto": 0.9,
    },
    "wallet": {
        "meaning": "A wallet for holding or transacting assets",
        "categories": ["finance", "crypto", "utility"],
        "commercial": 0.7,
        "crypto": 0.65,
    },
    "market": {
        "meaning": "A place or service for commerce",
        "categories": ["commerce", "finance"],
        "commercial": 0.9,
    },
    "shop": {
        "meaning": "A retail or commerce destination",
        "categories": ["commerce", "retail"],
        "commercial": 0.95,
    },
    "pay": {
        "meaning": "Payment action or payment service",
        "categories": ["payments", "finance"],
        "commercial": 0.95,
    },
    "bank": {
        "meaning": "Financial institution or banking service",
        "categories": ["banking", "finance"],
        "commercial": 1.0,
    },
    "game": {
        "meaning": "Game or interactive entertainment",
        "categories": ["gaming", "entertainment"],
        "commercial": 0.65,
    },
    "news": {
        "meaning": "News and current-information service",
        "categories": ["media", "publishing"],
        "commercial": 0.6,
    },
}


@dataclass(frozen=True)
class DeterministicResult:
    profile: SemanticProfileV1
    embedding_text: str
    ambiguous: bool
    conflict_reasons: tuple[str, ...]


def normalize_label(domain_or_label: str) -> str:
    normalized = unicodedata.normalize("NFKC", domain_or_label.strip()).casefold()
    if normalized.endswith(".ton"):
        normalized = normalized[:-4]
    return normalized.strip(". ")


def detect_script(text: str) -> str:
    scripts: set[str] = set()
    for char in text:
        if not char.isalpha():
            continue
        name = unicodedata.name(char, "")
        for script in ("LATIN", "CYRILLIC", "ARABIC", "HEBREW", "GREEK", "CJK", "HIRAGANA", "KATAKANA", "HANGUL", "DEVANAGARI"):
            if script in name:
                scripts.add(script.title())
                break
        else:
            scripts.add("Other")
    if not scripts:
        return "Numeric" if any(char.isdigit() for char in text) else "Unknown"
    return next(iter(scripts)) if len(scripts) == 1 else "Mixed"


def tokenize(label: str) -> list[str]:
    return [token for token in TOKEN_RE.findall(label.replace("-", "_")) if token]


def _dictionary_row(entry: dict[str, Any]) -> dict[str, Any]:
    raw = entry.get("meaning_json")
    if isinstance(raw, dict):
        result = dict(raw)
    else:
        result = {}
    result.setdefault("term", entry.get("term_normalized"))
    result.setdefault("language", entry.get("language") or "und")
    result.setdefault("categories", entry.get("semantic_categories") or [])
    result.setdefault("confidence", entry.get("confidence", 0.7))
    provenance = entry.get("provenance_json")
    if isinstance(provenance, dict):
        result = {**provenance, **result}
    result.setdefault("source", "dictionary")
    return result


def _unit_float(value: Any, default: float = 0.0) -> float:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(number):
        return default
    return max(0.0, min(1.0, number))


def _valid_category(value: Any) -> str | None:
    category = str(value).strip().lower().replace(" ", "-")
    if not category or len(category) > 48:
        return None
    if not all(char.isalnum() or char in {"-", "_"} for char in category):
        return None
    return category


def _pronounceability(label: str) -> float:
    letters = [char for char in label if char.isascii() and char.isalpha()]
    if not letters:
        return 0.25
    vowel_ratio = sum(char in VOWELS for char in letters) / len(letters)
    long_consonant_run = bool(re.search(r"[^aeiouy\W]{5,}", "".join(letters)))
    score = 1.0 - min(abs(vowel_ratio - 0.38) * 1.6, 0.65)
    if long_consonant_run:
        score -= 0.25
    return max(0.05, min(0.95, score))


def _memorability(label: str, known_count: int) -> float:
    length_score = max(0.1, 1.0 - max(len(label) - 4, 0) * 0.055)
    repeated = 0.1 if re.search(r"(.)\1", label) else 0.0
    known = min(0.2, known_count * 0.08)
    return max(0.05, min(0.95, length_score + repeated + known))


def build_deterministic_profile(
    domain_or_label: str,
    dictionary_entries: Iterable[dict[str, Any]] = (),
    structural_features: dict[str, Any] | None = None,
    profile_version: str = "semantic-v1",
    dictionary_version: str = "dictionary-v1",
) -> DeterministicResult:
    label = normalize_label(domain_or_label)
    if not label:
        raise ValueError("domain label cannot be empty")
    tokens = tokenize(label) or [label]
    script = detect_script(label)
    language = "en" if script == "Latin" else "und"
    evidence: list[dict[str, Any]] = []
    for token in dict.fromkeys([label, *tokens]):
        builtin = BUILTIN_TERMS.get(token)
        if builtin:
            evidence.append({"term": token, "confidence": 0.98, "source": "builtin", **builtin})
    evidence.extend(_dictionary_row(entry) for entry in dictionary_entries)

    categories: list[str] = []
    meanings: list[MeaningV1] = []
    abbreviations: list[AbbreviationV1] = []
    entities: list[tuple[str, str, float]] = []
    ton = telegram = crypto = commercial = 0.0
    valid_evidence: list[tuple[dict[str, Any], float]] = []
    skipped_evidence_count = 0
    skipped_field_count = 0
    for item in evidence:
        raw_confidence = item.get("confidence", 0.7)
        try:
            confidence_number = float(raw_confidence)
        except (TypeError, ValueError):
            skipped_evidence_count += 1
            continue
        if not math.isfinite(confidence_number) or not 0 <= confidence_number <= 1:
            skipped_evidence_count += 1
            continue
        confidence = confidence_number
        term = str(item.get("term") or label)
        meaning = str(item.get("meaning") or item.get("definition") or "Known term")
        source = str(item.get("source") or "dictionary")
        if source not in {"builtin", "dictionary", "entity", "qwen"}:
            source = "dictionary"
        try:
            validated_meaning = MeaningV1(
                term=term,
                meaning=meaning[:500],
                language=str(item.get("language") or language),
                part_of_speech=(str(item["part_of_speech"])[:40] if item.get("part_of_speech") else None),
                confidence=confidence,
                source=source,
            )
        except (TypeError, ValueError):
            skipped_evidence_count += 1
            continue
        meanings.append(validated_meaning)
        valid_evidence.append((item, confidence))
        raw_categories = item.get("categories", [])
        if not isinstance(raw_categories, (list, tuple, set)):
            raw_categories = []
            skipped_field_count += 1
        for category in raw_categories:
            normalized = _valid_category(category)
            if normalized and normalized not in categories:
                categories.append(normalized)
            elif normalized is None:
                skipped_field_count += 1
        expansion = item.get("abbreviation") or item.get("expansion")
        if expansion:
            try:
                abbreviation = AbbreviationV1(
                    token=term,
                    expansion=str(expansion)[:250],
                    confidence=confidence,
                    source=source,
                )
            except (TypeError, ValueError):
                skipped_field_count += 1
            else:
                abbreviations.append(abbreviation)
        entity_type = str(item.get("entity_type") or "").strip().lower()
        canonical = str(item.get("canonical_entity") or "").strip()
        if entity_type in ENTITY_TYPES and canonical:
            entities.append((entity_type, canonical[:200], confidence))
        elif entity_type or canonical:
            skipped_field_count += 1
        ton = max(ton, _unit_float(item.get("ton", item.get("ton_relevance", 0.0))))
        telegram = max(
            telegram,
            _unit_float(item.get("telegram", item.get("telegram_relevance", 0.0))),
        )
        crypto = max(
            crypto, _unit_float(item.get("crypto", item.get("crypto_relevance", 0.0)))
        )
        commercial = max(
            commercial,
            _unit_float(
                item.get("commercial", item.get("commercial_intent_score", 0.0))
            ),
        )

    entities.sort(key=lambda item: item[2], reverse=True)
    entity_types = {item[0] for item in entities}
    conflict_reasons: list[str] = []
    if len(entity_types) > 1:
        conflict_reasons.append("conflicting-entity-types")
    if script == "Mixed":
        conflict_reasons.append("mixed-script")
    known_count = len(valid_evidence)
    numeric = label.isdigit()
    short_acronym = label.isascii() and label.isalpha() and len(label) <= 4
    if numeric:
        categories.insert(0, "numeric")
    elif short_acronym and not valid_evidence:
        categories.insert(0, "acronym-candidate")
        conflict_reasons.append("unresolved-short-name")
    elif not valid_evidence:
        categories.append("invented-or-unknown")

    confidence = 0.3
    if valid_evidence:
        strongest_evidence = max(confidence for _, confidence in valid_evidence)
        confidence = min(
            0.96,
            max(
                0.52 + 0.1 * min(known_count, 4),
                strongest_evidence * 0.9,
            ),
        )
    if numeric:
        confidence = max(confidence, 0.88)
    if conflict_reasons:
        confidence = min(confidence, 0.56)
    if script not in {"Latin", "Numeric"} and not valid_evidence:
        confidence = min(confidence, 0.32)

    pronounceability = _pronounceability(label)
    memorability = _memorability(label, known_count)
    structural = structural_features or {}
    if structural.get("pronounceability_score") is not None:
        pronounceability = _unit_float(
            structural["pronounceability_score"], pronounceability
        )
    invented = 0.08 if valid_evidence else (0.1 if numeric else 0.78)
    brandability = min(0.9, 0.35 * pronounceability + 0.45 * memorability + 0.2 * commercial)
    selected_entity = entities[0] if entities else None
    ambiguous = bool(conflict_reasons) or confidence < 0.68
    embedding_text = " | ".join(
        part
        for part in [
            f"{label}.ton",
            "tokens: " + ", ".join(tokens),
            "categories: " + ", ".join(categories),
            "meanings: " + "; ".join(item.meaning for item in meanings[:4]),
            f"script: {script}",
        ]
        if not part.endswith(": ")
    )
    state = "deterministic" if not ambiguous else "deferred"
    profile = SemanticProfileV1(
        schema_version=SCHEMA_VERSION,
        language=language,
        script=script,
        semantic_categories=categories[:12],
        entity_type=(selected_entity[0] if selected_entity else "none"),
        canonical_entity=(selected_entity[1] if selected_entity else None),
        dictionary_meanings=meanings[:8],
        abbreviation_expansions=abbreviations[:8],
        ton_relevance=max(0.0, min(1.0, ton)),
        telegram_relevance=max(0.0, min(1.0, telegram)),
        crypto_relevance=max(0.0, min(1.0, crypto)),
        memorability_score=memorability,
        brandability_score=brandability,
        commercial_intent_score=max(0.0, min(1.0, commercial)),
        invented_word_probability=invented,
        semantic_confidence=confidence,
        ambiguity_reason=(", ".join(conflict_reasons) if conflict_reasons else None),
        enrichment_state=state,
        provenance={
            "deterministic": True,
            "dictionary_version": dictionary_version,
            "profile_version": profile_version,
            "evidence_count": known_count,
            "skipped_evidence_count": skipped_evidence_count,
            "skipped_field_count": skipped_field_count,
            "tokens": tokens,
            "conflict_reasons": conflict_reasons,
            "pronounceability_score": pronounceability,
        },
    )
    return DeterministicResult(
        profile=profile,
        embedding_text=embedding_text,
        ambiguous=ambiguous,
        conflict_reasons=tuple(conflict_reasons),
    )

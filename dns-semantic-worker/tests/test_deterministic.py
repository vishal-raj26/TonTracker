from dns_semantic_worker.deterministic import build_deterministic_profile


def test_numeric_domain_is_confident_without_models():
    result = build_deterministic_profile("1662.ton")
    assert result.profile.semantic_categories[0] == "numeric"
    assert result.profile.semantic_confidence >= 0.8
    assert result.profile.enrichment_state == "deterministic"
    assert result.ambiguous is False


def test_known_ecosystem_term_uses_dictionary_first():
    result = build_deterministic_profile("wagmi.ton")
    assert "crypto" in result.profile.semantic_categories
    assert result.profile.crypto_relevance >= 0.9
    assert result.profile.dictionary_meanings[0].source == "builtin"


def test_db_dictionary_shape_is_understood():
    result = build_deterministic_profile(
        "supernova.ton",
        [
            {
                "term_normalized": "supernova",
                "language": "en",
                "meaning_json": {"meaning": "An exploding star", "part_of_speech": "noun"},
                "semantic_categories": ["space", "science"],
                "confidence": 0.92,
                "provenance_json": {"source": "dictionary"},
            }
        ],
    )
    assert result.profile.dictionary_meanings[0].meaning == "An exploding star"
    assert result.profile.semantic_categories == ["space", "science"]
    assert result.profile.enrichment_state == "deterministic"


def test_unknown_short_name_is_deferred_but_valid():
    result = build_deterministic_profile("qxz.ton")
    assert result.profile.enrichment_state == "deferred"
    assert result.profile.semantic_confidence < 0.68
    assert "acronym-candidate" in result.profile.semantic_categories


def test_malformed_dictionary_evidence_is_isolated():
    result = build_deterministic_profile(
        "supernova.ton",
        [
            {
                "term_normalized": "supernova",
                "language": "invalid-language",
                "meaning_json": {"meaning": "Broken row"},
                "semantic_categories": ["invalid/category"],
                "confidence": "not-a-number",
            },
            {
                "term_normalized": "supernova",
                "language": "en",
                "meaning_json": {
                    "meaning": "An exploding star",
                    "ton_relevance": "not-a-number",
                },
                "semantic_categories": ["space", "invalid/category"],
                "confidence": 0.92,
            },
        ],
    )

    assert result.profile.enrichment_state == "deterministic"
    assert result.profile.dictionary_meanings[0].meaning == "An exploding star"
    assert result.profile.semantic_categories == ["space"]
    assert result.profile.ton_relevance == 0
    assert result.profile.provenance["evidence_count"] == 1
    assert result.profile.provenance["skipped_evidence_count"] == 1
    assert result.profile.provenance["skipped_field_count"] == 1

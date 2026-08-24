import json
from contextlib import contextmanager, nullcontext

from dns_semantic_worker.deterministic import build_deterministic_profile
from dns_semantic_worker.store import (
    SemanticJob,
    SemanticStore,
    material_profile_signature,
)


class FakeResult:
    def __init__(self, *, row=None, rows=None, rowcount=1):
        self.row = row
        self.rows = rows if rows is not None else ([] if row is None else [row])
        self.rowcount = rowcount

    def fetchone(self):
        return self.row

    def fetchall(self):
        return self.rows


class FakeConnection:
    def __init__(self, *, profile=None, reference=None, claim_rows=None):
        self.profile = profile
        self.reference = reference
        self.claim_rows = claim_rows or []
        self.calls = []

    def transaction(self):
        return nullcontext()

    def execute(self, sql, params=None):
        normalized = " ".join(sql.split())
        self.calls.append((normalized, params))
        if normalized.startswith("WITH candidates AS"):
            return FakeResult(rows=self.claim_rows)
        if "FROM dns_semantic_profiles" in normalized and "FOR UPDATE" in normalized:
            return FakeResult(row=self.profile)
        if "FROM dns_semantic_references" in normalized and "FOR UPDATE" in normalized:
            return FakeResult(row=self.reference)
        return FakeResult(rowcount=1)


class FakeDatabaseStore(SemanticStore):
    def __init__(self, conn):
        super().__init__("postgresql://mock")
        self.conn = conn

    @contextmanager
    def connection(self):
        yield self.conn


def job():
    return SemanticJob(
        id=17,
        nft_address="0:canonical",
        domain_normalized="1662.ton",
        label_normalized="1662",
        priority=40,
        payload={"nftAddress": "payload-address", "domain": "wrong.ton"},
        attempts=1,
        max_attempts=5,
        structural_features={},
        market_signal_gram=0,
    )


def profile():
    value = build_deterministic_profile("1662.ton").profile.model_dump(mode="json")
    value["provenance"] = {
        **value["provenance"],
        "enrichment_state": value["enrichment_state"],
        "warnings": [],
    }
    return value


def persisted_profile(value):
    return {
        "profile_version": "semantic-v1",
        "language": value["language"],
        "script": value["script"],
        "semantic_categories": list(value["semantic_categories"]),
        "entity_type": value["entity_type"],
        "canonical_entity": value["canonical_entity"],
        "dictionary_meanings_json": list(value["dictionary_meanings"]),
        "abbreviation_expansions_json": list(value["abbreviation_expansions"]),
        "ton_relevance": value["ton_relevance"],
        "telegram_relevance": value["telegram_relevance"],
        "crypto_relevance": value["crypto_relevance"],
        "memorability_score": value["memorability_score"],
        "brandability_score": value["brandability_score"],
        "commercial_intent_score": value["commercial_intent_score"],
        "invented_word_probability": value["invented_word_probability"],
        "semantic_confidence": value["semantic_confidence"],
        "provenance_json": dict(value["provenance"]),
        "model_name": "deterministic",
        "model_version": "dictionary-v1",
        "schema_version": value["schema_version"],
    }


def save(store, value):
    return store.save_success(
        job=job(),
        worker_id="worker-1",
        profile_version="semantic-v1",
        profile=value,
        model_name="deterministic",
        model_version="dictionary-v1",
        embedding_reference=None,
        result={"enrichment_state": value["enrichment_state"]},
    )


def test_claim_uses_canonical_domain_identity_instead_of_payload_values():
    conn = FakeConnection(
        claim_rows=[
            {
                "id": 17,
                "priority": 40,
                "payload_json": {"nftAddress": "payload-address", "domain": "wrong.ton"},
                "attempts": 1,
                "max_attempts": 5,
                "nft_address": "0:canonical",
                "domain_normalized": "1662.ton",
                "label_normalized": "1662",
                "canonical_identity_resolved": True,
                "feature_json": {},
                "market_signal_gram": 0,
            }
        ]
    )
    claimed = FakeDatabaseStore(conn).claim_jobs(
        worker_id="worker-1", job_type="dns-semantic", limit=1, lease_seconds=300
    )
    assert claimed[0].nft_address == "0:canonical"
    assert claimed[0].domain_normalized == "1662.ton"
    claim_sql = conn.calls[0][0]
    assert "domains.nft_address" in claim_sql
    assert "COALESCE( domains.nft_address" not in claim_sql


def test_new_profile_queues_valuation_without_writing_values_directly():
    conn = FakeConnection(profile=None)
    changed = save(FakeDatabaseStore(conn), profile())
    statements = [sql for sql, _ in conn.calls]
    assert changed is True
    assert any("INSERT INTO dns_semantic_profiles" in sql for sql in statements)
    assert any("INSERT INTO dns_jobs" in sql for sql in statements)
    assert not any("dns_valuations" in sql or "portfolio" in sql for sql in statements)

    enqueue_params = next(
        params for sql, params in conn.calls if "INSERT INTO dns_jobs" in sql
    )
    payload = json.loads(enqueue_params["valuation_payload"])
    assert payload["nftAddress"] == "0:canonical"
    assert payload["domain"] == "1662.ton"
    assert "semantic-" in enqueue_params["valuation_dedupe_key"]


def test_identical_profile_is_idempotent_and_does_not_queue_valuation():
    value = profile()
    conn = FakeConnection(profile=persisted_profile(value))
    changed = save(FakeDatabaseStore(conn), value)
    statements = [sql for sql, _ in conn.calls]
    assert changed is False
    assert not any("INSERT INTO dns_semantic_profiles" in sql for sql in statements)
    assert not any("INSERT INTO dns_jobs" in sql for sql in statements)
    completion_params = next(
        params
        for sql, params in conn.calls
        if sql.startswith("UPDATE dns_jobs SET status = 'completed'")
    )
    result = json.loads(completion_params["result"])
    assert result["valuation_refresh_enqueued"] is False


def test_material_score_change_queues_a_new_valuation_refresh():
    value = profile()
    old = persisted_profile(value)
    old["brandability_score"] = max(0, value["brandability_score"] - 0.2)
    conn = FakeConnection(profile=old)
    assert save(FakeDatabaseStore(conn), value) is True
    assert any("INSERT INTO dns_jobs" in sql for sql, _ in conn.calls)


def test_material_signature_ignores_evidence_order_and_warning_noise():
    value = profile()
    value["dictionary_meanings"] = [
        {
            "term": "one",
            "meaning": "First",
            "language": "en",
            "part_of_speech": None,
            "confidence": 0.9,
            "source": "dictionary",
        },
        {
            "term": "single",
            "meaning": "One",
            "language": "en",
            "part_of_speech": None,
            "confidence": 0.8,
            "source": "dictionary",
        },
    ]
    other = persisted_profile(value)
    other["dictionary_meanings_json"] = list(
        reversed(other["dictionary_meanings_json"])
    )
    other["provenance_json"]["warnings"] = ["transient-http-timeout"]
    assert material_profile_signature(
        value,
        profile_version="semantic-v1",
        model_name="deterministic",
        model_version="dictionary-v1",
    ) == material_profile_signature(other)

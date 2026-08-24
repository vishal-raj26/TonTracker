from datetime import datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
import io
import urllib.error

from dns_worker.direct_d1 import (
    DirectD1Ingestor,
    GETGEMS_HISTORY_KEY,
    TONAPI_MEMBERSHIP_KEY,
    TONCENTER_RATE_LIMIT_KEY,
    TONCENTER_HISTORY_KEY,
)
from dns_worker.historical_usd import HistoricalUsdProvider


class FakeClient:
    def __init__(self):
        self.calls = []

    def read_assets(self, kind, cursor=None, limit=5000):
        self.calls.append((kind, cursor, limit))
        if cursor is None:
            return {
                "records": [{"asset_key": "0:a", "normalized_name": "alpha.ton"}],
                "nextCursor": "0:a",
            }
        return {
            "records": [{"asset_key": "0:b", "normalized_name": "beta.ton"}],
            "nextCursor": None,
        }


class FakeCycleClient:
    def __init__(self, states):
        self.states = states
        self.writes = []

    def read_state(self, key):
        return self.states.get(key)

    def write_state(self, key, cursor, metadata):
        self.writes.append((key, cursor, metadata))


class FakeSeedClient(FakeCycleClient):
    def __init__(self):
        super().__init__({})
        self.assets = []

    def ingest_assets(self, records):
        self.assets.extend(records)
        return len(records)


class FakeGetgemsClient(FakeCycleClient):
    def __init__(self, states=None):
        super().__init__(states or {})
        self.assets = []
        self.sales = []

    def ingest_assets(self, records):
        self.assets.extend(records)
        return len(records)

    def ingest_sales(self, records):
        self.sales.extend(records)
        return len(records)


def test_membership_export_is_paginated_and_normalized():
    client = FakeClient()
    ingestor = object.__new__(DirectD1Ingestor)
    ingestor.client = client

    assert ingestor._load_membership() == {
        "0:a": "alpha.ton",
        "0:b": "beta.ton",
    }
    assert client.calls == [("dns", None, 5000), ("dns", "0:a", 5000)]


def test_historical_rate_interpolation_uses_bracketing_observations():
    moment = datetime(2026, 1, 1, 3, tzinfo=timezone.utc)
    points = [
        (int(datetime(2026, 1, 1, tzinfo=timezone.utc).timestamp()), Decimal("2")),
        (int(datetime(2026, 1, 1, 6, tzinfo=timezone.utc).timestamp()), Decimal("4")),
    ]
    assert HistoricalUsdProvider._interpolated_rate(points, moment) == Decimal("3")


def test_dns_sale_identity_is_stable_across_equivalent_source_streams():
    event = SimpleNamespace(
        event_id="source-specific",
        nft_address="0:abc",
        domain_normalized="alpha.ton",
        event_time=datetime(2026, 1, 1, tzinfo=timezone.utc),
        price_gram=Decimal("100"),
        price_nano_gram=100_000_000_000,
        sale_contract="0:sale",
        marketplace_name="Getgems",
        source="ton-lake",
        quality_flags=(),
        market_kind="secondary_getgems",
    )
    first = DirectD1Ingestor._sale_record(event, Decimal("3"))
    event.event_id = "different-source-event-id"
    second = DirectD1Ingestor._sale_record(event, Decimal("3"))

    assert first["saleId"] == second["saleId"]
    assert first["priceUsd"] == 300


def test_direct_cycle_uses_free_toncenter_history_without_getgems_key():
    client = FakeCycleClient({TONAPI_MEMBERSHIP_KEY: {"cursor": {"scanComplete": True}}})
    ingestor = object.__new__(DirectD1Ingestor)
    ingestor.client = client
    calls = []
    ingestor.run_toncenter_history = lambda: calls.append("toncenter") or {
        "stream": "toncenter_history", "complete": False
    }

    result = ingestor.run_cycle(page_size=7)

    assert calls == ["toncenter"]
    assert result["phase"] == "bootstrap"


def test_public_toncenter_pacing_survives_worker_restart(monkeypatch):
    client = FakeCycleClient({
        TONCENTER_RATE_LIMIT_KEY: {"cursor": {"lastRequestAt": 100.0}}
    })
    ingestor = object.__new__(DirectD1Ingestor)
    ingestor.client = client
    slept = []
    now = [100.25]
    monkeypatch.delenv("TONCENTER_API_KEY", raising=False)
    monkeypatch.setenv("TONCENTER_PUBLIC_INTERVAL_SECONDS", "1.1")
    monkeypatch.setattr("dns_worker.direct_d1.time.time", lambda: now[0])
    monkeypatch.setattr("dns_worker.direct_d1.time.sleep", lambda seconds: slept.append(seconds))

    ingestor._pace_toncenter_public_request()

    assert slept == [0.8499999999999943]
    assert client.writes[0][0] == TONCENTER_RATE_LIMIT_KEY
    assert client.writes[0][1]["lastRequestAt"] == 100.25


def test_toncenter_request_retries_transient_server_error(monkeypatch):
    ingestor = object.__new__(DirectD1Ingestor)
    ingestor.settings = SimpleNamespace(http_timeout_seconds=10)
    ingestor._pace_toncenter_public_request = lambda: None
    attempts = []

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self):
            return b'{"nft_transfers": []}'

    def open_request(request, timeout):
        attempts.append((request.full_url, timeout))
        if len(attempts) == 1:
            raise urllib.error.HTTPError(request.full_url, 500, "server error", {}, io.BytesIO())
        return Response()

    monkeypatch.setenv("TONCENTER_RETRY_ATTEMPTS", "3")
    monkeypatch.setattr("dns_worker.direct_d1.urllib.request.urlopen", open_request)
    monkeypatch.setattr("dns_worker.direct_d1.time.sleep", lambda _: None)

    result = ingestor._toncenter_request("/nft/transfers", [("limit", "10")])

    assert result == {"nft_transfers": []}
    assert len(attempts) == 2


def test_direct_cycle_seeds_verified_membership_before_generic_sales():
    client = FakeCycleClient({})
    ingestor = object.__new__(DirectD1Ingestor)
    ingestor.client = client
    calls = []
    ingestor.run_tonapi_membership_seed = lambda: calls.append("membership") or {
        "stream": "tonapi_membership", "complete": False
    }

    result = ingestor.run_cycle(page_size=7)

    assert calls == ["membership"]
    assert result["phase"] == "bootstrap"
    assert result["remainingStreams"] == ["tonapi_membership"]


def test_tonapi_membership_seed_accepts_only_verified_dns_items(monkeypatch):
    client = FakeSeedClient()
    ingestor = object.__new__(DirectD1Ingestor)
    ingestor.client = client
    ingestor.settings = SimpleNamespace(http_timeout_seconds=10)
    rows = [{
        "address": "0:" + "a" * 64,
        "verified": True,
        "collection": {"address": "0:b774d95eb20543f186c06b371ab88ad704f7e256130caf96189368a7d0cb6ccf"},
        "metadata": {"name": "alpha.ton"},
    }, {
        "address": "0:" + "b" * 64,
        "verified": False,
        "collection": {"address": "0:b774d95eb20543f186c06b371ab88ad704f7e256130caf96189368a7d0cb6ccf"},
        "metadata": {"name": "ignored.ton"},
    }, {
        "address": "0:" + "c" * 64,
        "verified": True,
        "collection": {"address": "0:" + "d" * 64},
        "metadata": {"name": "wrong.ton"},
    }]
    ingestor._tonapi_page = lambda offset, limit: rows if offset == 0 else []
    monkeypatch.setenv("TONAPI_MEMBERSHIP_PAGE_SIZE", "1000")
    monkeypatch.setenv("TONAPI_MEMBERSHIP_PAGES_PER_CYCLE", "1")
    monkeypatch.setenv("TONAPI_API_KEY", "test-key")

    result = ingestor.run_tonapi_membership_seed()

    assert result["complete"] is True
    assert [record["normalizedName"] for record in client.assets] == ["alpha.ton"]
    assert client.writes[-1][0] == TONAPI_MEMBERSHIP_KEY
    assert client.writes[-1][1]["scanComplete"] is True


def test_direct_cycle_starts_price_evidence_after_verified_membership():
    client = FakeCycleClient({
        TONAPI_MEMBERSHIP_KEY: {"cursor": {"scanComplete": True}},
        "dns-ton-lake-direct-v2:scheduler": {
            "cursor": {"bootstrapNextStreamIndex": 1}
        }
    })
    ingestor = object.__new__(DirectD1Ingestor)
    ingestor.client = client
    calls = []
    ingestor.run_toncenter_history = lambda: calls.append("toncenter") or {
        "stream": "toncenter_history", "complete": False
    }

    result = ingestor.run_cycle(page_size=7)

    assert calls == ["toncenter"]
    assert result["phase"] == "bootstrap"
    assert result["remainingStreams"] == ["toncenter_history"]


def test_direct_cycle_rotates_streams_after_bootstrap():
    complete = {
        f"dns-ton-lake-direct-v2:{stream}": {"cursor": {"scanComplete": True}}
        for stream in ("nft_items", "nft_metadata", "nft_events", "nft_sales")
    }
    complete[TONAPI_MEMBERSHIP_KEY] = {"cursor": {"scanComplete": True}}
    complete[TONCENTER_HISTORY_KEY] = {"cursor": {"backfillComplete": True}}
    complete["dns-ton-lake-direct-v2:scheduler"] = {
        "cursor": {"nextStreamIndex": 2}
    }
    client = FakeCycleClient(complete)
    ingestor = object.__new__(DirectD1Ingestor)
    ingestor.client = client
    calls = []
    ingestor.run_toncenter_history = lambda: calls.append("toncenter") or {
        "stream": "toncenter_history", "complete": True
    }

    result = ingestor.run_cycle(page_size=9)

    assert calls == ["toncenter"]
    assert result["phase"] == "incremental"
    assert result["nextStream"] == "toncenter_history"
    assert client.writes[0][1]["nextStreamIndex"] == 0


def test_getgems_history_only_ingests_native_finalized_sales_with_historical_usd(monkeypatch):
    client = FakeGetgemsClient()
    ingestor = object.__new__(DirectD1Ingestor)
    ingestor.client = client
    ingestor.settings = SimpleNamespace(http_timeout_seconds=10)
    now = datetime.now(timezone.utc).replace(microsecond=0)
    ingestor._getgems_history_page = lambda after: {
        "cursor": None,
        "items": [{
            "address": "0:" + "a" * 64,
            "name": "alpha.ton",
            "time": now.isoformat(),
            "hash": "tx-hash",
            "typeData": {"type": "sold", "currency": "TON", "priceNano": "2500000000"},
        }, {
            "address": "0:" + "b" * 64,
            "name": "ignored.ton",
            "time": now.isoformat(),
            "typeData": {"type": "sold", "currency": "USDT", "priceNano": "5"},
        }],
    }
    ingestor.rate_provider = SimpleNamespace(rates_at=lambda moments: {moment: Decimal("2") for moment in moments})
    monkeypatch.setenv("GETGEMS_API_KEY", "test-key")

    result = ingestor.run_getgems_history()

    assert result["sales"] == 1
    assert result["complete"] is True
    assert client.assets[0]["normalizedName"] == "alpha.ton"
    assert client.sales[0]["priceGram"] == 2.5
    assert client.sales[0]["priceUsd"] == 5


def test_toncenter_history_uses_completed_sale_contracts_not_plain_transfers(monkeypatch):
    client = FakeGetgemsClient()
    ingestor = object.__new__(DirectD1Ingestor)
    ingestor.client = client
    ingestor.settings = SimpleNamespace(http_timeout_seconds=10)
    now = datetime.now(timezone.utc).replace(microsecond=0)
    sale_contract = "0:" + "c" * 64
    item = "0:" + "a" * 64
    ingestor._toncenter_transfer_page = lambda before, cutoff: {
        "nft_transfers": [{
            "old_owner": sale_contract.upper(), "nft_address": item,
            "transaction_now": int(now.timestamp()), "transaction_lt": "99",
            "transaction_hash": "sale-tx", "transaction_aborted": False,
        }, {
            "old_owner": "0:" + "b" * 64, "nft_address": "0:" + "d" * 64,
            "transaction_now": int(now.timestamp()), "transaction_lt": "98",
            "transaction_hash": "plain-transfer", "transaction_aborted": False,
        }],
        "address_book": {sale_contract.upper(): {"interfaces": ["nft_sale_getgems_v4"]}},
    }
    ingestor._toncenter_sale_contracts = lambda addresses: {
        "nft_sales": [{
            "address": sale_contract, "nft_address": item,
            "details": {"is_complete": True, "full_price": "2500000000"},
            "nft_item": {"content": {"domain": "alpha.ton"}},
        }]
    }
    ingestor.rate_provider = SimpleNamespace(
        rates_at=lambda moments: {moment: Decimal("2") for moment in moments}
    )
    monkeypatch.delenv("TONCENTER_API_KEY", raising=False)
    monkeypatch.setattr("dns_worker.direct_d1.time.sleep", lambda _: None)

    result = ingestor.run_toncenter_history()

    assert result["transfers"] == 2
    assert result["sales"] == 1
    assert client.assets[0]["normalizedName"] == "alpha.ton"
    assert client.sales[0]["priceGram"] == 2.5
    assert client.sales[0]["priceUsd"] == 5
    assert client.writes[-1][0] == TONCENTER_HISTORY_KEY


def test_toncenter_history_retries_fresh_sale_until_historical_usd_is_observed(monkeypatch):
    client = FakeGetgemsClient()
    ingestor = object.__new__(DirectD1Ingestor)
    ingestor.client = client
    ingestor.settings = SimpleNamespace(http_timeout_seconds=10)
    now = datetime.now(timezone.utc).replace(microsecond=0)
    sale_contract = "0:" + "c" * 64
    item = "0:" + "a" * 64
    ingestor._toncenter_transfer_page = lambda before, cutoff: {
        "nft_transfers": [{
            "old_owner": sale_contract, "nft_address": item,
            "transaction_now": int(now.timestamp()), "transaction_lt": "99",
            "transaction_hash": "fresh-sale", "transaction_aborted": False,
        }],
        "address_book": {sale_contract: {"interfaces": ["nft_sale_getgems_v4"]}},
    }
    ingestor._toncenter_sale_contracts = lambda addresses: {
        "nft_sales": [{
            "address": sale_contract, "nft_address": item,
            "details": {"is_complete": True, "full_price": "2500000000"},
            "nft_item": {"content": {"domain": "alpha.ton"}},
        }]
    }
    ingestor.rate_provider = SimpleNamespace(available_rates_at=lambda moments: ({}, [now]))
    monkeypatch.delenv("TONCENTER_API_KEY", raising=False)
    monkeypatch.setattr("dns_worker.direct_d1.time.sleep", lambda _: None)

    result = ingestor.run_toncenter_history()

    assert result["sales"] == 0
    assert result["pendingHistoricalUsd"] == 1
    assert result["complete"] is False
    assert client.writes[-1][1] == {"beforeLt": None, "backfillComplete": False}

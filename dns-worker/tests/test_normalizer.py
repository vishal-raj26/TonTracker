from __future__ import annotations

from copy import deepcopy
from decimal import Decimal

import pytest

from dns_worker.constants import TON_DNS_COLLECTION
from dns_worker.normalizer import (
    NormalizationError,
    classify_market,
    normalize_domain,
    normalize_row,
)

OBJECT_KEY = "v1.1/ton/nft_events/date=2024-12-01/part-a"


def test_registration_sale_keeps_native_gram_and_provenance(dns_row):
    event = normalize_row(dns_row, OBJECT_KEY)

    assert event.domain_normalized == "daily-major.ton"
    assert event.market_kind == "registration_auction"
    assert event.marketplace_name == "TON DNS Auction"
    assert event.price_nano_gram == 983_557_200
    assert event.price_gram == Decimal("0.9835572")
    assert event.payment_asset == "GRAM"
    assert event.is_finalized is True
    assert event.nft_address == ("0:" + "12" * 32)
    assert event.collection_address == TON_DNS_COLLECTION
    assert event.source_partition == "2024-12-01"
    assert event.historical_usd_rate is None
    assert event.historical_usd_value is None


def test_getgems_ask_is_secondary_and_not_complete(dns_row):
    row = deepcopy(dns_row)
    row.update(
        type="put_on_sale",
        tx_hash="hash",
        lt=100,
        sale_contract="0:" + "56" * 32,
        marketplace_address=(
            "0:584EE61B2DFF0837116D0FCB5078D93964BCBE9C05FD6A141B1BFCA5D6A43E18"
        ),
        sale_price="100000000000",
    )
    event = normalize_row(row, OBJECT_KEY)

    assert event.market_kind == "secondary_getgems"
    assert event.marketplace_name == "Getgems"
    assert event.price_gram == Decimal("100")
    assert event.is_finalized is False


def test_sale_without_explicit_completion_is_not_finalized(dns_row):
    row = deepcopy(dns_row)
    row.update(
        marketplace_address=(
            "0:584EE61B2DFF0837116D0FCB5078D93964BCBE9C05FD6A141B1BFCA5D6A43E18"
        ),
        sale_contract="0:" + "56" * 32,
    )
    row.pop("is_complete", None)
    event = normalize_row(row, OBJECT_KEY)
    assert event.market_kind == "secondary_getgems"
    assert event.is_finalized is False


def test_unknown_secondary_sale_is_never_finalized(dns_row):
    row = deepcopy(dns_row)
    row.update(
        type="sale",
        is_complete=True,
        marketplace_address="0:" + "99" * 32,
        sale_contract="0:" + "88" * 32,
    )
    event = normalize_row(row, OBJECT_KEY)
    assert event.market_kind == "secondary_unknown"
    assert event.is_finalized is False
    assert "unknown_secondary_marketplace" in event.quality_flags


def test_non_native_payment_is_audited_but_not_priced(dns_row):
    row = deepcopy(dns_row)
    row["payment_asset"] = "USDT"
    event = normalize_row(row, OBJECT_KEY)

    assert event.price_nano_gram is None
    assert event.price_gram is None
    assert event.payment_asset == "USDT"
    assert "non_native_payment_asset" in event.quality_flags
    assert "missing_native_price" in event.quality_flags


def test_cancel_price_is_never_misread_as_completed_sale(dns_row):
    row = deepcopy(dns_row)
    row["type"] = "cancel_sale"
    row["sale_contract"] = "0:" + "77" * 32
    event = normalize_row(row, OBJECT_KEY)

    assert event.is_cancelled is True
    assert event.is_finalized is False
    assert "cancel_price_is_prior_ask" in event.quality_flags


def test_transfer_and_mint_do_not_carry_prices(dns_row):
    for event_type in ("transfer", "mint"):
        row = deepcopy(dns_row)
        row["type"] = event_type
        event = normalize_row(row, OBJECT_KEY)
        assert event.price_gram is None
        assert "price_on_non_market_event" in event.quality_flags


def test_same_chain_event_deduplicates_across_republished_objects(dns_row):
    first = normalize_row(dns_row, OBJECT_KEY)
    second = normalize_row(
        dns_row, "v1.1/ton/nft_events/date=2024-12-02/republication"
    )
    assert first.event_id == second.event_id


def test_registration_rows_with_zero_lt_do_not_collide(dns_row):
    first = normalize_row(dns_row, OBJECT_KEY)
    changed = deepcopy(dns_row)
    changed["timestamp"] += 100
    changed["sale_price"] = "2000000000"
    second = normalize_row(changed, OBJECT_KEY)
    assert first.event_id != second.event_id


def test_transaction_identity_ignores_non_identity_payload_changes(dns_row):
    row = deepcopy(dns_row)
    row.update(tx_hash="tx", trace_id="trace", lt=123)
    first = normalize_row(row, OBJECT_KEY)
    row["content_onchain"] = '{"domain":"daily-major","new_field":true}'
    second = normalize_row(row, OBJECT_KEY)
    assert first.event_id == second.event_id


def test_wrong_collection_and_missing_nft_are_rejected(dns_row):
    wrong = deepcopy(dns_row)
    wrong["collection_address"] = "0:" + "00" * 32
    with pytest.raises(NormalizationError, match="verified TON DNS"):
        normalize_row(wrong, OBJECT_KEY)

    missing = deepcopy(dns_row)
    missing["nft_item_address"] = None
    with pytest.raises(NormalizationError, match="nft_item_address"):
        normalize_row(missing, OBJECT_KEY)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("Example", "example.ton"),
        ("Example.TON", "example.ton"),
        ("ＥＸＡＭＰＬＥ", "example.ton"),
        ("", None),
    ],
)
def test_domain_normalization(raw, expected):
    assert normalize_domain(raw) == expected


def test_unknown_market_is_not_labeled_getgems():
    kind, name = classify_market(
        "put_on_sale", "0:" + "99" * 32, "0:" + "88" * 32
    )
    assert kind == "secondary_unknown"
    assert name is None


def test_collection_constant_is_canonical_lowercase_raw():
    assert TON_DNS_COLLECTION == TON_DNS_COLLECTION.lower()

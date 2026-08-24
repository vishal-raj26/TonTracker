from __future__ import annotations

from typing import Any

import pytest

from dns_worker.constants import TON_DNS_COLLECTION


@pytest.fixture
def dns_row() -> dict[str, Any]:
    return {
        "type": "sale",
        "nft_item_address": "0:" + "12" * 32,
        "nft_item_index": "42",
        "collection_address": TON_DNS_COLLECTION.lower(),
        "owner_address": "0:" + "34" * 32,
        "content_onchain": '{"domain":"Daily-Major","auction_end_time":1733093300}',
        "timestamp": 1733093300,
        "lt": 0,
        "tx_hash": None,
        "trace_id": None,
        "prev_owner": None,
        "sale_contract": None,
        "sale_type": "auction",
        "sale_end_time": 1733093300,
        "marketplace_address": TON_DNS_COLLECTION,
        "sale_price": "983557200",
        "payment_asset": "TON",
        "auction_max_bid": "983557200",
        "auction_min_bid": None,
        "auction_min_step": None,
    }

"""Stable source and normalization constants for the DNS ledger."""

from __future__ import annotations

# Keep the original ledger source identity stable: changing it would generate
# new deterministic IDs for already-ingested nft_events evidence.
SOURCE_NAME = "ton-etl-s3-nft-events-v1.1"
SOURCE_BUCKET_URL = "https://aws-public-blockchain.s3.us-east-2.amazonaws.com"
SOURCE_PREFIX = "v1.1/ton/nft_events/"
SOURCE_STREAM_PREFIXES = {
    "nft_items": "v1.1/ton/nft_items/",
    "nft_metadata": "v1.1/ton/nft_metadata/",
    "nft_events": SOURCE_PREFIX,
    "nft_sales": "v1.1/ton/nft_sales/",
}
SOURCE_STREAM_ORDER = ("nft_items", "nft_metadata", "nft_events", "nft_sales")

TON_DNS_COLLECTION = (
    "0:b774d95eb20543f186c06b371ab88ad704f7e256130caf96189368a7d0cb6ccf"
)

# TON-ETL currently documents TON as the only supported payment asset in
# nft_events. TonTrack's product label is GRAM; the source alias is preserved in
# raw payload and normalized to native GRAM only after this allowlist check.
NATIVE_PAYMENT_ASSETS = frozenset({"TON", "TONCOIN", "GRAM"})

SUPPORTED_EVENT_TYPES = frozenset(
    {"mint", "transfer", "put_on_sale", "cancel_sale", "sale", "bid"}
)
PRICE_EVENT_TYPES = frozenset({"put_on_sale", "cancel_sale", "sale", "bid"})

DNS_REGISTRATION_EVENT_TYPES = frozenset({"sale", "bid", "mint"})

# Verified mainnet Getgems account labels. The normalizer does not infer that
# every unknown address is Getgems; unknown secondary markets remain explicit.
GETGEMS_MARKETPLACE_ADDRESSES = frozenset(
    {
        "0:a3935861f79daf59a13d6d182e1640210c02f98e3df18fda74b8f5ab141abf18",
        "0:584ee61b2dff0837116d0fcb5078d93964bcbe9c05fd6a141b1bfca5d6a43e18",
    }
)

DEFAULT_DISCOVERY_PAGE_SIZE = 1000
DEFAULT_BATCH_SIZE = 8
DEFAULT_MAX_ATTEMPTS = 5
DEFAULT_BACKOFF_SECONDS = 2.0
DEFAULT_HTTP_TIMEOUT_SECONDS = 30.0
DEFAULT_LEASE_SECONDS = 900

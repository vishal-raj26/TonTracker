from __future__ import annotations

from datetime import datetime, timezone

import pytest

from dns_worker.models import MetadataRecord
from dns_worker.store import PostgresStore, UnresolvedDomainError


class Result:
    def __init__(self, rows):
        self.rows = rows

    def fetchall(self):
        return self.rows


class MetadataConnection:
    def __init__(self, safe=()):
        self.safe = safe

    def execute(self, query, params):
        assert "FROM dns_catalog_members" in query
        return Result([(address,) for address in self.safe])


def metadata(address):
    return MetadataRecord(
        nft_address=address,
        domain_raw=None,
        domain_normalized=None,
        observed_at=datetime(2026, 8, 13, tzinfo=timezone.utc),
        source_partition="2026-08-13",
        source_object_key="v1.1/ton/nft_metadata/date=2026-08-13/object",
    )


def test_unresolved_metadata_prevents_object_completion():
    missing = "0:" + "a" * 64

    with pytest.raises(UnresolvedDomainError) as raised:
        PostgresStore._assert_metadata_resolved(
            MetadataConnection(), (metadata(missing),)
        )

    assert raised.value.addresses == (missing,)


def test_resolved_metadata_is_safe_to_checkpoint():
    address = "0:" + "a" * 64

    PostgresStore._assert_metadata_resolved(
        MetadataConnection((address,)), (metadata(address),)
    )

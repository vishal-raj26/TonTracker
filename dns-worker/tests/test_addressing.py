from __future__ import annotations

import base64

import pytest

from dns_worker.addressing import AddressError, canonical_raw_address


def crc16(data: bytes) -> int:
    crc = 0
    for byte in data:
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return crc


def friendly(raw: str, bounceable: bool) -> str:
    workchain, account = raw.split(":", 1)
    tag = 0x11 if bounceable else 0x51
    body = bytes((tag, int(workchain) & 0xFF)) + bytes.fromhex(account)
    return base64.urlsafe_b64encode(body + crc16(body).to_bytes(2, "big")).decode().rstrip("=")


def test_raw_and_eq_uq_addresses_share_one_lowercase_identity():
    raw = "0:" + "AB" * 32
    expected = raw.lower()
    assert canonical_raw_address(raw) == expected
    assert canonical_raw_address(friendly(raw, bounceable=True)) == expected
    assert canonical_raw_address(friendly(raw, bounceable=False)) == expected


def test_invalid_friendly_checksum_is_rejected():
    value = friendly("0:" + "12" * 32, bounceable=False)
    with pytest.raises(AddressError, match="checksum"):
        canonical_raw_address(value[:-1] + ("A" if value[-1] != "A" else "B"))

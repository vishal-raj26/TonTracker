"""Canonical TON address handling shared by every ingestion stream."""

from __future__ import annotations

import base64
import re
from typing import Any

RAW_ADDRESS_RE = re.compile(r"^(-?\d+):([0-9a-fA-F]{64})$")
FRIENDLY_TAGS = frozenset({0x11, 0x51})


class AddressError(ValueError):
    """Raised when an input cannot be proven to be a TON account address."""


def canonical_raw_address(value: Any) -> str:
    """Return lower-case ``workchain:hex`` for raw or EQ/UQ TON addresses."""

    text = str(value or "").strip()
    match = RAW_ADDRESS_RE.fullmatch(text)
    if match:
        return f"{int(match.group(1))}:{match.group(2).lower()}"
    if not text:
        raise AddressError("TON address is empty")

    try:
        padded = text + "=" * (-len(text) % 4)
        decoded = base64.urlsafe_b64decode(padded.encode("ascii"))
    except (ValueError, UnicodeEncodeError) as exc:
        raise AddressError("invalid TON friendly address encoding") from exc
    if len(decoded) != 36:
        raise AddressError("TON friendly address must decode to 36 bytes")
    body, checksum = decoded[:34], decoded[34:]
    if _crc16_xmodem(body).to_bytes(2, "big") != checksum:
        raise AddressError("TON friendly address checksum mismatch")
    if body[0] & 0x7F not in FRIENDLY_TAGS:
        raise AddressError("unsupported TON friendly address tag")
    workchain = body[1] if body[1] < 128 else body[1] - 256
    return f"{workchain}:{body[2:34].hex()}"


def optional_raw_address(value: Any) -> str | None:
    """Canonicalize an optional address, rejecting malformed non-empty values."""

    if value is None or str(value).strip() == "":
        return None
    return canonical_raw_address(value)


def _crc16_xmodem(data: bytes) -> int:
    crc = 0
    for byte in data:
        crc ^= byte << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return crc

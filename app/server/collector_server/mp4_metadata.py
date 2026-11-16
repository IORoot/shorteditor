from __future__ import annotations

import os
import struct
from datetime import datetime, timedelta, timezone

_EPOCH_1904 = datetime(1904, 1, 1, tzinfo=timezone.utc)
_CONTAINERS = {b"moov"}


def creation_time(path: str) -> datetime | None:
    try:
        with open(path, "rb") as handle:
            size = os.fstat(handle.fileno()).st_size
            seconds = _find_creation_seconds(handle, 0, size)
    except OSError:
        return None
    if not seconds:
        return None
    return _EPOCH_1904 + timedelta(seconds=seconds)


def _find_creation_seconds(handle, start: int, end: int, depth: int = 0) -> int | None:
    position = start
    while position + 8 <= end and depth < 3:
        handle.seek(position)
        header = handle.read(8)
        if len(header) < 8:
            return None
        size, kind = struct.unpack(">I4s", header)
        header_size = 8
        if size == 1:
            extended = handle.read(8)
            if len(extended) < 8:
                return None
            size, header_size = struct.unpack(">Q", extended)[0], 16
        elif size == 0:
            size = end - position
        if size < header_size:
            return None
        if kind == b"mvhd":
            return _read_mvhd(handle)
        if kind in _CONTAINERS:
            found = _find_creation_seconds(handle, position + header_size, min(position + size, end), depth + 1)
            if found is not None:
                return found
        position += size
    return None


def _read_mvhd(handle) -> int | None:
    version = handle.read(1)
    handle.read(3)
    if not version:
        return None
    width, fmt = (8, ">Q") if version[0] == 1 else (4, ">I")
    raw = handle.read(width)
    return struct.unpack(fmt, raw)[0] if len(raw) == width else None

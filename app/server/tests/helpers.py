from __future__ import annotations

import os
import struct
from datetime import datetime, timezone
from pathlib import Path

from collector_server.collection.models import CollectorConfig


def make_clip(path: Path, when: datetime, content: bytes = b"clip") -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(content)
    stamp = when.timestamp()
    os.utime(path, (stamp, stamp))
    return path


def config_for(source: Path, output: Path, **overrides) -> CollectorConfig:
    base = dict(
        name="Coach",
        input_folder=str(source),
        output_folder=str(output),
        folder_template="{date:YYYY-MM-DD}_{weekday}_{suffix}",
        group_by="day",
        suffix="coach",
    )
    base.update(overrides)
    return CollectorConfig(**base)


def _atom(kind: bytes, payload: bytes) -> bytes:
    return struct.pack(">I4s", 8 + len(payload), kind) + payload


def mp4_bytes(created: datetime | None, version: int = 0, moov_last: bool = False) -> bytes:
    seconds = 0 if created is None else int((created - datetime(1904, 1, 1, tzinfo=timezone.utc)).total_seconds())
    fmt = ">Q" if version == 1 else ">I"
    body = bytes([version]) + b"\0\0\0" + struct.pack(fmt, seconds) + struct.pack(fmt, seconds) + b"\0" * 20
    moov = _atom(b"moov", _atom(b"mvhd", body))
    ftyp = _atom(b"ftyp", b"isom\0\0\0\0isom")
    mdat = _atom(b"mdat", b"x" * 100)
    return ftyp + (mdat + moov if moov_last else moov + mdat)


def make_mp4(path: Path, created: datetime | None, when: datetime, **kw) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(mp4_bytes(created, **kw))
    stamp = when.timestamp()
    os.utime(path, (stamp, stamp))
    return path

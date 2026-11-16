from __future__ import annotations

import os
import re
from datetime import datetime, tzinfo

from . import mp4_metadata

KINDS = ("metadata", "filename", "mtime")
_TOKENS = re.compile(r"(YYYY|MM|DD|HH|mm|ss)")
_GROUPS = {"YYYY": r"(?P<Y>\d{4})", "MM": r"(?P<M>\d{2})", "DD": r"(?P<D>\d{2})", "HH": r"(?P<h>\d{2})", "mm": r"(?P<m>\d{2})", "ss": r"(?P<s>\d{2})"}


def compile_pattern(pattern: str) -> re.Pattern[str]:
    tokens = [part for part in _TOKENS.findall(pattern)]
    if len(set(tokens)) != len(tokens):
        raise ValueError("Each date token may appear only once in the filename pattern")
    if not {"YYYY", "MM", "DD"} <= set(tokens):
        raise ValueError("Filename pattern needs YYYY, MM and DD (for example GX_YYYYMMDD_HHmmss)")
    return re.compile("".join(_GROUPS.get(part, re.escape(part)) for part in _TOKENS.split(pattern)))


class ClipDateResolver:
    def __init__(self, sources: list[str], filename_pattern: str, zone: tzinfo | None) -> None:
        if not sources:
            raise ValueError("Pick at least one date source")
        if len(set(sources)) != len(sources) or any(kind not in KINDS for kind in sources):
            raise ValueError("Date sources must be metadata, filename or mtime, each used once")
        self._sources = sources
        self._zone = zone
        self._pattern = compile_pattern(filename_pattern) if "filename" in sources else None

    def resolve(self, path: str) -> tuple[datetime, str]:
        for kind in self._sources:
            when = self._try(kind, path)
            if when is not None:
                return when, kind
        return self._mtime(path), "mtime"

    def _try(self, kind: str, path: str) -> datetime | None:
        if kind == "metadata":
            created = mp4_metadata.creation_time(path)
            return created.astimezone(self._zone) if created else None
        if kind == "filename":
            return self._from_name(os.path.basename(path))
        return self._mtime(path)

    def _from_name(self, name: str) -> datetime | None:
        match = self._pattern.search(name) if self._pattern else None
        if match is None:
            return None
        parts = match.groupdict()
        try:
            return datetime(
                int(parts["Y"]), int(parts["M"]), int(parts["D"]),
                int(parts.get("h") or 0), int(parts.get("m") or 0), int(parts.get("s") or 0),
                tzinfo=self._zone,
            )
        except ValueError:
            return None

    def _mtime(self, path: str) -> datetime:
        return datetime.fromtimestamp(os.stat(path).st_mtime, self._zone)

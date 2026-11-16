from __future__ import annotations

import os
import re
from dataclasses import dataclass
from datetime import datetime, tzinfo

DATE_SOURCES = ("modified", "created", "filename")
_TOKENS = re.compile(r"(YYYY|MM|DD|HH|mm|ss)")
_GROUPS = {"YYYY": r"(?P<Y>\d{4})", "MM": r"(?P<M>\d{2})", "DD": r"(?P<D>\d{2})", "HH": r"(?P<h>\d{2})", "mm": r"(?P<m>\d{2})", "ss": r"(?P<s>\d{2})"}


def compile_pattern(pattern: str) -> re.Pattern[str]:
    tokens = _TOKENS.findall(pattern)
    if len(set(tokens)) != len(tokens):
        raise ValueError("Each date token may appear only once in the filename pattern")
    if not {"YYYY", "MM", "DD"} <= set(tokens):
        raise ValueError("Filename pattern needs YYYY, MM and DD (for example GX_YYYYMMDD_HHmmss)")
    return re.compile("".join(_GROUPS.get(part, re.escape(part)) for part in _TOKENS.split(pattern)))


@dataclass(frozen=True)
class ClipTimes:
    modified: datetime
    created: datetime


def read_times(path: str, zone: tzinfo | None) -> ClipTimes:
    stat = os.stat(path)
    # st_birthtime is the creation time on macOS; other systems fall back to modified time.
    created = getattr(stat, "st_birthtime", stat.st_mtime)
    return ClipTimes(datetime.fromtimestamp(stat.st_mtime, zone), datetime.fromtimestamp(created, zone))


class DateRule:
    """Picks one clip date: file modified time, created time, or a date read from the filename."""

    def __init__(self, source: str, pattern: str = "") -> None:
        if source not in DATE_SOURCES:
            raise ValueError("Date source must be modified, created or filename")
        self._source = source
        self._pattern = compile_pattern(pattern) if source == "filename" else None

    def pick(self, name: str, times: ClipTimes) -> datetime | None:
        if self._source == "modified":
            return times.modified
        if self._source == "created":
            return times.created
        return self._from_name(name, times.modified.tzinfo)

    def _from_name(self, name: str, zone: tzinfo | None) -> datetime | None:
        match = self._pattern.search(name)
        if match is None:
            return None
        parts = match.groupdict()
        try:
            return datetime(
                int(parts["Y"]), int(parts["M"]), int(parts["D"]),
                int(parts.get("h") or 0), int(parts.get("m") or 0), int(parts.get("s") or 0),
                tzinfo=zone,
            )
        except ValueError:
            return None

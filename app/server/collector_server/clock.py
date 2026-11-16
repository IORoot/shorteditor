from __future__ import annotations

from datetime import datetime
from typing import Protocol
from zoneinfo import ZoneInfo


class Clock(Protocol):
    def now(self) -> datetime: ...


class SystemClock:
    def __init__(self, timezone: str = "Europe/London") -> None:
        self._zone = ZoneInfo(timezone)

    def now(self) -> datetime:
        return datetime.now(self._zone)

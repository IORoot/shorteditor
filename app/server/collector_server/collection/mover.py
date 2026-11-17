from __future__ import annotations

from collections.abc import Callable
from typing import Protocol

from .domain import CollectorRecord


class Mover(Protocol):
    def move(self, collector: CollectorRecord, run_id: int, progress: Callable[[str], None]) -> str: ...


class UnavailableMover:
    def move(self, collector: CollectorRecord, run_id: int, progress: Callable[[str], None]) -> str:
        raise NotImplementedError("The transfer engine is not available")

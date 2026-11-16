from __future__ import annotations

from typing import Protocol

from .domain import CollectorRecord


class Mover(Protocol):
    def move(self, collector: CollectorRecord) -> str: ...


class UnavailableMover:
    def move(self, collector: CollectorRecord) -> str:
        raise NotImplementedError("The transfer engine is not built yet")

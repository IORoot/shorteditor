from __future__ import annotations

import os
from typing import Protocol


class SourceChecker(Protocol):
    def is_reachable(self, source: str) -> bool: ...


class LocalSourceChecker:
    def is_reachable(self, source: str) -> bool:
        return os.path.isdir(source)

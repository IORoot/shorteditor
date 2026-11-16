from __future__ import annotations

import random
from collections.abc import Sequence
from typing import TypeVar

from .models import RandomSelection

T = TypeVar("T")


class RandomSelector:
    def __init__(self, config: RandomSelection) -> None:
        if config.enabled:
            if config.value < 1:
                raise ValueError("Random selection needs a value of at least 1")
            if config.mode == "percent" and config.value > 100:
                raise ValueError("Random selection percent can't be more than 100")
        self._config = config

    @property
    def enabled(self) -> bool:
        return self._config.enabled

    @property
    def per_folder(self) -> bool:
        return self._config.enabled and self._config.scope == "folder"

    @property
    def overall(self) -> bool:
        return self._config.enabled and self._config.scope == "overall"

    def count_for(self, total: int) -> int:
        if total == 0:
            return 0
        if self._config.mode == "count":
            return min(self._config.value, total)
        return min(total, max(1, round(total * self._config.value / 100)))

    def pick(self, items: Sequence[T], salt: str) -> list[T]:
        if not self._config.enabled or not items:
            return list(items)
        chosen = set(random.Random(f"{self._config.seed}:{salt}").sample(range(len(items)), self.count_for(len(items))))
        return [item for index, item in enumerate(items) if index in chosen]

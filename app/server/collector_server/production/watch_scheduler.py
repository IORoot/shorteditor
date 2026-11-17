from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import datetime

from .watch_repository import WatchRepository
from .watch_service import WatchService

_log = logging.getLogger(__name__)


class WatchScheduler:
    """Checks every enabled watch whose interval has passed. Called from the production tick."""

    def __init__(self, watches: WatchRepository, service: WatchService, clock: Callable[[], float]) -> None:
        self._watches, self._service, self._clock = watches, service, clock

    def tick(self) -> list[int]:
        checked: list[int] = []
        for watch in self._watches.list():
            try:
                if not watch.enabled or not self._due(watch.last_checked_at, watch.interval_minutes):
                    continue
                self._service.check(watch.id)
                checked.append(watch.id)
            except Exception:  # noqa: BLE001 - one broken watch must not stop the others
                _log.exception("checking watch %s failed", watch.id)
        return checked

    def _due(self, last: str | None, interval_minutes: int) -> bool:
        if last is None:
            return True
        elapsed = self._clock() - datetime.fromisoformat(last).timestamp()
        return elapsed < 0 or elapsed >= interval_minutes * 60  # a clock that jumped back must not silence the watch

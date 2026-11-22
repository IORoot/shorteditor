from __future__ import annotations

import logging
import os
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timezone

from .errors import InvalidInputError
from .folder_scan import scan_parent
from .pattern import compile_pattern
from .repositories import BatchRepository, PassRepository
from .service import ProductionService

_log = logging.getLogger(__name__)


@dataclass
class WatchCheck:
    created: int = 0
    waiting: list[str] = field(default_factory=list)
    error: str | None = None


class BatchWatcher:
    """Checks the input folder of each watching batch, and adds each new matching folder to that batch as a card once it has stopped changing."""

    def __init__(self, service: ProductionService, batches: BatchRepository, passes: PassRepository, clock: Callable[[], float]) -> None:
        self._service, self._batches, self._passes, self._clock = service, batches, passes, clock

    def tick(self) -> list[int]:
        """Checks every watching batch whose interval has passed. Returns the ids it checked."""
        checked: list[int] = []
        for batch in self._batches.list():
            try:
                if batch.watching and self._due(batch.watch_last_checked_at, batch.watch_interval_minutes):
                    self.check(batch.id)
                    checked.append(batch.id)
            except Exception:  # noqa: BLE001 - one broken batch must not stop the others
                _log.exception("checking the watch of batch %s failed", batch.id)
        return checked

    def check(self, batch_id: int) -> WatchCheck:
        batch = self._batches.get(batch_id)
        if batch is None or not batch.watching or batch.folder_pattern is None:
            return WatchCheck()
        ref = self._service.pipeline_ref(batch.pipeline_id) if batch.pipeline_id is not None else None
        if batch.pipeline_id is not None and (ref is None or not ref.enabled):
            return WatchCheck()  # paused until its pipeline is switched on; nothing is recorded
        result = WatchCheck()
        problems: list[str] = []
        try:
            scan = scan_parent(batch.input_folder, compile_pattern(batch.folder_pattern))
            with self._service.lock:  # the decision and the cards are one step
                seen = self._batches.seen(batch_id)
                taken = self._service.taken_folders()
                fresh: list[str] = []
                for c in scan.matches:
                    if c.path in seen:
                        continue
                    if os.path.realpath(c.path) in taken:
                        self._batches.mark_seen(batch_id, [c.path], self._stamp())  # already a card here or in another batch
                        continue
                    if c.incomplete:
                        result.waiting.append(c.name)
                    elif c.clip_count == 0:
                        continue
                    elif not (c.newest_change is None or self._clock() - c.newest_change >= batch.watch_settle_minutes * 60):
                        result.waiting.append(c.name)
                    elif len(fresh) < batch.watch_max_per_check:
                        fresh.append(c.path)
                if fresh:
                    result.created = self._service.add_cards(batch_id, fresh)
        except (InvalidInputError, OSError) as problem:
            result.error = str(problem).rstrip(".")
        except Exception as problem:  # noqa: BLE001 - recorded on the batch; the other batches carry on
            _log.exception("checking the watch of batch %s failed", batch_id)
            result.error = f"Something went wrong: {type(problem).__name__}"
        if problems:
            result.error = "; ".join(problems[:2])
        self._batches.record_watch_check(batch_id, self._stamp(), result.error, result.waiting)
        return result

    def _due(self, last: str | None, interval_minutes: int) -> bool:
        if last is None:
            return True
        elapsed = self._clock() - datetime.fromisoformat(last).timestamp()
        return elapsed < 0 or elapsed >= interval_minutes * 60  # a clock that jumped back must not silence the watch

    def _stamp(self) -> str:
        return datetime.fromtimestamp(self._clock(), tz=timezone.utc).isoformat()

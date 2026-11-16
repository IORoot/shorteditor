from __future__ import annotations

import threading
from collections.abc import Callable
from datetime import datetime, timedelta

from ..shared.clock import Clock
from .collector_repository import CollectorRepository
from .domain import CollectorRecord, RunRecord
from .cron import CronExpression
from .mover import Mover
from .run_repository import RunRepository
from .source_checker import SourceChecker

OVERLAP_MESSAGE = "Skipped: the previous run was still moving files"
UNREACHABLE_MESSAGE = "Source unreachable: nothing was touched"


class Scheduler:
    def __init__(
        self,
        collectors: CollectorRepository,
        runs: RunRepository,
        checker: SourceChecker,
        mover: Mover,
        clock: Clock,
        tolerance: timedelta = timedelta(minutes=1),
        undoable: Callable[[int], bool] = lambda run_id: False,
    ) -> None:
        self._collectors = collectors
        self._runs = runs
        self._checker = checker
        self._mover = mover
        self._clock = clock
        self._tolerance = tolerance
        self._undoable = undoable
        self._running: set[int] = set()
        self._guard = threading.Lock()

    def due_slot(self, collector: CollectorRecord, now: datetime) -> datetime | None:
        if not collector.enabled or collector.last_slot is None or not collector.cron:
            return None
        slot = CronExpression.parse(collector.cron).next_after(collector.last_slot)
        return slot if slot is not None and slot <= now else None

    def tick(self) -> list[RunRecord]:
        now = self._clock.now()
        results: list[RunRecord] = []
        for collector in self._collectors.list():
            if not collector.active:
                continue
            slot = self.due_slot(collector, now)
            if slot is None:
                continue
            trigger = "scheduled" if now - slot <= self._tolerance else "caught_up"
            self._collectors.set_last_slot(collector.id, now)
            results.append(self.run(collector, trigger))
        return results

    def run(self, collector: CollectorRecord, trigger: str) -> RunRecord:
        return self.start(collector, trigger, background=False)

    def start(self, collector: CollectorRecord, trigger: str, background: bool = False) -> RunRecord:
        started = self._clock.now()
        if not self._acquire(collector.id):
            return self._runs.add(collector.id, started, trigger, "skipped", OVERLAP_MESSAGE)
        if not self._checker.is_reachable(collector.source):
            self._release(collector.id)
            return self._runs.add(collector.id, started, trigger, "failed", UNREACHABLE_MESSAGE)
        run = self._runs.add(collector.id, started, trigger, "running", "Starting…")
        if background:
            threading.Thread(target=self._execute, args=(collector, run.id), daemon=True).start()
            return run
        return self._execute(collector, run.id)

    def _execute(self, collector: CollectorRecord, run_id: int) -> RunRecord:
        try:
            outcome = self._mover.move(collector, run_id, lambda text: self._runs.update(run_id, outcome=text))
            status = "done"
        except Exception as error:  # noqa: BLE001 - every failure must be logged, never raised
            outcome, status = f"Run failed: {error}", "failed"
        finally:
            self._release(collector.id)
        final = self._runs.update(run_id, status=status, outcome=outcome, can_undo=self._undoable(run_id))
        assert final is not None
        return final

    def _acquire(self, collector_id: int) -> bool:
        with self._guard:
            if collector_id in self._running:
                return False
            self._running.add(collector_id)
            return True

    def _release(self, collector_id: int) -> None:
        with self._guard:
            self._running.discard(collector_id)

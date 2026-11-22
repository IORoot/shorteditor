from __future__ import annotations

import threading
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Protocol

from ..shared.clock import Clock
from .collector_repository import CollectorRepository
from .domain import CollectorRecord, RunRecord
from .cron import CronExpression
from .mover import Mover
from .run_repository import RunRepository
from .source_checker import SourceChecker

OVERLAP_MESSAGE = "Skipped: the previous run was still moving files"
UNREACHABLE_MESSAGE = "Source unreachable: nothing was touched"


class SourceProbe(Protocol):
    """What auto-collect looks at: the source's listing, and how many clips the collector's filters would take."""

    def snapshot(self, collector: CollectorRecord) -> Any: ...

    def waiting(self, collector: CollectorRecord) -> int: ...


@dataclass
class WatchInfo:
    """What is remembered about one auto-collecting collector. Held in memory only, so a restart starts unsettled."""

    last_checked: datetime
    snapshot: Any = None
    changed_at: datetime | None = None
    unreachable: bool = False
    nothing_to_take: bool = False  # the filters matched no clip for this listing, so it is not planned again until it changes
    failed_here: bool = False  # a run on this listing failed, so it is not retried until the listing changes


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
        probe: SourceProbe | None = None,
    ) -> None:
        self._collectors = collectors
        self._runs = runs
        self._checker = checker
        self._mover = mover
        self._clock = clock
        self._tolerance = tolerance
        self._undoable = undoable
        self._probe = probe
        self._watching: dict[int, WatchInfo] = {}
        self._running: set[int] = set()
        self._guard = threading.Lock()

    def due_slot(self, collector: CollectorRecord, now: datetime) -> datetime | None:
        if collector.mode != "schedule" or not collector.enabled or collector.last_slot is None or not collector.cron:
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
        results.extend(self._poll(now))
        return results

    def watch_info(self, collector_id: int) -> WatchInfo | None:
        return self._watching.get(collector_id)

    def _poll(self, now: datetime) -> list[RunRecord]:
        """Auto-collect: look at each source every poll interval, and run once it has held still and clips are waiting."""
        if self._probe is None:
            return []
        runs: list[RunRecord] = []
        for collector in self._collectors.list():
            if collector.mode != "auto" or not collector.active:
                self._watching.pop(collector.id, None)
                continue
            seen = self._watching.get(collector.id)
            if seen is not None and now - seen.last_checked < timedelta(seconds=collector.poll_seconds):
                continue
            if not self._checker.is_reachable(collector.source):
                self._watching[collector.id] = WatchInfo(now, unreachable=True)  # nothing recorded: a down source would fill the history
                continue
            snapshot = self._probe.snapshot(collector)
            if seen is None or seen.unreachable or snapshot != seen.snapshot:
                self._watching[collector.id] = WatchInfo(now, snapshot, now)
                continue
            seen.last_checked = now
            assert seen.changed_at is not None
            if now - seen.changed_at < timedelta(seconds=collector.settle_seconds) or self._is_running(collector.id):
                continue
            if seen.nothing_to_take or seen.failed_here:
                continue
            if self._probe.waiting(collector) == 0:
                seen.nothing_to_take = True
                continue
            run = self.run(collector, "watched")
            runs.append(run)
            # the folder has just changed: settle again before the next run. After a failure, wait for it to change on its own.
            self._watching[collector.id] = WatchInfo(now, self._probe.snapshot(collector), now, failed_here=True) if run.status == "failed" else WatchInfo(now)
        return runs

    def _is_running(self, collector_id: int) -> bool:
        with self._guard:
            return collector_id in self._running

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

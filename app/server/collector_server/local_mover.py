from __future__ import annotations

from collections.abc import Callable

from .domain import CollectorRecord
from .executor import TransferExecutor
from .planner import TransferPlanner

_PAST = {"move": "Moved", "copy": "Copied", "link": "Linked"}


def plural(count: int, noun: str) -> str:
    return f"{count} {noun}" if count == 1 else f"{count} {noun}s"


class LocalMover:
    def __init__(self, planner: TransferPlanner, executor: TransferExecutor) -> None:
        self._planner = planner
        self._executor = executor

    def move(self, collector: CollectorRecord, run_id: int, progress: Callable[[str], None]) -> str:
        plan = self._planner.plan(collector)
        if plan.total_files == 0:
            return "No new clips found"
        done = self._executor.execute(plan, collector.transfer, run_id, progress)
        return f"{_PAST[collector.transfer]} {plural(done, 'clip')} into {plural(plan.folder_count, 'folder')}"

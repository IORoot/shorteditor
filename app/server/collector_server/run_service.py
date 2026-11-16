from __future__ import annotations

from .collector_repository import CollectorRepository
from .domain import CollectorRecord, RunRecord
from .planner import TransferPlanner
from .scheduler import Scheduler
from .transfer_plan import TransferPlan
from .undo import UndoService


class RunService:
    def __init__(
        self,
        collectors: CollectorRepository,
        planner: TransferPlanner,
        scheduler: Scheduler,
        undo: UndoService,
    ) -> None:
        self._collectors = collectors
        self._planner = planner
        self._scheduler = scheduler
        self._undo = undo

    def dry_run(self, collector_id: int) -> tuple[CollectorRecord, TransferPlan] | None:
        record = self._collectors.get(collector_id)
        return (record, self._planner.plan(record)) if record else None

    def start_run(self, collector_id: int) -> RunRecord | None:
        record = self._collectors.get(collector_id)
        if record is None:
            return None
        self._planner.validate(record)
        return self._scheduler.start(record, "manual", background=True)

    def undo(self, run_id: int) -> RunRecord:
        return self._undo.undo(run_id)

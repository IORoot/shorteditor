from __future__ import annotations

from ..shared.clock import Clock
from .collector_repository import CollectorRepository
from .domain import CollectorRecord
from .config_rules import validate_config
from .filter_preview import FilterPreviewer
from .planner import TransferPlanner
from .models import Collector, CollectorConfig, CollectorCreate, FilterPreviewResult, FolderPreview, FolderPreviewRequest, Run, Schedule, ScheduleDraft
from .presenters import format_moment, present_run
from .preview import FolderPreviewer
from .run_repository import RunRepository
from .schedule import ScheduleRule


class CollectorService:
    def __init__(self, collectors: CollectorRepository, runs: RunRepository, clock: Clock) -> None:
        self._collectors = collectors
        self._runs = runs
        self._clock = clock
        self._filter_previewer = FilterPreviewer(TransferPlanner(clock), clock)

    def list_collectors(self) -> list[Collector]:
        return [self._present(record) for record in self._collectors.list()]

    def get_collector(self, collector_id: int) -> Collector | None:
        record = self._collectors.get(collector_id)
        return self._present(record) if record else None

    def set_active(self, collector_id: int, active: bool) -> Collector | None:
        record = self._collectors.set_active(collector_id, active, self._clock.now())
        return self._present(record) if record else None

    def create_collector(self, request: CollectorCreate) -> Collector:
        name = request.name.strip()
        if not name:
            raise ValueError("Give the collector a name")
        return self._present(self._collectors.add(name, ""))

    def duplicate_collector(self, collector_id: int) -> Collector | None:
        """A copy with the same folders, filters and schedule times, named "... copy". Its schedule starts off, so the two never run side by side on their own."""
        record = self._collectors.get(collector_id)
        if record is None:
            return None
        config = record.config().model_copy(update={"name": f"{record.name} copy"})
        copy = self._collectors.add_with_config(config)
        draft = record.draft().model_copy(update={"enabled": False})
        saved = self._collectors.save_schedule(copy.id, draft, ScheduleRule(draft).cron, self._clock.now())
        return self._present(saved) if saved else None

    def delete_collector(self, collector_id: int) -> bool | None:
        """True when deleted, None when the collector doesn't exist. Refuses while a run is in progress."""
        if self._collectors.get(collector_id) is None:
            return None
        if any(run.status == "running" for run in self._runs.recent(collector_id)):
            raise ValueError("A run is in progress. Wait for it to finish before deleting this collector.")
        return self._collectors.delete(collector_id)

    def list_runs(self, collector_id: int) -> list[Run] | None:
        if self._collectors.get(collector_id) is None:
            return None
        return [present_run(run) for run in self._runs.recent(collector_id)]

    def update_config(self, collector_id: int, config: CollectorConfig) -> Collector | None:
        validate_config(config)
        record = self._collectors.update_config(collector_id, config)
        return self._present(record) if record else None

    def preview_folder(self, request: FolderPreviewRequest) -> FolderPreview:
        return FolderPreviewer().preview(request, self._clock.now())

    def preview_filters(self, config: CollectorConfig) -> FilterPreviewResult:
        return self._filter_previewer.preview(config)

    def save_schedule(self, collector_id: int, draft: ScheduleDraft) -> Collector | None:
        rule = ScheduleRule(draft)
        record = self._collectors.save_schedule(collector_id, draft, rule.cron, self._clock.now())
        return self._present(record) if record else None

    def _present(self, record: CollectorRecord) -> Collector:
        draft = record.draft()
        summary = "Schedule off"
        next_run = None
        if record.cron or record.enabled:
            rule = ScheduleRule(draft)
            summary = rule.summary()
            if record.enabled:
                upcoming = rule.expression().next_after(self._clock.now())
                next_run = format_moment(upcoming) if upcoming else None
        schedule = Schedule(**draft.model_dump(), summary=summary, next_run=next_run)
        config = record.config()
        source = f"ssh://{record.ssh_host}{record.source}" if record.source_type == "ssh" else record.source
        return Collector(
            id=record.id,
            name=record.name,
            active=record.active,
            source=source,
            transfer=record.transfer,  # type: ignore[arg-type]
            config=config,
            schedule=schedule,
        )

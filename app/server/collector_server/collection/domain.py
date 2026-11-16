from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from .models import CollectorConfig, FilterGroup, ScheduleDraft


@dataclass(frozen=True)
class CollectorRecord:
    id: int
    name: str
    source: str
    transfer: str
    enabled: bool
    kind: str
    time: str
    weekdays: list[int]
    day_of_month: int
    cron: str
    last_slot: datetime | None
    active: bool = True
    source_type: str = "local"
    ssh_host: str = ""
    ssh_user: str = ""
    ssh_key_path: str = ""
    output_folder: str = ""
    folder_template: str = "{date:YYYY-MM-DD}_{weekday}"
    group_by: str = "day"
    suffix: str = ""
    filters: list[FilterGroup] = field(default_factory=list)
    date_source: str = "modified"
    filename_pattern: str = ""

    @classmethod
    def from_config(cls, config: CollectorConfig) -> "CollectorRecord":
        """An unsaved record, for previews that run the planner on what the editor currently shows."""
        return cls(
            id=0, name=config.name, source=config.input_folder, transfer=config.transfer, enabled=False, kind="daily",
            time="00:00", weekdays=[], day_of_month=1, cron="", last_slot=None, source_type=config.source_type,
            ssh_host=config.host, ssh_user=config.user, ssh_key_path=config.key_path, output_folder=config.output_folder,
            folder_template=config.folder_template, group_by=config.group_by, suffix=config.suffix, filters=config.filters,
            date_source=config.date_source, filename_pattern=config.filename_pattern,
        )

    def config(self) -> CollectorConfig:
        return CollectorConfig(
            name=self.name,
            source_type=self.source_type,  # type: ignore[arg-type]
            host=self.ssh_host,
            user=self.ssh_user,
            key_path=self.ssh_key_path,
            input_folder=self.source,
            output_folder=self.output_folder,
            folder_template=self.folder_template,
            group_by=self.group_by,  # type: ignore[arg-type]
            transfer=self.transfer,  # type: ignore[arg-type]
            suffix=self.suffix,
            filters=self.filters,
            date_source=self.date_source,  # type: ignore[arg-type]
            filename_pattern=self.filename_pattern,
        )

    def draft(self) -> ScheduleDraft:
        return ScheduleDraft(
            enabled=self.enabled,
            kind=self.kind,  # type: ignore[arg-type]
            time=self.time,
            weekdays=self.weekdays,
            day_of_month=self.day_of_month,
            cron=self.cron,
        )


@dataclass(frozen=True)
class RunRecord:
    id: int
    collector_id: int
    started_at: datetime
    trigger: str
    status: str
    outcome: str
    can_undo: bool


@dataclass(frozen=True)
class MoveRecord:
    id: int
    run_id: int
    source: str
    destination: str
    transfer: str

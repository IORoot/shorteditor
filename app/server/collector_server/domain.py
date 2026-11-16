from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from .models import CollectorConfig, ScheduleDraft


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
    source_type: str = "local"
    ssh_host: str = ""
    ssh_user: str = ""
    ssh_key_path: str = ""
    output_folder: str = ""
    folder_template: str = "{date:YYYY-MM-DD}_{weekday}"
    group_by: str = "day"
    suffix: str = ""

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

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ScheduleDraft(CamelModel):
    enabled: bool
    kind: Literal["daily", "weekly", "monthly", "cron"]
    time: str = Field(pattern=r"^\d{2}:\d{2}$")
    weekdays: list[int] = Field(default_factory=list)
    day_of_month: int = Field(default=1, ge=1, le=31)
    cron: str = ""


class Schedule(ScheduleDraft):
    summary: str
    next_run: str | None


class StatusNote(CamelModel):
    tone: Literal["warn", "bad"]
    text: str


SourceType = Literal["local", "mount", "ssh"]
GroupBy = Literal["none", "day", "week", "month", "window"]
Transfer = Literal["move", "copy", "link"]


RuleKind = Literal["name", "glob", "regex", "date_range", "weekday", "window"]
DateSourceKind = Literal["metadata", "filename", "mtime"]


class FilterRule(CamelModel):
    kind: RuleKind
    exclude: bool = False
    value: str = ""
    date_from: str = ""
    date_to: str = ""
    days: list[int] = Field(default_factory=list)
    start: str = ""
    end: str = ""


class FilterGroup(CamelModel):
    rules: list[FilterRule] = Field(default_factory=list)


class RandomSelection(CamelModel):
    enabled: bool = False
    mode: Literal["count", "percent"] = "percent"
    value: int = 10
    scope: Literal["overall", "folder"] = "overall"
    seed: int = 1


class CollectorConfig(CamelModel):
    name: str
    source_type: SourceType = "local"
    host: str = ""
    user: str = ""
    key_path: str = ""
    input_folder: str
    output_folder: str = ""
    folder_template: str = "{date:YYYY-MM-DD}_{weekday}"
    group_by: GroupBy = "day"
    transfer: Transfer = "move"
    suffix: str = ""
    filters: list[FilterGroup] = Field(default_factory=list)
    random_selection: RandomSelection = Field(default_factory=RandomSelection)
    date_sources: list[DateSourceKind] = Field(default_factory=lambda: ["mtime"])
    filename_pattern: str = ""


class Collector(CamelModel):
    id: int
    name: str
    source: str
    transfer: Transfer
    config: CollectorConfig
    schedule: Schedule
    status_note: StatusNote | None = None


class FolderPreviewRequest(CamelModel):
    folder_template: str
    output_folder: str = ""
    group_by: GroupBy = "day"
    suffix: str = ""
    sample_date: str | None = None
    window_name: str = "Morning"
    window_start: str = "09-00"


class FolderPreview(CamelModel):
    relative_path: str
    full_path: str


class BrowseEntry(CamelModel):
    name: str
    path: str


class BrowseResult(CamelModel):
    path: str
    parent: str | None
    entries: list[BrowseEntry]


class Run(CamelModel):
    id: int
    collector_id: int
    started_at: str
    trigger: Literal["scheduled", "manual", "caught_up"]
    status: Literal["running", "done", "skipped", "failed"]
    outcome: str
    can_undo: bool


class PlanGroup(CamelModel):
    folder: str
    path: str
    renamed: bool
    count: int
    bytes: int
    sample: list[str]


class PlanResult(CamelModel):
    transfer: Transfer
    total_files: int
    total_bytes: int
    folder_count: int
    groups: list[PlanGroup]
    notes: list[str]
    unmatched: int = 0
    not_selected: int = 0
    left_in_place: int = 0
    left_sample: list[str] = Field(default_factory=list)

from __future__ import annotations

from collector_server.shared.camel_model import CamelModel
from collector_server.shared.pipeline import StageStep, UsageItem


class Pipeline(CamelModel):
    id: int
    name: str
    description: str = ""
    enabled: bool
    steps: list[StageStep]
    created_at: str
    updated_at: str


class PipelineSave(CamelModel):
    name: str
    description: str = ""
    steps: list[StageStep]


class PipelineSummary(CamelModel):
    id: int
    name: str
    description: str
    enabled: bool
    stage_count: int
    max_seconds: float | None
    max_size_mb: float | None
    used_by: int
    updated_at: str


class PipelineDetail(Pipeline):
    used_by: list[UsageItem]
    recent_batches: list[UsageItem]


class Template(CamelModel):
    steps: list[StageStep]


class Enabled(CamelModel):
    enabled: bool


class CheckRequest(CamelModel):
    steps: list[StageStep]


class CheckResult(CamelModel):
    errors: list[str]

"""What Pipeline and Production agree on, so neither imports the other."""
from __future__ import annotations

from typing import Literal, Protocol, runtime_checkable

from .camel_model import CamelModel


class StageStep(CamelModel):
    key: str
    settings: dict = {}
    enabled: bool = True


class StageInfo(CamelModel):
    key: str
    title: str
    transitions: dict[str, str]
    position: str
    settings_schema: dict


class UsageItem(CamelModel):
    kind: Literal["batch", "watch"]
    id: int
    name: str
    status: str | None = None
    at: str | None = None


class OffImpact(CamelModel):
    watches: int
    waiting_batches: int


class PipelineRef(CamelModel):
    id: int
    name: str
    enabled: bool
    steps: list[StageStep]


@runtime_checkable
class StageCatalog(Protocol):
    def stages(self) -> list[StageInfo]: ...

    def check_pipeline(self, steps: list[StageStep]) -> list[str]: ...


@runtime_checkable
class PipelineSource(Protocol):
    def get_pipeline(self, pipeline_id: int) -> PipelineRef | None: ...

    def enabled_pipelines(self) -> list[PipelineRef]: ...


@runtime_checkable
class PipelineUsage(Protocol):
    def users_of(self, pipeline_id: int) -> list[UsageItem]: ...

    def off_impact(self, pipeline_id: int) -> OffImpact: ...

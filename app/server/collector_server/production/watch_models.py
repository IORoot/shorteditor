from __future__ import annotations

from typing import Annotated, Literal

from pydantic import AfterValidator, Field

from collector_server.shared.camel_model import CamelModel

from .models import Batch
from .stage_api import StageStep


def _no_control(text: str) -> str:
    if any(ord(c) < 32 for c in text):
        raise ValueError("must not contain control characters")
    return text


Name = Annotated[str, Field(min_length=1, max_length=120), AfterValidator(_no_control)]


class WatchCreate(CamelModel):
    name: Name
    parent_folder: str = Field(max_length=1000)
    pattern: str = Field(max_length=200)
    name_template: str = Field("{name}", max_length=200)
    pipeline_id: int
    run_on: str = Field("any", max_length=100)
    output_root: str | None = Field(None, max_length=1000)
    interval_minutes: int = Field(5, ge=1, le=1440)
    settle_minutes: int = Field(10, ge=0, le=1440)
    max_per_check: int = Field(20, ge=1, le=100)
    include_existing: bool = False  # create-time only: also batch the folders already there
    enabled: bool = True


class Watch(CamelModel):
    id: int
    name: str
    parent_folder: str
    pattern: str
    name_template: str
    pipeline_id: int | None = None  # None: a watch made before pipelines, still on its own steps
    steps: list[StageStep] = []
    run_on: str
    output_root: str | None
    interval_minutes: int
    settle_minutes: int
    max_per_check: int
    enabled: bool
    created_at: str
    last_checked_at: str | None = None
    last_error: str | None = None
    waiting: list[str] = []
    created_total: int = 0


WatchStatus = Literal["watching", "waiting", "paused", "problem"]


class WatchView(Watch):
    status: WatchStatus
    status_line: str
    pipeline_name: str | None = None


class Enabled(CamelModel):
    enabled: bool


class CheckResult(CamelModel):
    created: list[Batch]
    waiting: list[str]
    error: str | None = None

from __future__ import annotations

from typing import Literal

from collector_server.shared.camel_model import CamelModel

from .pieces import VideoData
from .stage_api import StageStep

PassStatus = Literal["queued", "running", "review", "blocked", "failed", "approved"]
LogKind = Literal["pipeline", "ffmpeg"]


class Batch(CamelModel):
    id: int
    name: str
    input_folder: str
    steps: list[StageStep]
    run_on: str = "any"
    output_root: str
    created_at: str


class Pass(CamelModel):
    id: int
    batch_id: int
    number: int
    status: PassStatus = "queued"
    stage_index: int = 0
    stage_key: str = ""
    blocked_reason: str | None = None
    blocked_choices: list[str] = []
    overrides: dict[str, dict] = {}
    error: str | None = None
    output: VideoData | None = None
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None


class BatchCreate(CamelModel):
    name: str
    input_folder: str
    steps: list[StageStep]
    run_on: str = "any"
    output_root: str | None = None


class RunAgain(CamelModel):
    steps: list[StageStep] | None = None


class Resolve(CamelModel):
    choice: str


class ValidateRequest(CamelModel):
    steps: list[StageStep]


class ValidateResult(CamelModel):
    errors: list[str]


class StageInfo(CamelModel):
    key: str
    title: str
    transitions: dict[str, str]
    position: str
    settings_schema: dict


class BatchCard(CamelModel):
    batch_id: int
    pass_id: int
    run_on: str
    started_at: str | None
    name: str
    input_folder: str
    pipeline: list[str]
    status: PassStatus
    stage_title: str
    stage_position: int
    stage_count: int
    pass_number: int
    queue_position: int | None
    blocked_reason: str | None
    blocked_choices: list[str]
    error: str | None
    output: VideoData | None


class BatchDetail(CamelModel):
    batch: Batch
    passes: list[Pass]


class LogLines(CamelModel):
    lines: list[str]


class WorkerInfo(CamelModel):
    id: str
    label: str


class Defaults(CamelModel):
    output_root: str
    workers: list[WorkerInfo]

from __future__ import annotations

from typing import Literal

from collector_server.shared.camel_model import CamelModel

from .pieces import VideoData
from collector_server.shared.pipeline import StageStep

PassStatus = Literal["queued", "running", "review", "blocked", "failed", "approved"]
LogKind = Literal["pipeline", "ffmpeg"]


class Batch(CamelModel):
    id: int
    name: str
    input_folder: str
    pipeline_id: int | None = None  # None only for batches made before pipelines; they keep their own steps
    steps: list[StageStep] = []
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
    steps_used: list[StageStep] = []  # the steps this pass ran with, saved when it started
    error: str | None = None
    output: VideoData | None = None
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None


class BatchCreate(CamelModel):
    name: str
    input_folder: str
    pipeline_id: int
    run_on: str = "any"
    output_root: str | None = None


class RunAgain(CamelModel):
    pipeline_id: int | None = None  # switch the batch to another pipeline first


class Resolve(CamelModel):
    choice: str


class BatchCard(CamelModel):
    batch_id: int
    pass_id: int
    pipeline_id: int | None
    run_on: str
    started_at: str | None
    name: str
    input_folder: str
    pipeline_name: str | None
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


class PipelineChoice(CamelModel):
    id: int
    name: str
    stage_count: int


class Defaults(CamelModel):
    output_root: str
    workers: list[WorkerInfo]


PreviewStatus = Literal["will_create", "already_batched", "no_videos", "unreadable"]


class FolderPreviewRequest(CamelModel):
    parent_folder: str
    pattern: str
    output_root: str | None = None  # when given, a folder that would overlap the parent is refused up front


class PreviewItem(CamelModel):
    name: str
    path: str
    clip_count: int
    status: PreviewStatus


class FolderPreview(CamelModel):
    matches: list[PreviewItem]
    not_matching: int
    truncated: bool = False


class BulkCreate(CamelModel):
    parent_folder: str
    pattern: str
    name_template: str = "{name}"
    pipeline_id: int
    run_on: str = "any"
    output_root: str | None = None
    include: list[str] = []  # folder names to batch again although they already have a batch


class BulkResult(CamelModel):
    created: list[Batch]
    skipped: list[PreviewItem]

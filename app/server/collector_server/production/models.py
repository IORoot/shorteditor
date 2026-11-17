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

from __future__ import annotations

from collector_server.shared.camel_model import CamelModel

from .stage_api import StageStep


class Watch(CamelModel):
    """A separate watch from before batches could watch. Only read, to be converted into a watching batch."""

    id: int
    name: str
    parent_folder: str
    pattern: str
    name_template: str
    pipeline_id: int | None = None
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

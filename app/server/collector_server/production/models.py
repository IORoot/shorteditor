from __future__ import annotations

from typing import Annotated, Literal

from pydantic import Field

from collector_server.shared.camel_model import CamelModel

from .pieces import VideoData
from collector_server.shared.pipeline import StageStep

DEFAULT_FOLDER_TEMPLATE = "{{name}}-{{id}}"  # the batch's folder under its output folder, unless its template says otherwise

PassStatus = Literal["queued", "held", "paused", "running", "review", "blocked", "failed", "stopped", "approved"]
ActionName = Literal["pause", "resume", "stop", "rerun", "delete", "clear_output"]
LogKind = Literal["pipeline", "ffmpeg"]


class Batch(CamelModel):
    id: int
    name: str
    input_folder: str
    pipeline_id: int | None = None  # None only for batches made before pipelines; they keep their own steps
    steps: list[StageStep] = []
    run_on: str = "any"
    output_root: str
    folder_template: str = DEFAULT_FOLDER_TEMPLATE  # the batch's folder under the output folder, with {{name}}, {{id}} and {{date}} tags
    created_at: str
    folder_pattern: str | None = None  # set for a batch made from many folders: the folders its pattern matches are its cards
    auto_run: bool = True  # on: new cards start by themselves. Off: they wait as held until started
    ignore_subfolders: bool = False  # on: the batch's one card is the input folder itself, not its subfolders
    watching: bool = False  # on: the batch keeps checking its input folder, and a new matching folder becomes a new card
    watch_interval_minutes: int = 5
    watch_settle_minutes: int = 10  # a new folder must have been quiet this long before it becomes a card
    watch_max_per_check: int = 20
    watch_last_checked_at: str | None = None
    watch_last_error: str | None = None
    watch_waiting: list[str] = []  # new folders still changing, by name


class Run(CamelModel):
    id: int
    batch_id: int
    number: int
    created_at: str


class StageRun(CamelModel):
    key: str
    title: str
    status: Literal["running", "done", "failed", "blocked"]
    started_at: str
    finished_at: str | None = None
    details: dict | None = None  # what the stage produced: the clips it found or made, or the video it wrote


class Pass(CamelModel):
    """A card: one folder of work in one run of a batch."""

    id: int
    batch_id: int
    run_id: int | None = None
    folder: str = ""  # the card's folder, absolute
    number: int
    status: PassStatus = "queued"
    stage_index: int = 0
    stage_key: str = ""
    blocked_reason: str | None = None
    blocked_choices: list[str] = []
    blocked_items: list[str] = []  # the clips a review pass lets you pick from
    overrides: dict[str, dict] = {}
    steps_used: list[StageStep] = []  # the steps this pass ran with, saved when it started
    stages: list[StageRun] = []  # each stage this pass has reached, with its start and end
    error: str | None = None
    output: VideoData | None = None
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None


class BatchUpdate(CamelModel):
    name: str | None = None  # None leaves the name alone
    output_root: str | None = None  # None leaves the output folder alone; allowed only while no card has a finished video
    folder_template: str | None = None  # None leaves the folder name alone; allowed only under the same rule as the output folder
    auto_run: bool | None = None  # None leaves it alone; turning it on starts the cards that are held
    pipeline_id: int | None = None  # None leaves the pipeline alone; takes effect on the next run, and not while a card is waiting or running
    run_on: str | None = Field(None, max_length=100)  # None leaves the worker alone; the same rule as the pipeline
    watching: bool | None = None  # None leaves it alone; only a batch made from subfolders can watch
    watch_interval_minutes: int | None = None
    watch_settle_minutes: int | None = None
    watch_max_per_check: int | None = None


class BatchesDelete(CamelModel):
    batch_ids: Annotated[list[int], Field(min_length=1, max_length=500)]


class BatchesDeleted(CamelModel):
    deleted: int


class ActionRequest(CamelModel):
    action: ActionName
    ids: Annotated[list[int], Field(min_length=1, max_length=500)]


class ActionResult(CamelModel):
    id: int
    ok: bool
    message: str = ""


class ActionResults(CamelModel):
    results: list[ActionResult]


class BatchCreate(CamelModel):
    name: str
    input_folder: str
    pipeline_id: int
    run_on: str = "any"
    output_root: str | None = None
    folder_template: str | None = None  # None uses the default folder name
    auto_run: bool = False  # off: the cards wait until the batch is started


class RunAgain(CamelModel):
    pipeline_id: int | None = None  # switch the batch to another pipeline first


class Resolve(CamelModel):
    choice: str
    picks: list[int] | None = None  # the clips kept, for a Review by hand stop
    caption: str | None = Field(None, max_length=2000)  # the caption for one card, for a Post-iz stop


class BatchListItem(CamelModel):
    id: int
    name: str
    input_folder: str
    pipeline_name: str | None
    run_number: int | None
    run_at: str | None
    folder_count: int
    approved_count: int
    failed_count: int
    status: str  # empty, queued, running, review, failed or approved, derived from the cards of the newest run
    watching: bool = False
    watch_line: str | None = None  # how the watch is doing, for a watching batch


class BatchCard(CamelModel):
    batch_id: int
    pass_id: int
    folder: str = ""
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
    blocked_items: list[str] = []
    error: str | None
    output: VideoData | None


class BatchDetail(CamelModel):
    batch: Batch
    passes: list[Pass]


class LogEntry(CamelModel):
    at: str
    text: str


class LogLines(CamelModel):
    lines: list[str]
    entries: list[LogEntry] = []  # the same lines with the time each was written


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
    name: str | None = None  # the batch's name; None uses the parent folder's name
    name_template: str = "{name}"
    ignore_subfolders: bool = False  # on: the parent folder is the one card, and the pattern is not used
    pipeline_id: int
    run_on: str = "any"
    output_root: str | None = None
    folder_template: str | None = None  # None uses the default folder name
    auto_run: bool = False  # off: the cards wait until the batch is started
    watching: bool = False  # keep checking the parent folder: a new matching folder becomes a new card of this batch
    watch_existing: bool = True  # when watching: the folders already there become cards (else they are skipped for good)
    watch_interval_minutes: int = 5
    watch_settle_minutes: int = 10
    watch_max_per_check: int = 20


class BulkResult(CamelModel):
    created: list[Batch]
    skipped: list[PreviewItem]


class ExportRecord(CamelModel):
    """One try at sending a card's finished video to Postiz, for the Output tab and for refusing a second post."""

    id: int
    card_id: int | None = None  # None once the card has gone (Run again, delete): the record stays
    batch_id: int = 0
    source_folder: str = ""
    sha256: str
    status: Literal["uploading", "uploaded", "queued", "unclear", "checked", "failed"]
    media_id: str | None = None
    queue_id: str | None = None
    pipeline_id: str | None = None
    folder: str | None = None
    post_type: str | None = None
    caption: str = ""
    message: str = ""
    created_at: str
    updated_at: str
    batch_name: str = ""
    card_number: int = 0


class TrimBody(CamelModel):
    start: float = Field(ge=0, allow_inf_nan=False)
    end: float = Field(gt=0, allow_inf_nan=False)


class TrimsSave(CamelModel):
    clip: str = Field(min_length=1, max_length=260)
    trims: list[TrimBody] = Field(max_length=200)

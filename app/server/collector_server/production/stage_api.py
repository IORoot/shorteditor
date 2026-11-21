from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Literal, Protocol

from collector_server.shared.camel_model import CamelModel
from collector_server.shared.pipeline import StageStep

from .pieces import Kind, StageData

if TYPE_CHECKING:
    from .ffmpeg import FfmpegRunner
    from .postiz_client import PostizClient


class BlockedError(Exception):
    """A stage cannot finish without the user choosing what to do. items are the clips the user may pick from."""

    def __init__(self, reason: str, choices: list[str], items: list[str] | None = None) -> None:
        super().__init__(reason)
        self.reason = reason
        self.choices = choices
        self.items = items or []


class StageError(Exception):
    """A stage failed for a reason the user can read as it is."""


DEFAULT_AI_MODEL = "nvidia/nemotron-3.5-super-vl"  # the OpenRouter model used when Settings names none


@dataclass
class StageContext:
    input_folder: str
    work_dir: str
    output_dir: str
    ffmpeg: FfmpegRunner
    log: Callable[[str], None]
    cache_root: str | None = None  # where saved results of slow steps (Detect action) live; None turns saving off
    ai_key: str | None = None  # the OpenRouter key from Settings, for the AI stages only
    ai_model: str = DEFAULT_AI_MODEL  # the OpenRouter model from Settings, for the AI stages only
    exports: ExportStore | None = None  # the records of tries to send a video out, for the export stages only
    postiz: Callable[[], PostizClient | None] = lambda: None  # the Postiz connection from Settings, for the export stages only
    card_id: int = 0  # the card being run
    labels: dict[str, str] = field(default_factory=dict)  # name, id and date of this run, for the tags in stage text


class ExportStore(Protocol):
    """What an export stage may do with the records of its tries. Every record belongs to one card."""

    def for_card(self, card_id: int): ...  # noqa: ANN201 - the newest record, or None

    def by_sha(self, sha256: str): ...  # noqa: ANN201 - a finished record for this exact file, or None

    def start(self, card_id: int, sha256: str, caption: str) -> int: ...

    def update(self, record_id: int, **fields) -> None: ...  # noqa: ANN003

    def delete(self, record_id: int) -> None: ...


class Stage(Protocol):
    key: str
    title: str
    settings_model: type[CamelModel]
    transitions: dict[Kind, Kind]
    position: Literal["first", "last", "any"]

    def run(self, data: StageData, settings: CamelModel, ctx: StageContext) -> StageData: ...

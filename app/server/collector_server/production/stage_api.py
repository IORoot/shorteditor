from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal, Protocol

from collector_server.shared.camel_model import CamelModel
from collector_server.shared.pipeline import StageStep

from .pieces import Kind, StageData

if TYPE_CHECKING:
    from .ffmpeg import FfmpegRunner


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


class Stage(Protocol):
    key: str
    title: str
    settings_model: type[CamelModel]
    transitions: dict[Kind, Kind]
    position: Literal["first", "last", "any"]

    def run(self, data: StageData, settings: CamelModel, ctx: StageContext) -> StageData: ...

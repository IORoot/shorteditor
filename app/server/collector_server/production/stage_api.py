from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from typing import TYPE_CHECKING, Literal, Protocol

from collector_server.shared.camel_model import CamelModel

from .pieces import Kind, StageData

if TYPE_CHECKING:
    from .ffmpeg import FfmpegRunner


class StageStep(CamelModel):
    key: str
    settings: dict = {}
    enabled: bool = True


class BlockedError(Exception):
    """A stage cannot finish without the user choosing what to do."""

    def __init__(self, reason: str, choices: list[str]) -> None:
        super().__init__(reason)
        self.reason = reason
        self.choices = choices


class StageError(Exception):
    """A stage failed for a reason the user can read as it is."""


@dataclass
class StageContext:
    input_folder: str
    work_dir: str
    output_dir: str
    ffmpeg: FfmpegRunner
    log: Callable[[str], None]
    fit: str = "crop"


class Stage(Protocol):
    key: str
    title: str
    settings_model: type[CamelModel]
    transitions: dict[Kind, Kind]
    position: Literal["first", "last", "any"]

    def run(self, data: StageData, settings: CamelModel, ctx: StageContext) -> StageData: ...

from __future__ import annotations

from typing import Literal

from pydantic import Field, model_validator

from collector_server.shared.camel_model import CamelModel

Kind = Literal["none", "pieces", "video"]


class Piece(CamelModel):
    clip: str
    clip_duration: float = Field(gt=0, allow_inf_nan=False)
    start: float = Field(0.0, ge=0, allow_inf_nan=False)
    end: float | None = Field(None, allow_inf_nan=False)

    @model_validator(mode="after")
    def _end_after_start(self) -> Piece:
        end = self.clip_duration if self.end is None else self.end
        if end <= self.start or end > self.clip_duration:
            raise ValueError("A piece must start and end inside its clip")
        return self

    @property
    def length(self) -> float:
        return (self.end if self.end is not None else self.clip_duration) - self.start


class PiecesData(CamelModel):
    items: list[Piece]
    kind: Literal["pieces"] = "pieces"

    @property
    def total(self) -> float:
        return sum(piece.length for piece in self.items)


class VideoData(CamelModel):
    path: str
    duration: float = Field(ge=0, allow_inf_nan=False)
    size_bytes: int = Field(ge=0)
    attempts: int = Field(1, ge=1)  # how many encodes made this file (the render stage may encode twice to fit its limit)
    kind: Literal["video"] = "video"


StageData = PiecesData | VideoData | None

from __future__ import annotations

import os
import random
from typing import Literal

from pydantic import Field

from collector_server.shared.camel_model import CamelModel

from ..ffmpeg import FfmpegError
from ..pieces import Piece, PiecesData
from ..stage_api import StageContext, StageError


class OrderSettings(CamelModel):
    order_by: Literal["capture_time", "created", "name", "duration", "random"] = Field("capture_time", title="Order by", description="What the clips are sorted by.")
    direction: Literal["oldest_first", "newest_first"] = Field("oldest_first", title="Direction", description="Oldest first puts the earliest clip at the start.")
    seed: int = Field(0, title="Random seed", description="The same seed gives the same random order every time.")
    fallback: Literal["modified", "name", "none"] = Field("modified", title="When there is no capture time", description="Clips without a capture time go after the others, sorted by this.")


class OrderClips:
    key = "order_clips"
    title = "Order clips"
    description = "Sorts the clips by capture time, name, duration or at random."
    settings_model = OrderSettings
    transitions = {"pieces": "pieces"}
    position = "any"

    def run(self, data: PiecesData, settings: OrderSettings, ctx: StageContext) -> PiecesData:
        items = sorted(data.items, key=lambda piece: piece.clip)  # a steady start, so ties and seeds repeat
        if settings.order_by == "random":
            random.Random(settings.seed).shuffle(items)
        else:
            try:
                key = self._key(settings.order_by, settings.fallback, ctx)
                keyed = [(key(piece), piece) for piece in items]  # each key read once, so capture times are not probed twice
                items = []
                for group in sorted({pair[0][0] for pair in keyed}):  # clips with a capture time stay ahead of the rest
                    part = sorted((pair for pair in keyed if pair[0][0] == group), key=lambda pair: pair[0][1], reverse=settings.direction == "newest_first")
                    items += [piece for _, piece in part]
            except FileNotFoundError as error:
                raise StageError(f"{error.filename} is no longer there") from error
        ctx.log(f"Ordered {len(items)} clips by {settings.order_by.replace('_', ' ')}")
        return PiecesData(items=items)

    @staticmethod
    def _key(order_by: str, fallback: str, ctx: StageContext):
        if order_by == "name":
            return lambda piece: (0, os.path.basename(piece.clip).lower())
        if order_by == "duration":
            return lambda piece: (0, piece.clip_duration)
        if order_by == "created":
            return lambda piece: (0, _created(piece.clip))
        return lambda piece: _captured(piece, fallback, ctx)


def _captured(piece: Piece, fallback: str, ctx: StageContext) -> tuple:
    """(group, value). Clips with a capture time are group 0; clips without one are group 1, ordered by the fallback."""
    try:
        tagged = ctx.ffmpeg.capture_time(piece.clip)
    except FfmpegError:
        tagged = None
    if tagged is not None:
        return (0, tagged)
    if fallback == "modified":
        return (1, os.path.getmtime(piece.clip))
    if fallback == "name":
        return (1, os.path.basename(piece.clip).lower())
    return (1, 0.0)


def _created(path: str) -> float:
    stat = os.stat(path)
    return getattr(stat, "st_birthtime", stat.st_mtime)


STAGE = OrderClips()

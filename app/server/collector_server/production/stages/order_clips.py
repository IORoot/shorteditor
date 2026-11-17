from __future__ import annotations

import os
import random
from typing import Literal

from collector_server.shared.camel_model import CamelModel

from ..ffmpeg import FfmpegError
from ..pieces import Piece, PiecesData
from ..stage_api import StageContext, StageError


class OrderSettings(CamelModel):
    order_by: Literal["capture_time", "created", "name", "duration", "random"] = "capture_time"
    direction: Literal["oldest_first", "newest_first"] = "oldest_first"
    seed: int = 0


class OrderClips:
    key = "order_clips"
    title = "Order clips"
    settings_model = OrderSettings
    transitions = {"pieces": "pieces"}
    position = "any"

    def run(self, data: PiecesData, settings: OrderSettings, ctx: StageContext) -> PiecesData:
        items = sorted(data.items, key=lambda piece: piece.clip)  # a steady start, so ties and seeds repeat
        if settings.order_by == "random":
            random.Random(settings.seed).shuffle(items)
        else:
            try:
                items.sort(key=self._key(settings.order_by, ctx), reverse=settings.direction == "newest_first")
            except FileNotFoundError as error:
                raise StageError(f"{error.filename} is no longer there") from error
        ctx.log(f"Ordered {len(items)} clips by {settings.order_by.replace('_', ' ')}")
        return PiecesData(items=items)

    @staticmethod
    def _key(order_by: str, ctx: StageContext):
        if order_by == "name":
            return lambda piece: os.path.basename(piece.clip).lower()
        if order_by == "duration":
            return lambda piece: piece.clip_duration
        if order_by == "created":
            return lambda piece: _created(piece.clip)
        return lambda piece: _captured(piece, ctx)


def _captured(piece: Piece, ctx: StageContext) -> float:
    try:
        tagged = ctx.ffmpeg.capture_time(piece.clip)
    except FfmpegError:
        tagged = None
    return tagged if tagged is not None else os.path.getmtime(piece.clip)


def _created(path: str) -> float:
    stat = os.stat(path)
    return getattr(stat, "st_birthtime", stat.st_mtime)


STAGE = OrderClips()

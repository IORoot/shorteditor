from __future__ import annotations

import os

from pydantic import Field

from collector_server.shared.camel_model import CamelModel

from ..pieces import Piece, PiecesData
from ..stage_api import StageContext, StageError


class TrimRange(CamelModel):
    start: float = Field(ge=0, allow_inf_nan=False)
    end: float = Field(gt=0, allow_inf_nan=False)


class TrimSettings(CamelModel):
    # Keyed by the clip's file name, as the card's scan lists it. A clip with no trims keeps its AI parts.
    trims: dict[str, list[TrimRange]] = {}


class ApplyTrims:
    key = "apply_trims"
    title = "Apply my trims"
    description = "Replaces a clip's parts with the trims the user set by hand."
    settings_model = TrimSettings
    transitions = {"pieces": "pieces"}
    position = "any"

    def run(self, data: PiecesData, settings: TrimSettings, ctx: StageContext) -> PiecesData:
        names = {os.path.basename(piece.clip) for piece in data.items}
        for name, ranges in settings.trims.items():
            if ranges and name not in names:
                ctx.log(f"Skipped the trims of {name}: it is not in this card")
        items: list[Piece] = []
        trimmed = 0
        for piece in data.items:
            ranges = settings.trims.get(os.path.basename(piece.clip))
            if not ranges:
                items.append(piece)
                continue
            trimmed += 1
            items += [Piece(clip=piece.clip, clip_duration=piece.clip_duration, start=r.start, end=r.end) for r in sorted(ranges, key=lambda r: r.start)]
        if not items:
            raise StageError("No clips are left after your trims. Keep at least one part")
        if trimmed:
            ctx.log(f"Applied my trims to {trimmed} clip{'s' if trimmed != 1 else ''}")
        return PiecesData(items=items)


STAGE = ApplyTrims()

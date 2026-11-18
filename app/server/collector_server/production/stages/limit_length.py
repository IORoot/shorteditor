from __future__ import annotations

from typing import Literal

from pydantic import Field

from collector_server.shared.camel_model import CamelModel

from ..pieces import Piece, PiecesData
from ..stage_api import BlockedError, StageContext

_EPSILON = 0.001
_SLIVER = 0.05
CHOICES = ["drop_shortest", "keep_first"]


class LimitSettings(CamelModel):
    max_seconds: float = Field(900.0, ge=1, allow_inf_nan=False, title="Max length (seconds)", description="The video is cut to this length.")
    choice: Literal["drop_shortest", "keep_first"] | None = Field(None, title="When it is over the limit", description="What to drop when the batch is too long. Ask me stops the batch so you choose.")
    trim_from: Literal["end", "start"] = Field("end", title="Keep first trims from", description="When the last clip is cut to fit, which end of it goes.")


class LimitLength:
    key = "limit_length"
    title = "Limit length"
    description = "Stops the video going over a time limit. You choose what to drop when a batch runs long."
    settings_model = LimitSettings
    transitions = {"pieces": "pieces"}
    position = "any"

    def run(self, data: PiecesData, settings: LimitSettings, ctx: StageContext) -> PiecesData:
        total, limit = data.total, settings.max_seconds
        if total <= limit + _EPSILON:
            return data
        if settings.choice is None:
            raise BlockedError(f"The video is {total:.0f} s, {max(1, round(total - limit))} s over the {limit:.0f} s limit", list(CHOICES))
        items = self._drop_shortest(data.items, limit) if settings.choice == "drop_shortest" else list(data.items)
        result = self._keep_first(items, limit, settings.trim_from)
        ctx.log(f"Cut {total:.0f} s down to {result.total:.0f} s ({settings.choice.replace('_', ' ')})")
        return result

    @staticmethod
    def _drop_shortest(items: list[Piece], limit: float) -> list[Piece]:
        items = list(items)
        while len(items) > 1 and sum(p.length for p in items) > limit + _EPSILON:
            shortest = min(range(len(items)), key=lambda i: (items[i].length, -i))
            del items[shortest]
        return items

    @staticmethod
    def _keep_first(items: list[Piece], limit: float, trim_from: str) -> PiecesData:
        kept: list[Piece] = []
        left = limit
        for piece in items:
            if piece.length <= left + _EPSILON:
                kept.append(piece)
                left -= piece.length
            elif left >= _SLIVER:
                if trim_from == "start":
                    stop = piece.end if piece.end is not None else piece.clip_duration
                    kept.append(piece.model_copy(update={"start": stop - left}))
                else:
                    kept.append(piece.model_copy(update={"end": piece.start + left}))
                break
            else:
                break
        return PiecesData(items=kept)


STAGE = LimitLength()

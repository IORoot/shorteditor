from __future__ import annotations

from pydantic import Field

from collector_server.shared.camel_model import CamelModel

from ..pieces import PiecesData
from ..stage_api import BlockedError, StageContext, StageError


class ReviewSettings(CamelModel):
    # Set by the user from the blocked pass; None means the batch has not been reviewed yet.
    picks: list[int] | None = Field(None, title="Clips picked")


class ReviewByHand:
    key = "review_by_hand"
    title = "Review by hand"
    description = "Stops the batch so you can pick which clips to keep."
    settings_model = ReviewSettings
    transitions = {"pieces": "pieces"}
    position = "any"

    def run(self, data: PiecesData, settings: ReviewSettings, ctx: StageContext) -> PiecesData:
        if settings.picks is None:
            names = [f"{piece.clip.rsplit('/', 1)[-1]} ({piece.length:.1f} s)" for piece in data.items]
            raise BlockedError("Pick the clips to keep", ["Keep the picked clips"], names)
        kept = [data.items[i] for i in sorted(set(settings.picks)) if 0 <= i < len(data.items)]  # keeps the pipeline's order
        if not kept:
            raise StageError("No clips were picked. Pick at least one clip")
        ctx.log(f"Kept {len(kept)} of {len(data.items)} clips by hand")
        return PiecesData(items=kept)


STAGE = ReviewByHand()

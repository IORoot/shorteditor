from __future__ import annotations

import os

from .pieces import PiecesData, VideoData


def describe(key: str, before, after, settings, ffmpeg) -> dict | None:  # noqa: ANN001
    """What a finished stage made. Clip lists are the clips in their final order, with their in-clip times.

    Limit length also says what the batch was before the cut and what it was cut to. A video says what it is:
    its size, length and picture; the join also says the picture it was shaped to.
    """
    if isinstance(after, PiecesData):
        details: dict = {
            "kind": "clips",
            "clips": [
                {"name": os.path.basename(piece.clip), "start": piece.start, "end": piece.end if piece.end is not None else piece.clip_duration, "length": piece.length}
                for piece in after.items
            ],
            "total": after.total,
        }
        if key == "limit_length":
            details.update(before=before.total if isinstance(before, PiecesData) else None, limit=settings.max_seconds, choice=settings.choice)
        return details
    if isinstance(after, VideoData):
        details = {"kind": "video", "name": os.path.basename(after.path), "duration": after.duration, "sizeBytes": after.size_bytes, **ffmpeg.video_info(after.path)}
        if key == "join_pieces":
            details["target"] = {"width": settings.width, "height": settings.height, "fps": settings.fps}
        if key == "render_output":
            details["attempts"] = after.attempts
        return details
    return None

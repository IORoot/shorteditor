from __future__ import annotations

import os
from typing import Literal

from pydantic import Field

from collector_server.shared.camel_model import CamelModel

from ..pieces import Piece, PiecesData, VideoData
from ..stage_api import StageContext, StageError

_FIT = {
    "crop": "[0:v]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h}[fit]",
    "blur": (
        "[0:v]split[bg][fg];"
        "[bg]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},boxblur=20:5[b];"
        "[fg]scale={w}:{h}:force_original_aspect_ratio=decrease[f];"
        "[b][f]overlay=(W-w)/2:(H-h)/2[fit]"
    ),
}


class JoinSettings(CamelModel):
    width: int = Field(1080, ge=16, le=7680, multiple_of=2)
    height: int = Field(1920, ge=16, le=7680, multiple_of=2)
    fps: int = Field(30, ge=1, le=120)
    fit: Literal["crop", "blur"] = "crop"


class JoinPieces:
    """Cuts every piece to the same shape, then joins the pieces.

    One file at a time keeps it working for hundreds of clips: no giant filter graph and
    no hundreds of files open at once. Segments keep the sound as PCM and the sound is
    encoded once at the end, because separately encoded AAC pieces gain a little extra
    audio at every join and drift out of sync.
    """

    key = "join_pieces"
    title = "Join in order"
    settings_model = JoinSettings
    transitions = {"pieces": "video"}
    position = "any"

    def run(self, data: PiecesData, settings: JoinSettings, ctx: StageContext) -> VideoData:
        if not data.items:
            raise StageError("There is nothing to join")
        segments = []
        for number, piece in enumerate(data.items, start=1):
            segment = os.path.join(ctx.work_dir, f"segment_{number:05d}.mkv")
            self._cut(piece, segment, settings, ctx)
            segments.append(segment)
            ctx.log(f"Prepared piece {number}/{len(data.items)}")
        listing = os.path.join(ctx.work_dir, "segments.txt")
        with open(listing, "w", encoding="utf-8") as handle:
            handle.writelines("file '" + path.replace("'", "'\\''") + "'\n" for path in segments)
        joined = os.path.join(ctx.work_dir, "joined.mp4")
        ctx.ffmpeg.run(["-f", "concat", "-safe", "0", "-i", listing, "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", joined])
        for path in [*segments, listing]:
            os.remove(path)
        return VideoData(path=joined, duration=ctx.ffmpeg.duration(joined), size_bytes=os.path.getsize(joined))

    @staticmethod
    def _cut(piece: Piece, out: str, settings: JoinSettings, ctx: StageContext) -> None:
        shape = _FIT[settings.fit].format(w=settings.width, h=settings.height)
        graph = f"{shape};[fit]fps={settings.fps},setsar=1,format=yuv420p[v]"
        args = ["-ss", f"{piece.start:.3f}", "-i", piece.clip]
        if ctx.ffmpeg.has_audio(piece.clip):
            # apad: a clip whose sound stops early still gets sound for its whole length
            graph += ";[0:a:0]aresample=48000,apad,aformat=channel_layouts=stereo[a]"
        else:
            args += ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=stereo"]
            graph += ";[1:a]aformat=channel_layouts=stereo[a]"
        args += [
            "-t", f"{piece.length:.3f}", "-filter_complex", graph, "-map", "[v]", "-map", "[a]",
            "-c:v", "libx264", "-crf", "18", "-preset", "veryfast", "-c:a", "pcm_s16le", out,
        ]
        ctx.ffmpeg.run(args)


STAGE = JoinPieces()

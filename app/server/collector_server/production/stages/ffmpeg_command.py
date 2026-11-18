from __future__ import annotations

import os
from typing import Literal

from pydantic import Field

from collector_server.shared.camel_model import CamelModel

from ..ffmpeg_options import check_options, fill_placeholders, split_options
from ..pieces import Piece, PiecesData, VideoData
from ..stage_api import StageContext, StageError


class FfmpegSettings(CamelModel):
    run_on: Literal["each_clip", "joined_video"] = Field("each_clip", title="Run on", description="Each clip runs the options on its own. Joined video runs them once on the whole video.")
    options: str = Field("-c:a copy", max_length=1000, title="FFmpeg options", description="Options such as -vf or -c:a. Use {input} and {output} for the files. Options that read or write other files are refused.")


class FfmpegCommand:
    key = "ffmpeg"
    title = "FFmpeg"
    description = "Runs your own FFmpeg options on each clip, or on the joined video. Options that read or write other files are refused."
    settings_model = FfmpegSettings
    transitions = {"pieces": "pieces", "video": "video"}
    position = "any"

    def run(self, data: PiecesData | VideoData, settings: FfmpegSettings, ctx: StageContext) -> PiecesData | VideoData:
        args = split_options(settings.options)
        check_options(args)  # refused before FFmpeg is called at all
        if settings.run_on == "each_clip":
            if not isinstance(data, PiecesData):
                raise StageError("FFmpeg on each clip needs clips. Put it before Join clips, or run it on the joined video")
            return self._each_clip(data, args, ctx)
        if not isinstance(data, VideoData):
            raise StageError("FFmpeg on the joined video needs a joined video. Put it after Join clips")
        return self._joined(data, args, ctx)

    @staticmethod
    def _each_clip(data: PiecesData, args: list[str], ctx: StageContext) -> PiecesData:
        items: list[Piece] = []
        for number, piece in enumerate(data.items):
            output = os.path.join(ctx.work_dir, f"ffmpeg-{number}.mp4")
            ctx.ffmpeg.run(["-ss", f"{piece.start}", "-t", f"{piece.length}", "-i", piece.clip, *fill_placeholders(args, piece.clip, output), output])
            items.append(Piece(clip=output, clip_duration=ctx.ffmpeg.duration(output)))
        ctx.log(f"Ran FFmpeg on {len(items)} clips")
        return PiecesData(items=items)

    @staticmethod
    def _joined(data: VideoData, args: list[str], ctx: StageContext) -> VideoData:
        output = os.path.join(ctx.work_dir, "ffmpeg-joined.mp4")
        ctx.ffmpeg.run(["-i", data.path, *fill_placeholders(args, data.path, output), output])
        ctx.log("Ran FFmpeg on the joined video")
        return VideoData(path=output, duration=ctx.ffmpeg.duration(output), size_bytes=os.path.getsize(output))


STAGE = FfmpegCommand()

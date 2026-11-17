from __future__ import annotations

import os

from pydantic import Field

from collector_server.shared.camel_model import CamelModel

from ..pieces import VideoData
from ..stage_api import StageContext, StageError

_MIN_VIDEO_BITRATE = 300_000
_SAFETY = 0.95  # leave room for the container and for the encoder missing its target


class RenderSettings(CamelModel):
    fps: int = Field(30, ge=1, le=120)
    audio_kbps: int = Field(128, ge=32, le=512)
    max_size_mb: float | None = Field(50.0, gt=0, le=100_000, allow_inf_nan=False)
    file_name: str = Field("output.mp4", pattern=r"^[A-Za-z0-9_][A-Za-z0-9 ._-]{0,100}\.mp4$")


def target_video_bitrate(max_size_mb: float, duration: float, audio_kbps: int) -> int:
    """The video bitrate (bits per second) that keeps the whole file under the size limit.

    Megabytes are decimal (the safe reading of "50 MB"). The encoder may run one second of
    video bitrate over (its rate buffer), so that second is part of the budget.
    """
    budget = max_size_mb * 1_000_000 * 8 * _SAFETY
    return int((budget - audio_kbps * 1000 * duration) / (duration + 1))


class RenderOutput:
    key = "render_output"
    title = "Render"
    settings_model = RenderSettings
    transitions = {"video": "video"}
    position = "last"

    def run(self, data: VideoData, settings: RenderSettings, ctx: StageContext) -> VideoData:
        if data.duration <= 0:
            raise StageError("The video has no length")
        quality = ["-crf", "20"]
        if settings.max_size_mb is not None:
            bitrate = target_video_bitrate(settings.max_size_mb, data.duration, settings.audio_kbps)
            if bitrate < _MIN_VIDEO_BITRATE:
                raise StageError(f"A {settings.max_size_mb:g} MB limit is too small for a {data.duration:.0f} s video")
            quality = ["-b:v", str(bitrate), "-maxrate", str(bitrate), "-bufsize", str(bitrate)]
            ctx.log(f"Rendering at {bitrate // 1000} kbps to stay under {settings.max_size_mb:g} MB")
        os.makedirs(ctx.output_dir, exist_ok=True)
        out = os.path.join(ctx.output_dir, settings.file_name)
        ctx.ffmpeg.run([
            "-i", data.path, "-vf", f"fps={settings.fps}", "-c:v", "libx264", "-preset", "medium", *quality,
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", f"{settings.audio_kbps}k", "-movflags", "+faststart", out,
        ])
        return VideoData(path=out, duration=ctx.ffmpeg.duration(out), size_bytes=os.path.getsize(out))


STAGE = RenderOutput()

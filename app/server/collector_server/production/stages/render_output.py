from __future__ import annotations

import os
from typing import Literal

from pydantic import Field

from collector_server.shared.camel_model import CamelModel

from ..pieces import VideoData
from ..stage_api import StageContext, StageError

_MIN_VIDEO_BITRATE = 300_000
_SAFETY = 0.95  # leave room for the container and for the encoder missing its target


_SOCIAL_FPS = 30
_SOCIAL_AUDIO_KBPS = 128
# Under a size limit, "better" uses the whole budget (it cannot go over the limit); "smaller" leaves room.
_BITRATE_FACTOR = {"smaller": 0.7, "balanced": 1.0, "better": 1.0}
_CRF = {"smaller": "23", "balanced": "20", "better": "17"}


class RenderSettings(CamelModel):
    preset: Literal["social", "custom"] = Field("social", title="Preset")
    quality: Literal["smaller", "balanced", "better"] = Field("balanced", title="Quality")
    fps: int = Field(30, ge=1, le=120, title="Frame rate")
    audio_kbps: int = Field(128, ge=32, le=512, title="Audio (kbps)")
    max_size_mb: float | None = Field(150.0, gt=0, le=100_000, allow_inf_nan=False, title="Max size (MB)")
    file_name: str = Field("output.mp4", pattern=r"^[A-Za-z0-9_][A-Za-z0-9 ._-]{0,100}\.mp4$", title="File name")


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
    description = "Encodes the finished video within the size and format you choose."
    settings_model = RenderSettings
    transitions = {"video": "video"}
    position = "last"

    def run(self, data: VideoData, settings: RenderSettings, ctx: StageContext) -> VideoData:
        if data.duration <= 0:
            raise StageError("The video has no length")
        fps, audio_kbps = (_SOCIAL_FPS, _SOCIAL_AUDIO_KBPS) if settings.preset == "social" else (settings.fps, settings.audio_kbps)
        quality = ["-crf", _CRF[settings.quality]]
        if settings.max_size_mb is not None:
            base = target_video_bitrate(settings.max_size_mb, data.duration, audio_kbps)
            if base < _MIN_VIDEO_BITRATE:
                raise StageError(f"A {settings.max_size_mb:g} MB limit is too small for a {data.duration:.0f} s video")
            bitrate = int(base * _BITRATE_FACTOR[settings.quality])
            quality = ["-b:v", str(bitrate), "-maxrate", str(bitrate), "-bufsize", str(bitrate)]
            ctx.log(f"Rendering at {bitrate // 1000} kbps to stay under {settings.max_size_mb:g} MB")
        os.makedirs(ctx.output_dir, exist_ok=True)
        out = os.path.join(ctx.output_dir, settings.file_name)
        ctx.ffmpeg.run([
            "-i", data.path, "-vf", f"fps={fps}", "-c:v", "libx264", "-preset", "medium", *quality,
            "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", f"{audio_kbps}k", "-movflags", "+faststart", out,
        ])
        return VideoData(path=out, duration=ctx.ffmpeg.duration(out), size_bytes=os.path.getsize(out))


STAGE = RenderOutput()

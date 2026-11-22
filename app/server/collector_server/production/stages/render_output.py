from __future__ import annotations

import contextlib
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
    preset: Literal["social", "custom"] = Field("social", title="Preset", description="Social uses 30 frames a second and 128 kbps audio. Custom uses the two values below.")
    quality: Literal["smaller", "balanced", "better"] = Field("balanced", title="Quality", description="Smaller gives a smaller file. Better uses the whole size limit.")
    fps: int = Field(30, ge=1, le=120, title="Frame rate", description="Used by the Custom preset.")
    audio_kbps: int = Field(128, ge=32, le=512, title="Audio bitrate (kbps)", description="Used by the Custom preset.")
    max_size_mb: float | None = Field(150.0, gt=0, le=100_000, allow_inf_nan=False, title="Max file size (MB)", description="Leave empty for no limit.")
    file_name: str = Field("output.mp4", pattern=r"^[A-Za-z0-9_][A-Za-z0-9 ._-]{0,100}\.mp4$", title="File name", description="The name of the finished video. It must end in .mp4.")


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
        bitrate = None
        if settings.max_size_mb is not None:
            base = target_video_bitrate(settings.max_size_mb, data.duration, audio_kbps)
            if base < _MIN_VIDEO_BITRATE:
                raise StageError(f"A {settings.max_size_mb:g} MB limit is too small for a {data.duration:.0f} s video")
            bitrate = int(base * _BITRATE_FACTOR[settings.quality])
            ctx.log(f"Rendering at {bitrate // 1000} kbps to stay under {settings.max_size_mb:g} MB")
        os.makedirs(ctx.output_dir, exist_ok=True)
        out = os.path.join(ctx.output_dir, settings.file_name)
        attempts = 1
        size = self._encode(data, ctx, out, fps, audio_kbps, bitrate, quality)
        limit = None if settings.max_size_mb is None else int(settings.max_size_mb * 1_000_000)
        if limit is not None and size > limit:
            # The first encode missed the limit: scale the bitrate by how far over it was, and try once more.
            bitrate = int(bitrate * limit / size * _SAFETY)
            if bitrate < _MIN_VIDEO_BITRATE:
                raise StageError(f"Rendered {_mb(size)} MB, over the {settings.max_size_mb:g} MB limit, and too large to shrink to fit")
            ctx.log(f"Rendered {_mb(size)} MB, over the {settings.max_size_mb:g} MB limit: re-rendering once at {bitrate // 1000} kbps")
            attempts = 2
            size = self._encode(data, ctx, out, fps, audio_kbps, bitrate, quality)
            if size > limit:
                with contextlib.suppress(OSError):  # an over-limit video is not kept as a result
                    os.remove(out)
                raise StageError(f"Rendered {_mb(size)} MB, over the {settings.max_size_mb:g} MB limit, even after one re-render")
        return VideoData(path=out, duration=ctx.ffmpeg.duration(out), size_bytes=size, attempts=attempts)

    @staticmethod
    def _encode(data: VideoData, ctx: StageContext, out: str, fps: int, audio_kbps: int, bitrate: int | None, quality: list[str]) -> int:
        if bitrate is not None:
            quality = ["-b:v", str(bitrate), "-maxrate", str(bitrate), "-bufsize", str(bitrate)]
        try:
            ctx.ffmpeg.run([
                "-i", data.path, "-vf", f"fps={fps}", "-c:v", "libx264", "-preset", "medium", *quality,
                "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", f"{audio_kbps}k", "-movflags", "+faststart", out,
            ])
        except BaseException:
            with contextlib.suppress(OSError):  # a half-written video is never kept as a result
                os.remove(out)
            raise
        return os.path.getsize(out)


def _mb(size_bytes: int) -> str:
    return f"{size_bytes / 1_000_000:.1f}"


STAGE = RenderOutput()

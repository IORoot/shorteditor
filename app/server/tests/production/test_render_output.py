import os

import pytest

from collector_server.production.pieces import VideoData
from collector_server.production.stage_api import StageError
from collector_server.production.stages.render_output import STAGE, target_video_bitrate
from tests.production.helpers import make_clip, make_ctx, probe, requires_ffmpeg


def video_of(tmp_path, seconds, **kw):
    path = make_clip(tmp_path / "joined.mp4", seconds=seconds, **kw)
    return VideoData(path=path, duration=float(seconds), size_bytes=os.path.getsize(path))


def render(tmp_path, video, **settings):
    return STAGE.run(video, STAGE.settings_model(**settings), make_ctx(tmp_path))


def test_target_bitrate_formula():
    # decimal megabytes, 95% of the budget; the encoder's one-second rate buffer may add one more second of video
    assert target_video_bitrate(50, 60, 128) == int((50_000_000 * 8 * 0.95 - 128_000 * 60) / 61)


def test_zero_length_video_fails_plainly(tmp_path):
    video = VideoData(path=str(tmp_path / "x.mp4"), duration=0, size_bytes=0)
    with pytest.raises(StageError, match="no length"):
        render(tmp_path, video, max_size_mb=5)


@requires_ffmpeg
def test_short_noisy_video_stays_under_the_limit_exactly(tmp_path):
    import subprocess

    from tests.production.helpers import FFMPEG

    noise = tmp_path / "noise.mp4"
    subprocess.run([FFMPEG, "-v", "error", "-y", "-f", "lavfi", "-i", "nullsrc=s=540x960:r=30:d=6,geq=random(1)*255:128:128", "-f", "lavfi", "-i", "sine=duration=6", "-c:v", "libx264", "-crf", "10", "-c:a", "aac", "-shortest", str(noise)], check=True)
    video = VideoData(path=str(noise), duration=6.0, size_bytes=os.path.getsize(noise))
    result = render(tmp_path, video, max_size_mb=0.9)
    assert result.size_bytes <= 0.9 * 1_000_000


@requires_ffmpeg
def test_render_without_limit_writes_output(tmp_path):
    result = render(tmp_path, video_of(tmp_path, 2), max_size_mb=None, file_name="reel.mp4")
    assert result.path == str(tmp_path / "out" / "reel.mp4")
    assert result.size_bytes == os.path.getsize(result.path) > 0
    assert abs(result.duration - 2.0) < 0.3
    assert probe(result.path, "stream=codec_name", "v") == "h264"
    assert probe(result.path, "stream=codec_name", "a") == "aac"


@requires_ffmpeg
def test_render_respects_size_limit(tmp_path):
    result = render(tmp_path, video_of(tmp_path, 10, width=720, height=1280), max_size_mb=1)
    assert result.size_bytes <= 1_000_000


@requires_ffmpeg
def test_render_creates_the_output_folder(tmp_path):
    ctx = make_ctx(tmp_path)
    os.rmdir(ctx.output_dir)
    result = STAGE.run(video_of(tmp_path, 1), STAGE.settings_model(max_size_mb=None), ctx)
    assert os.path.exists(result.path)


def test_unusable_limit_fails_plainly(tmp_path):
    video = VideoData(path=str(tmp_path / "x.mp4"), duration=3600, size_bytes=1)
    with pytest.raises(StageError, match="too small"):
        render(tmp_path, video, max_size_mb=1)


@pytest.mark.parametrize("name", ["../x.mp4", "a/b.mp4", "plain", "x.mov", ""])
def test_file_name_must_be_a_plain_mp4_name(name):
    with pytest.raises(ValueError):
        STAGE.settings_model(file_name=name)


def test_size_limit_must_be_positive():
    with pytest.raises(ValueError):
        STAGE.settings_model(max_size_mb=0)

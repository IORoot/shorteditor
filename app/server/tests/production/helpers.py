from __future__ import annotations

import os
import subprocess

import pytest

from collector_server.production.ffmpeg import _binary
from collector_server.shared.camel_model import CamelModel


class NoSettings(CamelModel):
    pass


class FakeStage:
    settings_model = NoSettings

    def __init__(self, key, title, transitions, position="any"):
        self.key = key
        self.title = title
        self.transitions = transitions
        self.position = position

    def run(self, data, settings, ctx):
        return data


def fake_registry():
    from collector_server.production.registry import StageRegistry

    registry = StageRegistry()
    registry.register(FakeStage("scan", "Scan folder", {"none": "pieces"}, "first"))
    registry.register(FakeStage("order", "Order clips", {"pieces": "pieces"}))
    registry.register(FakeStage("join", "Join in order", {"pieces": "video"}))
    registry.register(FakeStage("render", "Render", {"video": "video"}, "last"))
    return registry


FFMPEG = _binary("ffmpeg")
requires_ffmpeg = pytest.mark.skipif(not os.path.exists(FFMPEG), reason="ffmpeg not installed")


def make_clip(path, seconds=2.0, width=320, height=180, audio=True, creation_time=None, audio_seconds=None):
    """Write a small real test clip with FFmpeg."""
    args = [FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", f"testsrc2=size={width}x{height}:rate=30:duration={seconds}"]
    if audio:
        args += ["-f", "lavfi", "-i", f"sine=frequency=440:duration={audio_seconds or seconds}"]
    args += ["-c:v", "libx264", "-pix_fmt", "yuv420p"]
    if audio:
        args += ["-c:a", "aac"]
    if creation_time:
        args += ["-metadata", f"creation_time={creation_time}"]
    args.append(str(path))
    subprocess.run(args, check=True)
    return str(path)


def make_ctx(tmp_path, input_folder=None, log=None, worker=None):
    """A StageContext wired to a real local FFmpeg runner."""
    from collector_server.production.ffmpeg import FfmpegRunner
    from collector_server.production.stage_api import StageContext
    from collector_server.production.worker import LocalWorker

    lines = log if log is not None else []
    work = tmp_path / "work"
    work.mkdir(exist_ok=True)
    out = tmp_path / "out"
    out.mkdir(exist_ok=True)
    return StageContext(
        input_folder=str(input_folder or tmp_path / "in"),
        work_dir=str(work),
        output_dir=str(out),
        ffmpeg=FfmpegRunner(worker or LocalWorker(), lines.append),
        log=lines.append,
    )


class FakeWorker:
    id = "fake"

    def __init__(self, lines=(), code=0, error=None):
        self.lines, self.code, self.error = list(lines), code, error
        self.argv = None

    def run(self, argv, on_line):
        self.argv = argv
        if self.error:
            raise self.error
        for line in self.lines:
            on_line(line)
        return self.code


def probe(path, entries, stream=None):
    """Read values with ffprobe, e.g. probe(p, 'stream=width,height', 'v:0')."""
    args = [_binary("ffprobe"), "-v", "error"]
    if stream:
        args += ["-select_streams", stream]
    args += ["-show_entries", entries, "-of", "csv=p=0", str(path)]
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout.strip()


def rotate_metadata(source, target, degrees=90):
    """Copy a clip and tag it as rotated, as phones do."""
    subprocess.run([FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-display_rotation", str(degrees), "-i", str(source), "-c", "copy", str(target)], check=True)
    return str(target)


class FakePipelines:
    """Stands in for Pipeline's PipelineSource. Pipeline 1 is switched on with the Join steps."""

    def __init__(self, pipelines=None):
        from collector_server.production.stage_api import StageStep
        from collector_server.shared.pipeline import PipelineRef

        join = [StageStep(key=k) for k in ["scan_folder", "order_clips", "limit_length", "join_pieces", "render_output"]]
        self.pipelines = pipelines if pipelines is not None else {1: PipelineRef(id=1, name="Join clips", enabled=True, steps=join)}

    def get_pipeline(self, pipeline_id):
        return self.pipelines.get(pipeline_id)

    def enabled_pipelines(self):
        return [p for p in self.pipelines.values() if p.enabled]

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


def make_clip(path, seconds=2.0, width=320, height=180, audio=True, creation_time=None):
    """Write a small real test clip with FFmpeg."""
    args = [FFMPEG, "-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", f"testsrc2=size={width}x{height}:rate=30:duration={seconds}"]
    if audio:
        args += ["-f", "lavfi", "-i", f"sine=frequency=440:duration={seconds}"]
    args += ["-c:v", "libx264", "-pix_fmt", "yuv420p"]
    if audio:
        args += ["-c:a", "aac"]
    if creation_time:
        args += ["-metadata", f"creation_time={creation_time}"]
    args.append(str(path))
    subprocess.run(args, check=True)
    return str(path)

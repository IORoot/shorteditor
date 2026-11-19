from __future__ import annotations

import os
import subprocess

from .ffmpeg import _binary

VIDEO_ENDINGS = (".mp4", ".mov")
THUMB_WIDTH = 640


def first_clip(folder: str) -> str | None:
    """The first video in the input folder, in the same order the scan stage uses. Hidden files are skipped."""
    found: list[str] = []
    for root, dirs, files in os.walk(folder):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        found += [os.path.join(root, name) for name in files if not name.startswith(".") and name.lower().endswith(VIDEO_ENDINGS)]
    return min((os.path.abspath(path) for path in found), default=None)


def make_thumbnail(clip: str, target: str) -> bool:
    """Writes one frame, a second in, as a small JPEG. Returns False when no frame could be taken."""
    os.makedirs(os.path.dirname(target), exist_ok=True)
    subprocess.run(
        [_binary("ffmpeg"), "-v", "error", "-y", "-ss", "1", "-i", clip, "-frames:v", "1", "-vf", f"scale={THUMB_WIDTH}:-2", target],
        capture_output=True, timeout=120, check=False,
    )
    return os.path.isfile(target)

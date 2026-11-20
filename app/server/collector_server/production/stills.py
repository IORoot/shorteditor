from __future__ import annotations

import hashlib
import os
import subprocess

from .ffmpeg import _binary
from .thumbnail import VIDEO_ENDINGS

STILL_WIDTH = 320


def still_path(output_root: str, pass_id: int, clip: str, at: float) -> str:
    """The cache file for one frame of one clip. The same clip and time always give the same file."""
    digest = hashlib.sha1(clip.encode()).hexdigest()[:16]
    return os.path.join(output_root, ".thumbnails", f"still-{pass_id}-{digest}-{round(at * 1000)}.jpg")


def find_clip(folder: str, name: str) -> str | None:
    """The first video in the folder, in scan order, whose file name is this one. Hidden folders are skipped."""
    found: list[str] = []
    for root, dirs, files in os.walk(folder):
        dirs[:] = [d for d in dirs if not d.startswith(".")]
        found += [os.path.join(root, file) for file in files if file == name and file.lower().endswith(VIDEO_ENDINGS)]
    return min((os.path.abspath(path) for path in found), default=None)


def make_still(clip_path: str, at: float, target: str) -> bool:
    """Writes the frame at this many seconds as a small JPEG. Seeking happens before the input, so it is quick."""
    os.makedirs(os.path.dirname(target), exist_ok=True)
    subprocess.run(
        [_binary("ffmpeg"), "-v", "error", "-y", "-ss", f"{at:.3f}", "-i", f"file:{clip_path}", "-frames:v", "1", "-vf", f"scale={STILL_WIDTH}:-2", target],
        capture_output=True, timeout=120, check=False,
    )
    return os.path.isfile(target)

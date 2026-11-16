from __future__ import annotations

import os

VIDEO_EXTENSIONS = frozenset({".mp4", ".mov", ".mkv", ".m4v", ".avi", ".mts", ".mxf"})


def is_video(name: str) -> bool:
    return not name.startswith(".") and os.path.splitext(name)[1].lower() in VIDEO_EXTENSIONS

from __future__ import annotations

import hashlib
import json
import os


def cache_key(model: str, prompt: str, fps: float, clip: str, size: int, mtime: float, start: float, end: float) -> str:
    """A key that changes when the model, the prompt, the frame rate, the part or the file itself changes."""
    text = json.dumps([model, prompt, fps, clip, size, mtime, start, end])
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def load(root: str, key: str) -> list[tuple[float, float]] | None:
    try:
        with open(os.path.join(root, key + ".json"), encoding="utf-8") as saved:
            return [(float(start), float(end)) for start, end in json.load(saved)]
    except (OSError, ValueError, TypeError):
        return None


def save(root: str, key: str, parts: list[tuple[float, float]]) -> None:
    os.makedirs(root, exist_ok=True)
    with open(os.path.join(root, key + ".json"), "w", encoding="utf-8") as saved:
        json.dump(parts, saved)

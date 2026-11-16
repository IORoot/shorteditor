from __future__ import annotations

import os
from collections.abc import Iterator


def walk_files(source: str, output: str) -> Iterator[tuple[str, int]]:
    """Every visible file under source, skipping hidden entries and the output folder."""
    skip = os.path.realpath(output) + os.sep if output else None
    for root, dirs, names in os.walk(source, followlinks=False):
        dirs[:] = [d for d in dirs if not d.startswith(".") and not (skip and (os.path.realpath(os.path.join(root, d)) + os.sep).startswith(skip))]
        for name in names:
            if not name.startswith("."):
                path = os.path.join(root, name)
                yield path, os.stat(path).st_size

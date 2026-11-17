from __future__ import annotations

import os
import re

from .models import Batch


def folder_name(batch: Batch) -> str:
    """A safe folder name for a batch: the name with odd characters replaced, plus the id."""
    slug = re.sub(r"[^A-Za-z0-9._-]+", "-", batch.name).strip("-.")[:40] or "batch"
    return f"{slug}-{batch.id}"


def output_paths(batch: Batch, pass_id: int, number: int) -> tuple[str, str]:
    """Where a pass keeps its result, and where it works. The work folder is hidden and sits apart
    from the result, so a crash leaves nothing next to the video."""
    return (
        os.path.join(batch.output_root, folder_name(batch), f"pass-{number}"),
        os.path.join(batch.output_root, ".work", str(pass_id)),
    )

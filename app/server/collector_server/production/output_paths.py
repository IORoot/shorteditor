from __future__ import annotations

import os
import re
import shutil

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


MARKER = ".short-editor-output"


class OutputFolderError(ValueError):
    """The chosen output folder cannot be used, in words the user can act on."""


def check_root(root: str) -> None:
    """An output folder is usable when it is new (its parent exists), empty, or one this app made before.

    Anything else is refused, because the app deletes folders inside its output folder.
    """
    if not os.path.isabs(root):
        raise OutputFolderError("The output folder must be an absolute path")
    real = os.path.realpath(root)
    if real == os.sep:
        raise OutputFolderError("The output folder cannot be the top of the disk")
    if os.path.lexists(root):
        if not os.path.isdir(real):
            raise OutputFolderError(f"{root} is not a folder")
        if os.listdir(real) and not os.path.exists(os.path.join(real, MARKER)):
            raise OutputFolderError(f"{root} already holds other files. Pick a new or empty folder, or one this app made")
    elif not os.path.isdir(os.path.dirname(real)):
        raise OutputFolderError(f"The folder {os.path.dirname(root)} does not exist")


def claim_root(root: str) -> None:
    """Create the output folder if needed and mark it as ours."""
    check_root(root)
    os.makedirs(root, exist_ok=True)
    open(os.path.join(root, MARKER), "a").close()


def remove_inside(root: str, path: str | None) -> None:
    """Delete a folder only if it really sits inside an output folder this app made."""
    if not path or not os.path.lexists(path) or os.path.islink(path):
        return
    base, target = os.path.realpath(root), os.path.realpath(path)
    if target.startswith(base + os.sep) and os.path.exists(os.path.join(base, MARKER)):
        shutil.rmtree(target, ignore_errors=True)

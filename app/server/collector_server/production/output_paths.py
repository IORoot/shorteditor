from __future__ import annotations

import os
import re
import shutil

from .models import DEFAULT_FOLDER_TEMPLATE, Batch

# The tags a folder name template can use: {{name}} the batch name, {{id}} its number, {{date}} the day it was made.
TAGS = ("name", "id", "date")
_TAG = re.compile(r"\{\{\s*(\w+)\s*\}\}")
_LITERAL = re.compile(r"[A-Za-z0-9._-]*")
MAX_TEMPLATE = 100


def check_folder_template(template: str) -> None:
    """A folder name template is usable when it has only known tags, plain characters, and {{id}} so each batch gets its own folder."""
    if not template or len(template) > MAX_TEMPLATE:
        raise OutputFolderError(f"The folder name must be 1 to {MAX_TEMPLATE} characters")
    for key in _TAG.findall(template):
        if key not in TAGS:
            raise OutputFolderError(f"{{{{{key}}}}} is not a tag. Use {', '.join('{{' + t + '}}' for t in TAGS)}")
    if not _LITERAL.fullmatch(_TAG.sub("", template)):
        raise OutputFolderError("The folder name can use letters, numbers, dots, dashes and underscores, and the tags. Remove any other characters")
    if "id" not in _TAG.findall(template):
        raise OutputFolderError("The folder name must use the {{id}} tag, so every batch gets its own folder")


def _safe(text: str, limit: int) -> str:
    return re.sub(r"[^A-Za-z0-9._-]+", "-", text).strip("-.")[:limit]


def folder_name(batch: Batch) -> str:
    """The batch's folder under the output folder, from its template. The name tag is made safe and shortened."""
    def value(match: re.Match) -> str:
        key = match.group(1)
        if key == "name":
            return _safe(batch.name, 40) or "batch"
        if key == "id":
            return str(batch.id)
        return batch.created_at[:10]  # date: the day part of the batch's created time
    return _TAG.sub(value, batch.folder_template or DEFAULT_FOLDER_TEMPLATE).strip("-.") or f"batch-{batch.id}"


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
    else:
        # New folders are fine at any depth: the nearest folder that exists must be a real folder.
        above = os.path.dirname(real)
        while not os.path.lexists(above) and above != os.path.dirname(above):
            above = os.path.dirname(above)
        if not os.path.isdir(above):
            raise OutputFolderError(f"{above} is not a folder, so {root} cannot be created inside it")


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

from __future__ import annotations

import os
from typing import Annotated, Literal

from pydantic import Field, StringConstraints

from collector_server.shared.camel_model import CamelModel

from ..ffmpeg import FfmpegError
from ..pieces import Piece, PiecesData
from ..stage_api import StageContext, StageError


class ScanSettings(CamelModel):
    include_subfolders: bool = Field(True, title="Include subfolders")
    extensions: list[Annotated[str, StringConstraints(pattern=r"^\.?[A-Za-z0-9]{1,10}$")]] = Field(["mp4", "mov"], max_length=20, title="Extensions")
    max_files: int = Field(5000, ge=1, le=100_000, title="Max files")
    min_length: float = Field(1.0, ge=0, allow_inf_nan=False, title="Min length (seconds)")
    name_contains: str = Field("", max_length=100, title="File name contains")
    name_mode: Literal["contains", "not_contains"] = Field("contains", title="File name rule")
    skip_hidden_and_duplicates: bool = Field(True, title="Skip hidden and duplicate names")


class ScanFolder:
    key = "scan_folder"
    title = "Scan folder"
    description = "Finds every video in the input folder, including its subfolders."
    settings_model = ScanSettings
    transitions = {"none": "pieces"}
    position = "first"

    def run(self, data: None, settings: ScanSettings, ctx: StageContext) -> PiecesData:
        folder = ctx.input_folder
        if not os.path.isdir(folder):
            raise StageError(f"The folder {folder} does not exist")
        wanted = {"." + ext.lower().lstrip(".") for ext in settings.extensions}
        items: list[Piece] = []
        too_short: list[str] = []
        seen: set[str] = set()
        duplicates = 0
        files = self._files(folder, settings.include_subfolders, settings.max_files, ctx.log, settings.skip_hidden_and_duplicates)
        for path in files:
            name = os.path.basename(path)
            if os.path.splitext(path)[1].lower() not in wanted or not self._name_matches(name, settings):
                continue
            if settings.skip_hidden_and_duplicates:
                if name.lower() in seen:
                    duplicates += 1
                    continue
                seen.add(name.lower())
            try:
                duration = ctx.ffmpeg.duration(path)
            except FfmpegError as error:
                if error.code == 127:
                    raise StageError("FFmpeg is not installed") from error
                reason = error.tail[-1] if error.tail else str(error)
                ctx.log(f"Skipped {os.path.basename(path)}: it could not be read ({reason})")
                continue
            if duration <= 0 or duration < settings.min_length:
                too_short.append(os.path.basename(path))
                continue
            items.append(Piece(clip=path, clip_duration=duration))
        if duplicates:
            ctx.log(f"Skipped {duplicates} clip{'s' if duplicates != 1 else ''} with a name already used")
        if too_short:
            shown = ", ".join(too_short[:5]) + (f" and {len(too_short) - 5} more" if len(too_short) > 5 else "")
            ctx.log(f"Skipped {len(too_short)} clip{'s' if len(too_short) != 1 else ''} shorter than {settings.min_length:g} s: {shown}")
        if not items:
            raise StageError(f"No clips found in {folder}")
        ctx.log(f"Found {len(items)} clips")
        return PiecesData(items=items)

    @staticmethod
    def _name_matches(name: str, settings: ScanSettings) -> bool:
        if not settings.name_contains:
            return True
        found = settings.name_contains.lower() in name.lower()
        return found if settings.name_mode == "contains" else not found

    @staticmethod
    def _files(folder: str, recursive: bool, limit: int, log, skip_hidden: bool) -> list[str]:
        found: list[str] = []
        # shortcut: symlinked folders are not followed, symlinked files are; revisit if a library uses links
        for root, dirs, files in os.walk(folder, onerror=lambda e: log(f"Skipped folder {e.filename}: {e.strerror}")):
            if skip_hidden:
                dirs[:] = [d for d in dirs if not d.startswith(".")]
            found += [os.path.join(root, name) for name in files if not (skip_hidden and name.startswith("."))]
            if len(found) > limit:
                raise StageError(f"The folder holds more than {limit} files. Pick a smaller folder")
            if not recursive:
                break
        return sorted(os.path.abspath(path) for path in found)


STAGE = ScanFolder()
